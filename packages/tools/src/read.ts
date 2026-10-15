import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { DEFAULT_READ_BYTES } from "@hands/shared";
import { loadGitignore } from "@hands/core";
import { defineTool } from "./types.js";

function readCapped(
  abs: string,
  startLine?: number,
  endLine?: number,
): { content: string; truncated: boolean; binary: boolean } {
  const buf = fs.readFileSync(abs);
  if (buf.includes(0)) return { content: "", truncated: false, binary: true };
  let text = buf.toString("utf8");
  if (startLine !== undefined || endLine !== undefined) {
    const lines = text.split("\n");
    const s = Math.max(1, startLine ?? 1) - 1;
    const e = endLine ?? lines.length;
    text = lines.slice(s, e).join("\n");
  }
  const truncated = Buffer.byteLength(text) > DEFAULT_READ_BYTES;
  if (truncated) text = Buffer.from(text).subarray(0, DEFAULT_READ_BYTES).toString("utf8");
  return { content: text, truncated, binary: false };
}

export const readTools = [
  defineTool({
    name: "read_file",
    description: "Read a UTF-8 file. Optional 1-based line range. Large files are truncated.",
    group: "read",
    mutating: false,
    schema: z.object({
      path: z.string(),
      start_line: z.number().int().positive().optional(),
      end_line: z.number().int().positive().optional(),
    }),
    handler: (ctx, args) => {
      const abs = ctx.runtime.resolve(args.path, "read");
      return { path: args.path, ...readCapped(abs, args.start_line, args.end_line) };
    },
  }),
  defineTool({
    name: "read_many_files",
    description: "Read multiple files in one call.",
    group: "read",
    mutating: false,
    schema: z.object({ paths: z.array(z.string()).min(1).max(50) }),
    handler: (ctx, args) =>
      args.paths.map((p) => {
        const abs = ctx.runtime.resolve(p, "read");
        return { path: p, ...readCapped(abs) };
      }),
  }),
  defineTool({
    name: "list_dir",
    description: "List a directory (gitignore-aware, depth-limited).",
    group: "read",
    mutating: false,
    schema: z.object({
      path: z.string().default("."),
      depth: z.number().int().min(1).max(5).default(2),
    }),
    handler: (ctx, args) => {
      const root = ctx.runtime.resolve(args.path, "read");
      const ignored = loadGitignore(ctx.runtime.workspace().root);
      const out: string[] = [];
      const walk = (dir: string, d: number, rel: string) => {
        if (d < 0) return;
        let entries: fs.Dirent[] = [];
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const e of entries) {
          const r = rel ? `${rel}/${e.name}` : e.name;
          if (ignored(r) || e.name === ".git") continue;
          out.push(e.isDirectory() ? `${r}/` : r);
          if (e.isDirectory() && d > 0) walk(path.join(dir, e.name), d - 1, r);
        }
      };
      walk(root, args.depth, args.path === "." ? "" : args.path);
      return { entries: out.slice(0, 2000) };
    },
  }),
  defineTool({
    name: "file_stat",
    description: "Return size, mtime, and type for a path.",
    group: "read",
    mutating: false,
    schema: z.object({ path: z.string() }),
    handler: (ctx, args) => {
      const abs = ctx.runtime.resolve(args.path, "read");
      const st = fs.statSync(abs);
      return {
        path: args.path,
        size: st.size,
        mtimeMs: st.mtimeMs,
        isFile: st.isFile(),
        isDirectory: st.isDirectory(),
      };
    },
  }),
];
