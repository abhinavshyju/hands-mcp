import { z } from "zod";
import { assertCommandAllowed, runCommand } from "@editer/core";
import { defineTool } from "./types.js";

export const execTools = [
  defineTool({
    name: "run_command",
    description: "Run a shell command in the workspace with timeout, output caps, and a scrubbed environment.",
    group: "exec",
    mutating: true,
    schema: z.object({
      command: z.string(),
      timeout_ms: z.number().int().positive().max(300_000).optional(),
    }),
    handler: async (ctx, args) => {
      assertCommandAllowed(args.command, {
        extraDeny: ctx.runtime.merged().denylist,
        allowlist: ctx.runtime.projectConfig().allowlistCommands,
      });
      const cwd = ctx.runtime.workspace().root;
      ctx.runtime.events.emit("process.output", { id: "sync", text: `$ ${args.command}\n` });
      const result = await runCommand({
        command: args.command,
        cwd,
        timeoutMs: args.timeout_ms,
      });
      ctx.runtime.events.emit("process.output", { id: "sync", text: result.combined });
      return result;
    },
  }),
  defineTool({
    name: "start_process",
    description: "Start a long-running process (dev server, watcher). Returns a handle immediately.",
    group: "exec",
    mutating: true,
    schema: z.object({ command: z.string() }),
    handler: (ctx, args) => {
      assertCommandAllowed(args.command, { extraDeny: ctx.runtime.merged().denylist });
      return ctx.runtime.processes.start(args.command, ctx.runtime.workspace().root);
    },
  }),
  defineTool({
    name: "list_processes",
    description: "List background processes started by the daemon.",
    group: "exec",
    mutating: false,
    schema: z.object({}),
    handler: (ctx) => ctx.runtime.processes.list(),
  }),
  defineTool({
    name: "read_process_output",
    description: "Read incremental output from a background process.",
    group: "exec",
    mutating: false,
    schema: z.object({
      id: z.string(),
      offset: z.number().int().min(0).default(0),
    }),
    handler: (ctx, args) => ctx.runtime.processes.readOutput(args.id, args.offset),
  }),
  defineTool({
    name: "stop_process",
    description: "Stop a background process (SIGTERM then SIGKILL).",
    group: "exec",
    mutating: true,
    schema: z.object({ id: z.string() }),
    handler: (ctx, args) => ctx.runtime.processes.stop(args.id),
  }),
];
