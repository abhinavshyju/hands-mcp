import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HANDS_CODING_GUIDANCE, mergeWorkspaceGuidance } from "./codingGuidance.js";

describe("mergeWorkspaceGuidance", () => {
  it("includes bundled guidance by default", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hands-guide-"));
    const { text, sources } = mergeWorkspaceGuidance(dir);
    expect(text).toContain(HANDS_CODING_GUIDANCE.slice(0, 40));
    expect(sources).toContain("@hands/shared:codingGuidance");
  });

  it("appends AGENTS.md when present", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hands-guide-"));
    fs.writeFileSync(path.join(dir, "AGENTS.md"), "# Custom agents\n", "utf8");
    const { text, sources } = mergeWorkspaceGuidance(dir);
    expect(text).toContain("# Custom agents");
    expect(sources).toContain("AGENTS.md");
  });
});
