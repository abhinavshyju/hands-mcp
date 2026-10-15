import { z } from "zod";
import { diffCheckpoint, listCheckpoints, restoreCheckpoint } from "@hands/core";
import { defineTool } from "./types.js";

export const checkpointTools = [
  defineTool({
    name: "list_checkpoints",
    description: "List shadow-git checkpoints for the active workspace.",
    group: "checkpoints",
    mutating: false,
    schema: z.object({}),
    handler: (ctx) => listCheckpoints(ctx.runtime.workspace().root),
  }),
  defineTool({
    name: "diff_checkpoint",
    description: "Diff the working tree against a checkpoint.",
    group: "checkpoints",
    mutating: false,
    schema: z.object({ id: z.string() }),
    handler: (ctx, args) => ({ diff: diffCheckpoint(ctx.runtime.workspace().root, args.id) }),
  }),
  defineTool({
    name: "restore_checkpoint",
    description: "Restore files from a checkpoint. Optionally a subset of files.",
    group: "checkpoints",
    mutating: true,
    schema: z.object({
      id: z.string(),
      files: z.array(z.string()).optional(),
    }),
    handler: (ctx, args) => restoreCheckpoint(ctx.runtime.workspace().root, args.id, args.files),
  }),
];
