import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { type AuditEvent, auditEventSchema } from "@hands/shared";
import type { HandsPaths } from "./paths.js";
import { ensureDir } from "./paths.js";
import { redactValue } from "./redact.js";
import type { EventBus } from "./events.js";

export class AuditLog {
  constructor(
    private readonly paths: HandsPaths,
    private readonly events: EventBus,
  ) {}

  private fileFor(ts = Date.now()): string {
    const day = new Date(ts).toISOString().slice(0, 10);
    ensureDir(this.paths.logs);
    return path.join(this.paths.logs, `${day}.jsonl`);
  }

  record(partial: Omit<AuditEvent, "id" | "ts"> & { ts?: number; id?: string }): AuditEvent {
    const event = auditEventSchema.parse({
      id: partial.id ?? randomUUID(),
      ts: partial.ts ?? Date.now(),
      ...partial,
      args: redactValue(partial.args),
      result: redactValue(partial.result),
    });
    fs.appendFileSync(this.fileFor(event.ts), `${JSON.stringify(event)}\n`, "utf8");
    this.events.emit(event.type, event);
    return event;
  }

  query(opts: { limit?: number; tool?: string; workspaceId?: string } = {}): AuditEvent[] {
    const limit = opts.limit ?? 200;
    if (!fs.existsSync(this.paths.logs)) return [];
    const files = fs
      .readdirSync(this.paths.logs)
      .filter((f) => f.endsWith(".jsonl"))
      .sort()
      .reverse();
    const out: AuditEvent[] = [];
    for (const file of files) {
      const lines = fs.readFileSync(path.join(this.paths.logs, file), "utf8").split("\n").reverse();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = auditEventSchema.parse(JSON.parse(line));
          if (opts.tool && parsed.tool !== opts.tool) continue;
          if (opts.workspaceId && parsed.workspaceId !== opts.workspaceId) continue;
          out.push(parsed);
          if (out.length >= limit) return out;
        } catch {
          // skip corrupt lines
        }
      }
    }
    return out;
  }

  clear(): void {
    if (!fs.existsSync(this.paths.logs)) return;
    for (const file of fs.readdirSync(this.paths.logs)) {
      if (!file.endsWith(".jsonl")) continue;
      fs.unlinkSync(path.join(this.paths.logs, file));
    }
  }
}
