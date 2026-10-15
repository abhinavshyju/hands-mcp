import { describe, expect, it } from "vitest";
import { ApprovalDeniedError } from "@hands/shared";
import { ApprovalManager } from "./approvals.js";
import { AuditLog } from "./audit.js";
import { EventBus } from "./events.js";
import { resolveHandsPaths } from "./paths.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function mgr(timeout = 50): ApprovalManager {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "editer-appr-"));
  const events = new EventBus();
  const audit = new AuditLog(resolveHandsPaths(home), events);
  return new ApprovalManager(events, audit, timeout);
}

describe("approvals", () => {
  it("denies when no surface is attached", async () => {
    const m = mgr();
    await expect(
      m.request({
        tool: "run_command",
        group: "exec",
        summary: "ls",
        workspaceId: "w",
      }),
    ).rejects.toBeInstanceOf(ApprovalDeniedError);
  });

  it("resolves on approve", async () => {
    const m = mgr(5000);
    m.addSurface((req) => {
      setTimeout(() => m.decide(req.id, true), 10);
    });
    await m.request({
      tool: "run_command",
      group: "exec",
      summary: "ls",
      workspaceId: "w",
    });
  });

  it("rejects on timeout", async () => {
    const m = mgr(30);
    m.addSurface(() => undefined);
    await expect(
      m.request({
        tool: "run_command",
        group: "exec",
        summary: "ls",
        workspaceId: "w",
      }),
    ).rejects.toBeInstanceOf(ApprovalDeniedError);
  });
});
