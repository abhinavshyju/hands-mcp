import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveHandsPaths } from "./paths.js";
import { WorkspaceRegistry } from "./workspaces.js";

describe("workspace registry", () => {
  it("survives restart via disk", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "editer-ws-"));
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "editer-proj-"));
    const paths = resolveHandsPaths(home);
    const a = new WorkspaceRegistry(paths);
    const rec = a.add(root, "demo");
    const b = new WorkspaceRegistry(paths);
    expect(b.getActive()?.id).toBe(rec.id);
  });
});
