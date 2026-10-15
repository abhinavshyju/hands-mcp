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
} from "@hands/core";
import { runtimeFromOpts } from "../runtime-opts.js";
import { hint, printJson, success, writeln } from "../ui/render.js";

export function registerConfig(program: Command): void {
  const cfg = program.command("config").description("View and edit Hands configuration");

  cfg
    .command("show")
    .option("--global", "Global ~/.hands/config.json")
    .option("--project", "Project .hands/config.json")
    .option("--effective", "Merged effective config")
    .option("--home <dir>")
    .action(
      async (opts: { global?: boolean; project?: boolean; effective?: boolean; home?: string }) => {
        const rt = runtimeFromOpts(opts);
        const client = DaemonClient.fromPaths(rt.paths);
        if (opts.effective) {
          if (await client.isRunning()) {
            printJson(await client.effectiveConfig());
            return;
          }
          printJson(loadMerged(rt.paths));
          return;
        }
        if (opts.project) {
          const ws = rt.workspaces.getActive();
          if (!ws) throw new Error("No active workspace");
          printJson(loadProjectConfig(ws.root));
          return;
        }
        if (await client.isRunning()) {
          printJson(await client.globalConfig());
          return;
        }
        printJson(loadGlobalConfig(rt.paths));
      },
    );

  cfg
    .command("get")
    .argument("<key>", "Dot path, e.g. port or tunnel.hostname")
    .option("--project", "Read from project config")
    .option("--home <dir>")
    .action((key: string, opts: { project?: boolean; home?: string }) => {
      const rt = runtimeFromOpts(opts);
      if (opts.project) {
        const ws = rt.workspaces.requireActive();
        const val = getConfigValue(
          loadProjectConfig(ws.root) as unknown as Record<string, unknown>,
          key,
        );
        writeln(JSON.stringify(val ?? null));
        return;
      }
      const val = getConfigValue(
        loadGlobalConfig(rt.paths) as unknown as Record<string, unknown>,
        key,
      );
      writeln(JSON.stringify(val ?? null));
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
        success("OK");
        return;
      }
      applyGlobalConfigKey(rt.paths, key, value);
      if (await client.isRunning()) {
        hint("(daemon running — restart hands for some global changes to apply)");
      }
      success("OK");
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
      success("OK");
    });

  cfg
    .command("path")
    .option("--project")
    .option("--home <dir>")
    .action((opts: { project?: boolean; home?: string }) => {
      const rt = runtimeFromOpts(opts);
      if (opts.project) {
        const ws = rt.workspaces.requireActive();
        writeln(projectConfigPath(ws.root));
        return;
      }
      writeln(rt.paths.globalConfig);
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
