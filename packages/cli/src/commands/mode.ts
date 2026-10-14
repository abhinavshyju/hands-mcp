import type { Command } from "commander";
import { MODE_POLICY_DEFAULTS, resolvePolicy, setModeScoped } from "@editer/core";
import { toolGroupSchema, type ToolGroup, type WorkspaceMode } from "@editer/shared";
import { runtimeFromOpts } from "../runtime-opts.js";
import { withDaemon } from "./config.js";

function printPolicySummary(mode: WorkspaceMode): void {
  const groups = toolGroupSchema.options;
  console.log(`Policy for mode=${mode}:`);
  for (const g of groups) {
    const action = resolvePolicy({ mode, group: g as ToolGroup, mutating: true });
    console.log(`  ${g}: ${action}`);
  }
  console.log(
    `Defaults: readonly=${JSON.stringify(MODE_POLICY_DEFAULTS.readonly)} review=${JSON.stringify(MODE_POLICY_DEFAULTS.review)} auto=${JSON.stringify(MODE_POLICY_DEFAULTS.auto)}`,
  );
}

export function registerMode(program: Command): void {
  const modeCmd = program.command("mode").description("View or set workspace safety mode");

  modeCmd
    .option("--home <dir>")
    .action(async (opts: { home?: string }) => {
      const rt = runtimeFromOpts(opts);
      const merged = rt.merged();
      const ws = rt.workspaces.getActive();
      console.log(`Mode: ${merged.mode} (source: ${merged.modeSource})`);
      if (ws) console.log(`Workspace: ${ws.name} (${ws.root})`);
      printPolicySummary(merged.mode);
    });

  modeCmd
    .command("set")
    .argument("<mode>", "readonly|review|auto")
    .option("--workspace <id>", "Workspace id or name")
    .option("--project", "Persist mode in project .editer/config.json")
    .option("--all", "Apply to every registered workspace")
    .option("--home <dir>")
    .action(async (mode: string, opts: { workspace?: string; project?: boolean; all?: boolean; home?: string }) => {
      const rt = runtimeFromOpts(opts);
      const m = mode as WorkspaceMode;
      const scope = opts.project ? "project" : "workspace";

      const applyOne = async (root: string, wsId: string) => {
        const ws = rt.workspaces.list().find((w) => w.id === wsId)!;
        try {
          await withDaemon(rt, root, (client) => client.setMode(m, scope, ws.id));
          console.log(`Mode for ${ws.name}: ${m} (daemon)`);
        } catch {
          setModeScoped(rt.paths, m, scope, ws);
          console.log(`Mode for ${ws.name}: ${m} (offline)`);
        }
      };

      if (opts.all) {
        for (const w of rt.workspaces.list()) {
          await applyOne(w.root, w.id);
        }
        return;
      }

      let ws = rt.workspaces.getActive();
      if (opts.workspace) {
        ws = rt.workspaces.list().find((w) => w.id === opts.workspace || w.name === opts.workspace);
      }
      if (!ws) throw new Error("No workspace. Run editer init or editer workspace add.");
      await applyOne(ws.root, ws.id);
    });

  program
    .command("auto")
    .description("Set mode to auto (no approvals for exec)")
    .option("--home <dir>")
    .action(async (opts: { home?: string }) => {
      console.warn("Warning: auto mode skips approval for shell commands.");
      const rt = runtimeFromOpts(opts);
      const ws = rt.workspaces.requireActive();
      try {
        await withDaemon(rt, ws.root, (c) => c.setMode("auto", "workspace"));
      } catch {
        setModeScoped(rt.paths, "auto", "workspace", ws);
      }
      console.log("Mode: auto");
    });

  program
    .command("readonly")
    .description("Set mode to readonly")
    .option("--home <dir>")
    .action(async (opts: { home?: string }) => {
      const rt = runtimeFromOpts(opts);
      const ws = rt.workspaces.requireActive();
      try {
        await withDaemon(rt, ws.root, (c) => c.setMode("readonly", "workspace"));
      } catch {
        setModeScoped(rt.paths, "readonly", "workspace", ws);
      }
      console.log("Mode: readonly");
    });
}