import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AuditLog } from "./audit.js";
import { EventBus } from "./events.js";
import { resolveHandsPaths } from "./paths.js";

function auditLog(): { audit: AuditLog; home: string } {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "hands-audit-"));
  const events = new EventBus();
  return { audit: new AuditLog(resolveHandsPaths(home), events), home };
}

describe("AuditLog", () => {
  it("filters query by workspaceId until limit is reached", () => {
    const { audit } = auditLog();
    audit.record({ type: "tool.finished", tool: "run_command", workspaceId: "ws-a" });
    audit.record({ type: "tool.finished", tool: "run_command", workspaceId: "ws-b" });
    audit.record({ type: "tool.finished", tool: "run_command", workspaceId: "ws-a" });

    const forA = audit.query({ limit: 10, workspaceId: "ws-a" });
    expect(forA).toHaveLength(2);
    expect(forA.every((e) => e.workspaceId === "ws-a")).toBe(true);

    const forB = audit.query({ limit: 10, workspaceId: "ws-b" });
    expect(forB).toHaveLength(1);
    expect(forB[0]?.workspaceId).toBe("ws-b");
  });

  it("clear removes all jsonl log files", () => {
    const { audit } = auditLog();
    audit.record({ type: "tool.finished", tool: "write_file", workspaceId: "ws-a" });
    expect(audit.query({ limit: 10 })).toHaveLength(1);

    audit.clear();
    expect(audit.query({ limit: 10 })).toHaveLength(0);
  });
});
