import type { Command } from "commander";
import { MODE_POLICY_DEFAULTS, resolvePolicy, setModeScoped } from "@hands/core";
import { toolGroupSchema, type ToolGroup, type WorkspaceMode } from "@hands/shared";
import { runtimeFromOpts } from "../runtime-opts.js";
import { withDaemon } from "./config.js";
import { hint, modeBadge, printKv, rule, success, writeWarn, writeln } from "../ui/render.js";
import { styles } from "../ui/theme.js";

function printPolicySummary(mode: WorkspaceMode): void {
  const groups = toolGroupSchema.options;
  rule(`policy · ${mode}`);
  for (const g of groups) {
    const action = resolvePolicy({ mode, group: g as ToolGroup, mutating: true });
    writeln(`  ${styles.muted(String(g))}: ${styles.bold(action)}`);
  }
  hint(
    `Defaults: readonly=${JSON.stringify(MODE_POLICY_DEFAULTS.readonly)} review=${JSON.stringify(MODE_POLICY_DEFAULTS.review)} auto=${JSON.stringify(MODE_POLICY_DEFAULTS.auto)}`,
  );
}

export function registerMode(program: Command): void {
  const modeCmd = program.command("mode").description("View or set workspace safety mode");

  modeCmd.option("--home <dir>").action(async (opts: { home?: string }) => {
    const rt = runtimeFromOpts(opts);
    const merged = rt.merged();
    const ws = rt.workspaces.getActive();
    printKv([
      {
        key: "Mode",
        value: merged.mode,
        valueStyle: (m) => `${modeBadge(m)} ${styles.dim(`(${merged.modeSource})`)}`,
      },
      ...(ws ? [{ key: "Workspace", value: `${ws.name} (${ws.root})` }] : []),
    ]);
    writeln("");
    printPolicySummary(merged.mode);
  });

  modeCmd
    .command("set")
    .argument("<mode>", "readonly|review|auto")
    .option("--workspace <id>", "Workspace id or name")
    .option("--project", "Persist mode in project .hands/config.json")
    .option("--all", "Apply to every registered workspace")
    .option("--home <dir>")
    .action(
      async (
        mode: string,
        opts: { workspace?: string; project?: boolean; all?: boolean; home?: string },
      ) => {
        const rt = runtimeFromOpts(opts);
        const m = mode as WorkspaceMode;
        const scope = opts.project ? "project" : "workspace";

        const applyOne = async (root: string, wsId: string) => {
          const ws = rt.workspaces.list().find((w) => w.id === wsId)!;
          try {
            await withDaemon(rt, root, (client) => client.setMode(m, scope, ws.id));
            success(`Mode for ${ws.name}: ${m} (daemon)`);
          } catch {
            setModeScoped(rt.paths, m, scope, ws);
            success(`Mode for ${ws.name}: ${m} (offline)`);
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
          ws = rt.workspaces
            .list()
            .find((w) => w.id === opts.workspace || w.name === opts.workspace);
        }
        if (!ws) throw new Error("No workspace. Run hands init or hands workspace add.");
        await applyOne(ws.root, ws.id);
      },
    );

  program
    .command("auto")
    .description("Set mode to auto (no approvals for exec)")
    .option("--home <dir>")
    .action(async (opts: { home?: string }) => {
      writeWarn("auto mode skips approval for shell commands.");
      const rt = runtimeFromOpts(opts);
      const ws = rt.workspaces.requireActive();
      try {
        await withDaemon(rt, ws.root, (c) => c.setMode("auto", "workspace"));
      } catch {
        setModeScoped(rt.paths, "auto", "workspace", ws);
      }
      success(`Mode: ${modeBadge("auto")}`);
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
      success(`Mode: ${modeBadge("readonly")}`);
    });
}
