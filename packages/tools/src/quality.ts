import { z } from "zod";
import {
  assertCommandAllowed,
  detectPackageManager,
  listTemplates,
  resolveScript,
  runCommand,
  scaffoldProject,
} from "@hands/core";
import { defineTool } from "./types.js";

function parseSummary(output: string): { passed?: number; failed?: number; excerpt: string } {
  const fail = /(\d+)\s+fail/i.exec(output);
  const pass = /(\d+)\s+pass/i.exec(output);
  return {
    passed: pass ? Number(pass[1]) : undefined,
    failed: fail ? Number(fail[1]) : undefined,
    excerpt: output.slice(-2000),
  };
}

function qualityTool(kind: "test" | "lint" | "build") {
  return defineTool({
    name: `run_${kind === "test" ? "tests" : kind}`,
    description: `Run the project's ${kind} script, detected from package.json or toolchain.`,
    group: "quality",
    mutating: true,
    schema: z.object({}),
    handler: async (ctx) => {
      const root = ctx.runtime.workspace().root;
      const cmd = resolveScript(root, kind, ctx.runtime.merged().scripts[kind]);
      assertCommandAllowed(cmd);
      const result = await runCommand({ command: cmd, cwd: root });
      return { command: cmd, ...result, summary: parseSummary(result.combined) };
    },
  });
}

export const qualityTools = [
  qualityTool("test"),
  qualityTool("lint"),
  qualityTool("build"),
  defineTool({
    name: "install_packages",
    description: "Install packages using the detected package manager.",
    group: "highlevel",
    mutating: true,
    schema: z.object({
      packages: z.array(z.string()).default([]),
      dev: z.boolean().optional(),
    }),
    handler: async (ctx, args) => {
      const root = ctx.runtime.workspace().root;
      const pm = detectPackageManager(root);
      const pkg = args.packages.join(" ");
      let cmd: string;
      if (pm === "pnpm") cmd = pkg ? `pnpm add ${args.dev ? "-D " : ""}${pkg}` : "pnpm install";
      else if (pm === "yarn") cmd = pkg ? `yarn add ${args.dev ? "-D " : ""}${pkg}` : "yarn";
      else if (pm === "bun") cmd = pkg ? `bun add ${args.dev ? "-d " : ""}${pkg}` : "bun install";
      else if (pm === "cargo") cmd = pkg ? `cargo add ${pkg}` : "cargo fetch";
      else if (pm === "go") cmd = pkg ? `go get ${pkg}` : "go mod download";
      else if (pm === "pip") cmd = pkg ? `pip install ${pkg}` : "pip install -e .";
      else cmd = pkg ? `npm install ${args.dev ? "-D " : ""}${pkg}` : "npm install";
      assertCommandAllowed(cmd);
      return {
        command: cmd,
        ...(await runCommand({ command: cmd, cwd: root, timeoutMs: 180_000 })),
      };
    },
  }),
  defineTool({
    name: "scaffold_project",
    description: `Create starter files from a template. Templates: ${listTemplates().join(", ")}.`,
    group: "highlevel",
    mutating: true,
    schema: z.object({
      template: z.enum(["node", "typescript", "python"]).default("typescript"),
    }),
    handler: (ctx, args) => {
      const written = scaffoldProject(ctx.runtime.workspace().root, args.template);
      return { written, template: args.template };
    },
  }),
];
