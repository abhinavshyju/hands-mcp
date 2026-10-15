import { z } from "zod";
import { gitBranch, gitCommit, gitDiff, gitLog, gitStatus } from "@hands/core";
import { defineTool } from "./types.js";

export const gitTools = [
  defineTool({
    name: "git_status",
    description: "Show git status for the user repository (not the shadow checkpoint repo).",
    group: "git",
    mutating: false,
    schema: z.object({}),
    handler: (ctx) => ({ status: gitStatus(ctx.runtime.workspace().root) }),
  }),
  defineTool({
    name: "git_diff",
    description: "Show git diff for the user repository.",
    group: "git",
    mutating: false,
    schema: z.object({ staged: z.boolean().optional() }),
    handler: (ctx, args) => ({ diff: gitDiff(ctx.runtime.workspace().root, args.staged) }),
  }),
  defineTool({
    name: "git_log",
    description: "Show recent commits.",
    group: "git",
    mutating: false,
    schema: z.object({ n: z.number().int().positive().max(100).default(20) }),
    handler: (ctx, args) => ({ log: gitLog(ctx.runtime.workspace().root, args.n) }),
  }),
  defineTool({
    name: "git_branch",
    description: "List git branches.",
    group: "git",
    mutating: false,
    schema: z.object({}),
    handler: (ctx) => ({ branches: gitBranch(ctx.runtime.workspace().root) }),
  }),
  defineTool({
    name: "git_commit",
    description: "Create a git commit in the user repository. Gated by the approval engine.",
    group: "git",
    mutating: true,
    schema: z.object({ message: z.string().min(1) }),
    handler: (ctx, args) => ({
      result: gitCommit(ctx.runtime.workspace().root, args.message),
    }),
  }),
];
