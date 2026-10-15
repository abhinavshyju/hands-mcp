import type { Command } from "commander";
import { projectConfigPath } from "@hands/core";
import { HANDS_DIRNAME, type WorkspaceMode } from "@hands/shared";
import { runtimeFromOpts } from "../runtime-opts.js";
import { ensureGlobalHome, ensureProjectDir, registerProjectWorkspace } from "../project-setup.js";
import { printKv, success } from "../ui/render.js";

export function registerInit(program: Command): void {
  program
    .command("init")
    .description(`Create ~/.hands and project ${HANDS_DIRNAME}/config.json`)
    .argument("[dir]", "project directory", ".")
    .option("--home <dir>")
    .option("--mode <mode>", "readonly|review|auto")
    .option("--template <name>", "node|typescript|python")
    .option("--no-workspace", "Skip registering the folder as a workspace")
    .action(
      (
        dir: string,
        opts: { home?: string; mode?: string; template?: string; noWorkspace?: boolean },
      ) => {
        const rt = runtimeFromOpts(opts);
        ensureGlobalHome(rt);
        const root = ensureProjectDir(dir, {
          mode: opts.mode as WorkspaceMode | undefined,
          template: opts.template,
        });
        const projectCfg = projectConfigPath(root);
        if (!opts.noWorkspace) {
          const rec = registerProjectWorkspace(
            rt,
            root,
            undefined,
            opts.mode as WorkspaceMode | undefined,
          );
          success("Initialized Hands");
          printKv([
            { key: "Home", value: rt.paths.home },
            { key: "Project", value: projectCfg },
            { key: "Workspace", value: `${rec.name} (${rec.root})` },
          ]);
        } else {
          success("Initialized Hands");
          printKv([
            { key: "Home", value: rt.paths.home },
            { key: "Project", value: projectCfg },
          ]);
        }
      },
    );
}
