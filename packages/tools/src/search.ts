import { z } from "zod";
import { grepSearch, globSearch } from "@hands/core";
import { defineTool } from "./types.js";

export const searchTools = [
  defineTool({
    name: "grep_search",
    description: "Search file contents with a regex (ripgrep). Results are capped.",
    group: "search",
    mutating: false,
    schema: z.object({
      pattern: z.string(),
      glob: z.string().optional(),
      glob_exclude: z.string().optional(),
      case_insensitive: z.boolean().optional(),
      context: z.number().int().min(0).max(5).optional(),
      max_matches: z.number().int().positive().max(500).optional(),
    }),
    handler: (ctx, args) =>
      grepSearch({
        cwd: ctx.runtime.workspace().root,
        pattern: args.pattern,
        glob: args.glob,
        globExclude: args.glob_exclude,
        caseInsensitive: args.case_insensitive,
        context: args.context,
        maxMatches: args.max_matches,
      }),
  }),
  defineTool({
    name: "glob_search",
    description: "Find files by glob pattern relative to the workspace root.",
    group: "search",
    mutating: false,
    schema: z.object({ pattern: z.string() }),
    handler: (ctx, args) => ({ files: globSearch(ctx.runtime.workspace().root, args.pattern) }),
  }),
  defineTool({
    name: "list_symbols",
    description: "List indexed symbols, optionally filtered by name prefix.",
    group: "search",
    mutating: false,
    schema: z.object({ prefix: z.string().optional() }),
    handler: async (ctx, args) => {
      await ctx.runtime.symbols.reindex(ctx.runtime.workspace().root);
      return ctx.runtime.symbols.list(ctx.runtime.workspace().root, args.prefix);
    },
  }),
  defineTool({
    name: "find_symbol_definition",
    description: "Find definition sites for a symbol name.",
    group: "search",
    mutating: false,
    schema: z.object({ name: z.string() }),
    handler: async (ctx, args) => {
      await ctx.runtime.symbols.reindex(ctx.runtime.workspace().root);
      return ctx.runtime.symbols.findDefinition(args.name);
    },
  }),
  defineTool({
    name: "find_references",
    description: "Find references via the symbol index plus a lexical grep fallback.",
    group: "search",
    mutating: false,
    schema: z.object({ name: z.string() }),
    handler: async (ctx, args) => {
      await ctx.runtime.symbols.reindex(ctx.runtime.workspace().root);
      const defs = ctx.runtime.symbols.findDefinition(args.name);
      const refs = grepSearch({
        cwd: ctx.runtime.workspace().root,
        pattern: `\\b${args.name}\\b`,
        maxMatches: 100,
      });
      return { definitions: defs, references: refs.hits };
    },
  }),
];
