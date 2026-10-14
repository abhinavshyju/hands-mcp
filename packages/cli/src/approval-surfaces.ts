import readline from "node:readline/promises";
import type { EditerRuntime } from "@editer/core";

function approvalHint(req: { id: string; summary: string }): void {
  console.log(`\n[approval] ${req.summary}`);
  console.log(`  id=${req.id}`);
  console.log(`  editer approvals approve ${req.id.slice(0, 8)}…  |  editer review\n`);
}

export function attachApprovalSurfaces(rt: EditerRuntime, interactive: boolean): () => void {
  const unsubs: Array<() => void> = [];
  if (interactive) {
    unsubs.push(
      rt.approvals.addSurface((req) => {
        console.log(`\n[approval] ${req.summary}\n  id=${req.id.slice(0, 8)}…  (y/n in console)\n`);
      }),
    );
    return () => {
      for (const u of unsubs) u();
    };
  }
  if (process.env.EDITER_CONTROL_SURFACE === "http") {
    unsubs.push(
      rt.approvals.addSurface((req) => {
        console.log(`\n[approval] ${req.summary}\n  id=${req.id}  (approve in MCP IDE or: editer review)\n`);
      }),
    );
  } else if (!rt.headless && !interactive) {
    unsubs.push(
      rt.approvals.addSurface((req) => {
        console.log(`\n[approval] ${req.summary}\n  id=${req.id}  (open the UI or: editer review)\n`);
      }),
    );
  } else if (rt.headless && process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    unsubs.push(
      rt.approvals.addSurface((req) => {
        void (async () => {
          try {
            approvalHint(req);
            const answer = await rl.question(`Approve ${req.summary}? [y/N] `);
            rt.approvals.decide(req.id, /^y(es)?$/i.test(answer.trim()), "cli");
          } catch {
            rt.approvals.decide(req.id, false, "cli-closed");
          }
        })();
      }),
    );
  } else {
    unsubs.push(rt.approvals.addSurface(approvalHint));
  }
  return () => {
    for (const u of unsubs) u();
  };
}
