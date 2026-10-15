import type { Command } from "commander";
import { runtimeFromOpts } from "../runtime-opts.js";
import { runReviewCommand } from "../console.js";
import path from "node:path";
import { hint, success, writeln } from "../ui/render.js";
import { styles } from "../ui/theme.js";

export function registerReview(program: Command): void {
  const approvals = program.command("approvals").description("Manage pending tool approvals");

  approvals
    .command("list")
    .option("--home <dir>")
    .action(async (opts: { home?: string }) => {
      const rt = runtimeFromOpts(opts);
      const ws = rt.workspaces.requireActive();
      const { ensureDaemon } = await import("@hands/core");
      const client = await ensureDaemon(rt.paths, { root: ws.root });
      const pending = await client.approvals();
      if (pending.length === 0) {
        hint("No pending approvals.");
        return;
      }
      for (const a of pending) {
        const age = Math.round((Date.now() - a.ts) / 1000);
        writeln(
          `${styles.dim(`${a.id.slice(0, 8)}…`)}  ${styles.bold(a.tool ?? "tool")}  ${a.summary}  ${styles.muted(`(${age}s)`)}`,
        );
      }
    });

  approvals
    .command("approve")
    .argument("[id]", "Approval id (prefix ok)")
    .option("--all", "Approve all pending")
    .option("--reason <reason>")
    .option("--home <dir>")
    .action(
      async (id: string | undefined, opts: { all?: boolean; reason?: string; home?: string }) => {
        const rt = runtimeFromOpts(opts);
        const ws = rt.workspaces.requireActive();
        const { ensureDaemon } = await import("@hands/core");
        const client = await ensureDaemon(rt.paths, { root: ws.root });
        if (opts.all) {
          const { count } = await client.decideAll(true, opts.reason ?? "cli-all");
          success(`Approved ${count}.`);
          return;
        }
        if (!id) throw new Error("Provide approval id or --all");
        const pending = await client.approvals();
        const match = pending.find((a) => a.id === id || a.id.startsWith(id));
        if (!match) throw new Error(`Approval not found: ${id}`);
        await client.decide(match.id, true, opts.reason ?? "cli");
        success("Approved.");
      },
    );

  approvals
    .command("reject")
    .argument("<id>")
    .option("--reason <reason>")
    .option("--home <dir>")
    .action(async (id: string, opts: { reason?: string; home?: string }) => {
      const rt = runtimeFromOpts(opts);
      const ws = rt.workspaces.requireActive();
      const { ensureDaemon } = await import("@hands/core");
      const client = await ensureDaemon(rt.paths, { root: ws.root });
      const pending = await client.approvals();
      const match = pending.find((a) => a.id === id || a.id.startsWith(id));
      if (!match) throw new Error(`Approval not found: ${id}`);
      await client.decide(match.id, false, opts.reason ?? "cli");
      success("Rejected.");
    });

  program
    .command("review")
    .description("Interactive approval console (auto-starts daemon if needed)")
    .option("--home <dir>")
    .option("--dir <dir>", "Workspace root", process.cwd())
    .action(async (opts: { home?: string; dir?: string }) => {
      const rt = runtimeFromOpts(opts);
      const root = path.resolve(opts.dir ?? process.cwd());
      rt.workspaces.add(root);
      await runReviewCommand(rt, root);
    });
}
