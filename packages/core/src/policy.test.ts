import { describe, expect, it } from "vitest";
import { PolicyDeniedError } from "@hands/shared";
import { assertCommandAllowed } from "./commandPolicy.js";
import { resolvePolicy } from "./policy.js";
import type { ToolGroup, WorkspaceMode } from "@hands/shared";

const groups: ToolGroup[] = ["edit", "exec", "read", "git"];
const modes: WorkspaceMode[] = ["readonly", "review", "auto"];

describe("policy matrix", () => {
  it.each(modes)("readonly denies mutation in %s for edits only when readonly", (mode) => {
    const edit = resolvePolicy({ mode, group: "edit", mutating: true });
    const exec = resolvePolicy({ mode, group: "exec", mutating: true });
    const read = resolvePolicy({ mode, group: "read", mutating: false });
    if (mode === "readonly") {
      expect(edit).toBe("deny");
      expect(exec).toBe("deny");
    } else if (mode === "review") {
      expect(edit).toBe("allow");
      expect(exec).toBe("approve");
    } else {
      expect(edit).toBe("allow");
      expect(exec).toBe("allow");
    }
    expect(read).toBe("allow");
  });

  it("covers groups x modes", () => {
    const table: Record<string, string> = {};
    for (const mode of modes) {
      for (const group of groups) {
        table[`${mode}:${group}:mut`] = resolvePolicy({ mode, group, mutating: true });
        table[`${mode}:${group}:ro`] = resolvePolicy({ mode, group, mutating: false });
      }
    }
    expect(table["readonly:edit:mut"]).toBe("deny");
    expect(table["review:exec:mut"]).toBe("approve");
    expect(table["auto:edit:mut"]).toBe("allow");
    expect(table["auto:exec:mut"]).toBe("allow");
    expect(resolvePolicy({ mode: "review", group: "browser", mutating: true })).toBe("approve");
    expect(resolvePolicy({ mode: "auto", group: "browser", mutating: true })).toBe("allow");
    expect(resolvePolicy({ mode: "auto", group: "quality", mutating: true })).toBe("allow");
    expect(resolvePolicy({ mode: "review", group: "quality", mutating: true })).toBe("approve");
  });

  it("denylist still applies independently of auto mode", () => {
    expect(resolvePolicy({ mode: "auto", group: "exec", mutating: true })).toBe("allow");
    expect(() => assertCommandAllowed("rm -rf /")).toThrow(PolicyDeniedError);
  });

  it("honors overrides", () => {
    expect(
      resolvePolicy({
        mode: "auto",
        group: "edit",
        mutating: true,
        overrides: { edit: "approve" },
      }),
    ).toBe("approve");
  });
});
