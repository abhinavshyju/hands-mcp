import { spawn } from "node:child_process";
import { DEFAULT_COMMAND_TIMEOUT_MS, DEFAULT_OUTPUT_BYTES } from "@editer/shared";
import { redactText } from "./redact.js";

export interface ExecResult {
  stdout: string;
  stderr: string;
  combined: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
}

const SCRUB_KEYS = [
  "EDITER_TOKEN",
  "EDITER_BEARER",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
];

export function scrubEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  for (const k of Object.keys(env)) {
    if (SCRUB_KEYS.includes(k) || (/TOKEN|SECRET|PASSWORD/i.test(k) && k.startsWith("EDITER_"))) {
      delete env[k];
    }
  }
  return env;
}

export function runCommand(opts: {
  command: string;
  cwd: string;
  timeoutMs?: number;
  maxBytes?: number;
  env?: NodeJS.ProcessEnv;
}): Promise<ExecResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_OUTPUT_BYTES;
  return new Promise((resolve) => {
    const child = spawn(opts.command, {
      cwd: opts.cwd,
      env: scrubEnv(opts.env),
      shell: true,
      detached: process.platform !== "win32",
    });
    let stdout = "";
    let stderr = "";
    let combined = "";
    let truncated = false;
    let timedOut = false;

    const push = (chunk: string, dest: "out" | "err") => {
      if (Buffer.byteLength(combined) + Buffer.byteLength(chunk) > maxBytes) {
        truncated = true;
        const remain = Math.max(0, maxBytes - Buffer.byteLength(combined));
        chunk = Buffer.from(chunk).subarray(0, remain).toString("utf8");
      }
      combined += chunk;
      if (dest === "out") stdout += chunk;
      else stderr += chunk;
    };

    child.stdout?.on("data", (d: Buffer) => push(d.toString("utf8"), "out"));
    child.stderr?.on("data", (d: Buffer) => push(d.toString("utf8"), "err"));

    const killTree = (signal: NodeJS.Signals) => {
      if (!child.pid) return;
      try {
        if (process.platform !== "win32") process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch {
        try {
          child.kill(signal);
        } catch {
          // already dead
        }
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killTree("SIGTERM");
      setTimeout(() => killTree("SIGKILL"), 1500);
    }, timeoutMs);

    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({
        stdout: redactText(stdout),
        stderr: redactText(stderr),
        combined: redactText(combined),
        exitCode: code,
        timedOut,
        truncated,
      });
    });
  });
}
