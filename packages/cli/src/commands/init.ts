import path from "node:path";
import type { Command } from "commander";
import { runtimeFromOpts } from "../runtime-opts.js";
import { ensureGlobalHome, ensureProjectDir, registerProjectWorkspace } from "../project-setup.js";
import type { WorkspaceMode } from "@editer/shared";

export function registerInit(program: Command): void {
  program
    .command("init")
    .description("Create ~/.editer and project .editer/config.json")
    .argument("[dir]", "project directory", ".")
    .option("--home <dir>")
    .option("--mode <mode>", "readonly|review|auto")
    .option("--template <name>", "node|typescript|python")
    .option("--no-workspace", "Skip registering the folder as a workspace")
    .action((dir: string, opts: { home?: string; mode?: string; template?: string; noWorkspace?: boolean }) => {
      const rt = runtimeFromOpts(opts);
      ensureGlobalHome(rt);
      const root = ensureProjectDir(dir, {
        mode: opts.mode as WorkspaceMode | undefined,
        template: opts.template,
      });
      if (!opts.noWorkspace) {
        const rec = registerProjectWorkspace(rt, root, undefined, opts.mode as WorkspaceMode | undefined);
        console.log(`Initialized ${rt.paths.home}`);
        console.log(`Project config: ${path.join(root, ".editer/config.json")}`);
        console.log(`Active workspace: ${rec.name} (${rec.root})`);
      } else {
        console.log(`Initialized ${rt.paths.home}`);
        console.log(`Project config: ${path.join(root, ".editer/config.json")}`);
      }
    });
}
