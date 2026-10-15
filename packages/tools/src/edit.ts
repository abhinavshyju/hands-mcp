import { z } from "zod";
import {
  applyPatchToFiles,
  createFile,
  deletePath,
  movePath,
  multiEdit,
  strReplace,
  writeFile,
  type EditOptions,
} from "@hands/core";
import { defineTool, type ToolContext } from "./types.js";

const EDIT_FOOTER =
  " Supported sources are auto-formatted with Prettier when .hands/config.json formatOnEdit is true. Call get_coding_guidance before large refactors.";

function editFormatOptions(ctx: ToolContext): EditOptions {
  return { formatOnEdit: ctx.runtime.merged().project.formatOnEdit };
}

export const editTools = [
  defineTool({
    name: "write_file",
    description:
      "Create or overwrite a file with the given contents. Deterministic; preserves line endings." +
      EDIT_FOOTER,
    group: "edit",
    mutating: true,
    schema: z.object({ path: z.string(), contents: z.string() }),
    handler: async (ctx, args) => {
      const abs = ctx.runtime.resolve(args.path, "write");
      return writeFile(abs, args.contents, editFormatOptions(ctx));
    },
  }),
  defineTool({
    name: "create_file",
    description: "Create a new file. Fails if it already exists." + EDIT_FOOTER,
    group: "edit",
    mutating: true,
    schema: z.object({ path: z.string(), contents: z.string() }),
    handler: async (ctx, args) => {
      const abs = ctx.runtime.resolve(args.path, "write");
      return createFile(abs, args.contents, editFormatOptions(ctx));
    },
  }),
  defineTool({
    name: "str_replace",
    description:
      "Exact string replacement. Fails if the match is missing or not unique unless expected_occurrences is set." +
      EDIT_FOOTER,
    group: "edit",
    mutating: true,
    schema: z.object({
      path: z.string(),
      old_string: z.string(),
      new_string: z.string(),
      expected_occurrences: z.number().int().positive().optional(),
    }),
    handler: async (ctx, args) => {
      const abs = ctx.runtime.resolve(args.path, "write");
      return strReplace(
        abs,
        args.old_string,
        args.new_string,
        args.expected_occurrences,
        editFormatOptions(ctx),
      );
    },
  }),
  defineTool({
    name: "multi_edit",
    description: "Apply several str_replace operations to one file transactionally." + EDIT_FOOTER,
    group: "edit",
    mutating: true,
    schema: z.object({
      path: z.string(),
      edits: z
        .array(
          z.object({
            old_string: z.string(),
            new_string: z.string(),
            expected_occurrences: z.number().int().positive().optional(),
          }),
        )
        .min(1),
    }),
    handler: async (ctx, args) => {
      const abs = ctx.runtime.resolve(args.path, "write");
      return multiEdit(abs, args.edits, editFormatOptions(ctx));
    },
  }),
  defineTool({
    name: "apply_patch",
    description:
      "Apply a unified diff. Strict hunk verification; all-or-nothing across files." + EDIT_FOOTER,
    group: "edit",
    mutating: true,
    schema: z.object({ patch: z.string() }),
    handler: async (ctx, args) =>
      applyPatchToFiles(
        ctx.runtime.workspace().root,
        args.patch,
        (rel) => ctx.runtime.resolve(rel, "write"),
        editFormatOptions(ctx),
      ),
  }),
  defineTool({
    name: "delete_path",
    description: "Delete a file or directory inside the workspace.",
    group: "edit",
    mutating: true,
    schema: z.object({ path: z.string() }),
    handler: (ctx, args) => {
      deletePath(ctx.runtime.resolve(args.path, "write"));
      return { deleted: args.path };
    },
  }),
  defineTool({
    name: "move_path",
    description: "Move or rename a path inside the workspace.",
    group: "edit",
    mutating: true,
    schema: z.object({ from: z.string(), to: z.string() }),
    handler: (ctx, args) => {
      movePath(ctx.runtime.resolve(args.from, "write"), ctx.runtime.resolve(args.to, "write"));
      return { from: args.from, to: args.to };
    },
  }),
];
