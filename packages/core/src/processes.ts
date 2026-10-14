import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { type ProcessRecord } from "@editer/shared";
import type { EventBus } from "./events.js";
import { scrubEnv } from "./exec.js";
import { redactText } from "./redact.js";

interface Managed {
  record: ProcessRecord;
  child: ChildProcess;
  logs: string;
  offset: number;
}

const PORT_RE = /(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})/;

export class ProcessManager {
  private procs = new Map<string, Managed>();

  constructor(private readonly events: EventBus) {}

  start(command: string, cwd: string): ProcessRecord {
    const id = randomUUID();
    const child = spawn(command, { cwd, env: scrubEnv(), shell: true });
    const record: ProcessRecord = {
      id,
      command,
      cwd,
      pid: child.pid,
      startedAt: Date.now(),
      status: "running",
    };
    const managed: Managed = { record, child, logs: "", offset: 0 };
    this.procs.set(id, managed);

    const onData = (chunk: Buffer) => {
      const text = redactText(chunk.toString("utf8"));
      managed.logs += text;
      if (managed.logs.length > 1_000_000) {
        managed.logs = managed.logs.slice(-800_000);
      }
      const m = PORT_RE.exec(text);
      if (m && !record.detectedPort) record.detectedPort = Number(m[1]);
      this.events.emit("process.output", { id, text, detectedPort: record.detectedPort });
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("close", (code) => {
      record.status = "exited";
      record.exitCode = code;
      record.exitedAt = Date.now();
      this.events.emit("process.exited", record);
    });
    this.events.emit("process.started", record);
    return { ...record };
  }

  list(): ProcessRecord[] {
    return [...this.procs.values()].map((p) => ({ ...p.record }));
  }

  readOutput(id: string, offset = 0): { text: string; nextOffset: number; record: ProcessRecord } {
    const p = this.procs.get(id);
    if (!p) throw new Error(`Unknown process: ${id}`);
    const text = p.logs.slice(offset);
    return { text, nextOffset: offset + text.length, record: { ...p.record } };
  }

  async stop(id: string): Promise<ProcessRecord> {
    const p = this.procs.get(id);
    if (!p) throw new Error(`Unknown process: ${id}`);
    if (p.record.status !== "running") return { ...p.record };
    p.child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        p.child.kill("SIGKILL");
        resolve();
      }, 3000);
      p.child.once("close", () => {
        clearTimeout(t);
        resolve();
      });
    });
    p.record.status = "killed";
    p.record.exitedAt = Date.now();
    return { ...p.record };
  }

  async stopAll(): Promise<void> {
    await Promise.all(
      [...this.procs.keys()].map((id) =>
        this.stop(id).catch(() => undefined),
      ),
    );
  }
}
