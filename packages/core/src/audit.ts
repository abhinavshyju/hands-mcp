import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { type AuditEvent, auditEventSchema } from "@editer/shared";
import type { EditerPaths } from "./paths.js";
import { ensureDir } from "./paths.js";
import { redactValue } from "./redact.js";
import type { EventBus } from "./events.js";

export class AuditLog {
  constructor(
    private readonly paths: EditerPaths,
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

  query(opts: { limit?: number; tool?: string } = {}): AuditEvent[] {
    const limit = opts.limit ?? 200;
    ensureDir(this.paths.logs);
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
          out.push(parsed);
          if (out.length >= limit) return out;
        } catch {
          // skip corrupt lines
        }
      }
    }
    return out;
  }
}
