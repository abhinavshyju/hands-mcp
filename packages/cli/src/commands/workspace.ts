import path from "node:path";
import type { Command } from "commander";
import { runtimeFromOpts } from "../runtime-opts.js";
import { ensureGlobalHome, ensureProjectDir, registerProjectWorkspace } from "../project-setup.js";
import type { WorkspaceMode } from "@hands/shared";
import { withDaemon } from "./config.js";
import { modeBadge, success, writeln } from "../ui/render.js";
import { styles } from "../ui/theme.js";

export function registerWorkspace(program: Command): void {
  const ws = program.command("workspace");

  ws.command("add")
    .argument("<root>")
    .option("--name <name>")
    .option("--home <dir>")
    .action(async (root: string, opts: { name?: string; home?: string }) => {
      const rt = runtimeFromOpts(opts);
      const resolved = path.resolve(root);
      try {
        await withDaemon(rt, resolved, (c) => c.addWorkspace(resolved, opts.name));
      } catch {
        const rec = rt.workspaces.add(resolved, opts.name);
        success(`Active workspace: ${rec.name} (${rec.root})`);
        return;
      }
      success(`Active workspace: ${opts.name ?? path.basename(resolved)} (${resolved})`);
    });

  ws.command("list")
    .option("--home <dir>")
    .action((opts: { home?: string }) => {
      const rt = runtimeFromOpts(opts);
      for (const w of rt.workspaces.list()) {
        const mark = rt.workspaces.getActive()?.id === w.id ? "*" : " ";
        const active = mark === "*" ? styles.accent("*") : " ";
        writeln(
          `${active} ${styles.dim(w.id)}  ${modeBadge(w.mode)}  ${w.name}  ${styles.muted(w.root)}`,
        );
      }
    });

  ws.command("remove")
    .argument("<id>")
    .option("--home <dir>")
    .action(async (id: string, opts: { home?: string }) => {
      const rt = runtimeFromOpts(opts);
      try {
        const client = (await import("@hands/core")).DaemonClient.fromPaths(rt.paths);
        if (await client.isRunning()) {
          await client.removeWorkspace(id);
          return;
        }
      } catch {
        // offline
      }
      runtimeFromOpts(opts).workspaces.remove(id);
    });

  ws.command("use")
    .argument("<id>")
    .description("Activate a workspace")
    .option("--home <dir>")
    .action(async (id: string, opts: { home?: string }) => {
      const rt = runtimeFromOpts(opts);
      const w = rt.workspaces.list().find((x) => x.id === id || x.name === id);
      if (!w) throw new Error(`Workspace not found: ${id}`);
      try {
        await withDaemon(rt, w.root, (c) => c.activateWorkspace(id));
      } catch {
        rt.workspaces.setActive(id);
      }
      success(`Active: ${w.name}`);
    });

  ws.command("mode")
    .argument("<id>")
    .argument("<mode>")
    .option("--home <dir>")
    .action(async (id: string, mode: string, opts: { home?: string }) => {
      const rt = runtimeFromOpts(opts);
      const w = rt.workspaces.list().find((x) => x.id === id || x.name === id);
      if (!w) throw new Error(`Workspace not found: ${id}`);
      try {
        await withDaemon(rt, w.root, (c) => c.setWorkspaceMode(id, mode as WorkspaceMode));
      } catch {
        rt.workspaces.setMode(id, mode as WorkspaceMode);
      }
      success(`Mode for ${w.name}: ${modeBadge(mode)}`);
    });

  ws.command("init")
    .description("Initialize project config in cwd and register workspace")
    .option("--mode <mode>")
    .option("--template <name>")
    .option("--home <dir>")
    .action((opts: { mode?: string; template?: string; home?: string }) => {
      const rt = runtimeFromOpts(opts);
      ensureGlobalHome(rt);
      const root = ensureProjectDir(".", {
        mode: opts.mode as WorkspaceMode | undefined,
        template: opts.template,
      });
      const rec = registerProjectWorkspace(
        rt,
        root,
        undefined,
        opts.mode as WorkspaceMode | undefined,
      );
      success(`Workspace: ${rec.name} (${rec.root})`);
    });
}
