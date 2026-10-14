import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { Command } from "commander";
import {
  applyGlobalConfigKey,
  applyProjectConfigKey,
  DaemonClient,
  ensureDaemon,
  getConfigValue,
  loadGlobalConfig,
  loadMerged,
  loadProjectConfig,
  projectConfigPath,
  unsetGlobalConfigKey,
  unsetProjectConfigKey,
} from "@editer/core";
import { runtimeFromOpts } from "../runtime-opts.js";

export function registerConfig(program: Command): void {
  const cfg = program.command("config").description("View and edit editer configuration");

  cfg
    .command("show")
    .option("--global", "Global ~/.editer/config.json")
    .option("--project", "Project .editer/config.json")
    .option("--effective", "Merged effective config")
    .option("--home <dir>")
    .action(async (opts: { global?: boolean; project?: boolean; effective?: boolean; home?: string }) => {
      const rt = runtimeFromOpts(opts);
      const client = DaemonClient.fromPaths(rt.paths);
      if (opts.effective) {
        if (await client.isRunning()) {
          console.log(JSON.stringify(await client.effectiveConfig(), null, 2));
          return;
        }
        console.log(JSON.stringify(loadMerged(rt.paths), null, 2));
        return;
      }
      if (opts.project) {
        const ws = rt.workspaces.getActive();
        if (!ws) throw new Error("No active workspace");
        console.log(JSON.stringify(loadProjectConfig(ws.root), null, 2));
        return;
      }
      if (await client.isRunning()) {
        console.log(JSON.stringify(await client.globalConfig(), null, 2));
        return;
      }
      console.log(JSON.stringify(loadGlobalConfig(rt.paths), null, 2));
    });

  cfg
    .command("get")
    .argument("<key>", "Dot path, e.g. port or tunnel.hostname")
    .option("--project", "Read from project config")
    .option("--home <dir>")
    .action((key: string, opts: { project?: boolean; home?: string }) => {
      const rt = runtimeFromOpts(opts);
      if (opts.project) {
        const ws = rt.workspaces.requireActive();
        const val = getConfigValue(loadProjectConfig(ws.root) as unknown as Record<string, unknown>, key);
        console.log(JSON.stringify(val ?? null));
        return;
      }
      const val = getConfigValue(loadGlobalConfig(rt.paths) as unknown as Record<string, unknown>, key);
      console.log(JSON.stringify(val ?? null));
    });

  cfg
    .command("set")
    .argument("<key>")
    .argument("<value>")
    .option("--project", "Write project config")
    .option("--home <dir>")
    .action(async (key: string, value: string, opts: { project?: boolean; home?: string }) => {
      const rt = runtimeFromOpts(opts);
      const client = DaemonClient.fromPaths(rt.paths);
      const ws = rt.workspaces.getActive();
      if (opts.project) {
        if (!ws) throw new Error("No active workspace");
        applyProjectConfigKey(ws.root, key, value);
        if (await client.isRunning()) {
          await client.setProjectConfig(
            loadProjectConfig(ws.root) as unknown as Record<string, unknown>,
          );
        }
        console.log("OK");
        return;
      }
      applyGlobalConfigKey(rt.paths, key, value);
      if (await client.isRunning()) {
        console.log("(daemon running — restart editer for some global changes to apply)");
      }
      console.log("OK");
    });

  cfg
    .command("unset")
    .argument("<key>")
    .option("--project")
    .option("--home <dir>")
    .action((key: string, opts: { project?: boolean; home?: string }) => {
      const rt = runtimeFromOpts(opts);
      if (opts.project) {
        const ws = rt.workspaces.requireActive();
        unsetProjectConfigKey(ws.root, key);
      } else {
        unsetGlobalConfigKey(rt.paths, key);
      }
      console.log("OK");
    });

  cfg
    .command("path")
    .option("--project")
    .option("--home <dir>")
    .action((opts: { project?: boolean; home?: string }) => {
      const rt = runtimeFromOpts(opts);
      if (opts.project) {
        const ws = rt.workspaces.requireActive();
        console.log(projectConfigPath(ws.root));
        return;
      }
      console.log(rt.paths.globalConfig);
    });

  cfg
    .command("edit")
    .option("--project")
    .option("--home <dir>")
    .action((opts: { project?: boolean; home?: string }) => {
      const rt = runtimeFromOpts(opts);
      const editor = process.env.EDITOR ?? "nano";
      const file = opts.project
        ? projectConfigPath(rt.workspaces.requireActive().root)
        : rt.paths.globalConfig;
      if (!fs.existsSync(file)) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, "{}\n", "utf8");
      }
      spawnSync(editor, [file], { stdio: "inherit" });
    });
}

export async function withDaemon<T>(
  rt: ReturnType<typeof runtimeFromOpts>,
  root: string,
  fn: (client: DaemonClient) => Promise<T>,
): Promise<T> {
  const client = await ensureDaemon(rt.paths, { root });
  return fn(client);
}
