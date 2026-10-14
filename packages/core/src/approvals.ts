import { randomUUID } from "node:crypto";
import {
  ApprovalDeniedError,
  type ApprovalRequest,
  type ToolGroup,
} from "@editer/shared";
import type { EventBus } from "./events.js";
import type { AuditLog } from "./audit.js";

interface Pending {
  request: ApprovalRequest;
  resolve: (approved: boolean, reason?: string) => void;
}

export type ApprovalSurface = (req: ApprovalRequest) => void;

export class ApprovalManager {
  private pending = new Map<string, Pending>();
  private surfaces = new Set<ApprovalSurface>();

  constructor(
    private readonly events: EventBus,
    private readonly audit: AuditLog,
    private readonly timeoutMs: number,
  ) {}

  addSurface(surface: ApprovalSurface): () => void {
    this.surfaces.add(surface);
    return () => {
      this.surfaces.delete(surface);
    };
  }

  hasSurface(): boolean {
    return this.surfaces.size > 0;
  }

  listPending(): ApprovalRequest[] {
    return [...this.pending.values()].map((p) => p.request);
  }

  async request(input: {
    tool: string;
    group: ToolGroup;
    summary: string;
    preview?: string;
    diff?: string;
    command?: string;
    clientId?: string;
    clientName?: string;
    workspaceId: string;
    timeoutMs?: number;
  }): Promise<void> {
    const timeoutMs = input.timeoutMs ?? this.timeoutMs;
    if (this.surfaces.size === 0) {
      throw new ApprovalDeniedError(
        "Approval required but no UI/CLI surface is attached. Retry after opening the dashboard or run with an attended CLI.",
      );
    }

    const request: ApprovalRequest = {
      id: randomUUID(),
      ts: Date.now(),
      tool: input.tool,
      group: input.group,
      summary: input.summary,
      preview: input.preview,
      diff: input.diff,
      command: input.command,
      clientId: input.clientId,
      clientName: input.clientName,
      workspaceId: input.workspaceId,
      timeoutMs,
      status: "pending",
    };

    this.audit.record({ type: "approval.requested", tool: input.tool, args: request });
    this.events.emit("approval.requested", request);
    for (const s of this.surfaces) s(request);

    const approved = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.finish(request.id, "timeout", "Approval timed out; retry the tool call.");
      }, timeoutMs);
      this.pending.set(request.id, {
        request,
        resolve: (ok, _reason) => {
          clearTimeout(timer);
          resolve(ok);
        },
      });
    });

    if (!approved) {
      const current = this.listFinished(request.id);
      throw new ApprovalDeniedError(current ?? "Approval denied");
    }
  }

  private finishedReasons = new Map<string, string>();

  private listFinished(id: string): string | undefined {
    return this.finishedReasons.get(id);
  }

  decide(id: string, approved: boolean, reason?: string): ApprovalRequest {
    const status = approved ? "approved" : "rejected";
    return this.finish(id, status, reason);
  }

  decideAll(approved: boolean, reason?: string): number {
    const ids = [...this.pending.keys()];
    for (const id of ids) {
      this.decide(id, approved, reason);
    }
    return ids.length;
  }

  private finish(
    id: string,
    status: "approved" | "rejected" | "timeout",
    reason?: string,
  ): ApprovalRequest {
    const pending = this.pending.get(id);
    if (!pending) throw new Error(`Unknown approval: ${id}`);
    this.pending.delete(id);
    pending.request.status = status;
    pending.request.reason = reason;
    this.finishedReasons.set(id, reason ?? status);
    this.audit.record({
      type: `approval.${status}`,
      tool: pending.request.tool,
      args: pending.request,
    });
    this.events.emit(`approval.${status}`, pending.request);
    pending.resolve(status === "approved", reason);
    return pending.request;
  }
}
