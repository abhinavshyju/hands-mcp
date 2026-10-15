import readline from "node:readline/promises";
import type { HandsRuntime } from "@hands/core";
import { printBox, writeln } from "./ui/render.js";
import { styles } from "./ui/theme.js";

function approvalHint(req: { id: string; summary: string }): void {
  writeln("");
  printBox("approval", [
    req.summary,
    styles.dim(`id=${req.id}`),
    hintMessage("hands approvals approve …  |  hands review"),
  ]);
  writeln("");
}

function hintMessage(text: string): string {
  return styles.dim(text);
}

function interactiveApprovalBody(req: { id: string; summary: string }): string[] {
  return [req.summary, styles.dim(`id=${req.id.slice(0, 8)}…`), styles.dim("(y/n in console)")];
}

export function attachApprovalSurfaces(rt: HandsRuntime, interactive: boolean): () => void {
  const unsubs: Array<() => void> = [];
  if (interactive) {
    unsubs.push(
      rt.approvals.addSurface((req) => {
        writeln("");
        printBox("approval", interactiveApprovalBody(req));
        writeln("");
      }),
    );
    return () => {
      for (const u of unsubs) u();
    };
  }
  if (process.env.EDITER_CONTROL_SURFACE === "http") {
    unsubs.push(
      rt.approvals.addSurface((req) => {
        writeln("");
        printBox("approval", [
          req.summary,
          styles.dim(`id=${req.id}`),
          hintMessage("approve in MCP IDE or: hands review"),
        ]);
        writeln("");
      }),
    );
  } else if (!rt.headless && !interactive) {
    unsubs.push(
      rt.approvals.addSurface((req) => {
        writeln("");
        printBox("approval", [
          req.summary,
          styles.dim(`id=${req.id}`),
          hintMessage("open the UI or: hands review"),
        ]);
        writeln("");
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
