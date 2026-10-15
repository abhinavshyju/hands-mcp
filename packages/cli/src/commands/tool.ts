import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import { ensureDir } from "@hands/core";
import { pluginScaffold } from "@hands/tools";
import { runtimeFromOpts } from "../runtime-opts.js";
import { success } from "../ui/render.js";

export function registerTool(program: Command): void {
  const tool = program.command("tool");
  tool
    .command("new")
    .argument("<name>")
    .option("--home <dir>")
    .action((name: string, opts: { home?: string }) => {
      const rt = runtimeFromOpts(opts);
      ensureDir(rt.paths.pluginDir);
      const file = path.join(rt.paths.pluginDir, `${name}.js`);
      fs.writeFileSync(file, pluginScaffold(name), "utf8");
      success(`Wrote ${file}`);
    });
}
