import { z, type ZodType } from "zod";
import {
  ApprovalDeniedError,
  EditerError,
  type ToolGroup,
} from "@editer/shared";
import { assertAllowed, snapshotFiles, resolvePolicy } from "@editer/core";
import { stripMediaForAudit } from "./media.js";
import type { ToolContext, ToolDefinition } from "./types.js";

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private onChangeHandlers = new Set<() => void>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
    this.notify();
  }

  unregister(name: string): void {
    this.tools.delete(name);
    this.notify();
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  onChange(handler: () => void): () => void {
    this.onChangeHandlers.add(handler);
    return () => this.onChangeHandlers.delete(handler);
  }

  private notify(): void {
    for (const h of this.onChangeHandlers) h();
  }

  async invoke(name: string, ctx: ToolContext, rawArgs: unknown): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new EditerError("UNKNOWN_TOOL", `Unknown tool: ${name}`);
    const args = tool.schema.parse(rawArgs ?? {});
    const merged = ctx.runtime.merged();
    const ws = ctx.runtime.workspace();
    const action =
      tool.requiredMode ??
      resolvePolicy({
        mode: merged.mode,
        group: tool.group,
        mutating: tool.mutating,
        overrides: merged.toolGroupOverrides,
      });
    assertAllowed(action);

    const files = collectPaths(args);
    let checkpointId: string | undefined;
    if (tool.mutating && files.length > 0) {
      const abs = files.map((f) => {
        try {
          return ctx.runtime.resolve(String(f), "write");
        } catch {
          return ctx.runtime.resolve(String(f), "read");
        }
      });
      checkpointId = snapshotFiles(ws.root, abs, {
        tool: tool.name,
        clientName: ctx.clientName,
      }).id;
    }

    if (action === "approve") {
      await ctx.runtime.approvals.request({
        tool: tool.name,
        group: tool.group,
        summary: `${tool.name} ${summarize(args)}`,
        preview: JSON.stringify(args, null, 2).slice(0, 4000),
        command: typeof (args as { command?: string }).command === "string" ? (args as { command: string }).command : undefined,
        clientId: ctx.clientId,
        clientName: ctx.clientName,
        workspaceId: ws.id,
      });
    }

    const started = Date.now();
    try {
      const result = await tool.handler(ctx, args);
      const audited = stripMediaForAudit(result);
      ctx.runtime.audit.record({
        type: "tool.finished",
        tool: tool.name,
        mutating: tool.mutating,
        args,
        result: audited,
        clientId: ctx.clientId,
        clientName: ctx.clientName,
        workspaceId: ws.id,
        durationMs: Date.now() - started,
        checkpointId,
      });
      ctx.runtime.events.emit("tool.finished", { tool: tool.name, result: audited, checkpointId });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.runtime.audit.record({
        type: "tool.error",
        tool: tool.name,
        mutating: tool.mutating,
        args,
        error: message,
        clientId: ctx.clientId,
        clientName: ctx.clientName,
        workspaceId: ws.id,
        durationMs: Date.now() - started,
        checkpointId,
      });
      if (err instanceof ApprovalDeniedError || err instanceof EditerError) throw err;
      throw new EditerError("TOOL_ERROR", message);
    }
  }
}

function collectPaths(args: unknown): string[] {
  if (!args || typeof args !== "object") return [];
  const rec = args as Record<string, unknown>;
  const keys = ["path", "from", "to", "file"];
  const out: string[] = [];
  for (const k of keys) {
    if (typeof rec[k] === "string") out.push(rec[k] as string);
  }
  if (Array.isArray(rec.paths)) out.push(...rec.paths.filter((p) => typeof p === "string"));
  if (Array.isArray(rec.files)) out.push(...rec.files.filter((p) => typeof p === "string"));
  return out;
}

function summarize(args: unknown): string {
  try {
    return JSON.stringify(args).slice(0, 200);
  } catch {
    return "";
  }
}

export function jsonSchemaOf(schema: ZodType): Record<string, unknown> {
  // Lazy: consumers use zod-to-json-schema in the server package.
  void schema;
  return {};
}

export const emptySchema = z.object({});
export type { ToolGroup };
