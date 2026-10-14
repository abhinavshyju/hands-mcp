import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PathJailError } from "@editer/shared";
import { resolvePath } from "./jail.js";

function tmpWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "editer-jail-"));
  fs.writeFileSync(path.join(dir, "ok.txt"), "ok");
  return dir;
}

describe("path jail", () => {
  it("resolves relative paths inside the workspace", () => {
    const root = tmpWorkspace();
    const abs = resolvePath({ workspaceRoot: root, input: "ok.txt", op: "read" });
    expect(abs).toBe(fs.realpathSync(path.join(root, "ok.txt")));
  });

  it.each([
    "../etc/passwd",
    "../../secret",
    "foo/../../ok.txt/../../../etc/passwd",
    "/etc/passwd",
  ])("rejects traversal %s", (input) => {
    const root = tmpWorkspace();
    expect(() => resolvePath({ workspaceRoot: root, input, op: "read" })).toThrow(PathJailError);
  });

  it("rejects symlink that escapes the workspace", () => {
    const root = tmpWorkspace();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "editer-out-"));
    const secret = path.join(outside, "secret.txt");
    fs.writeFileSync(secret, "nope");
    const link = path.join(root, "escape");
    fs.symlinkSync(secret, link);
    expect(() => resolvePath({ workspaceRoot: root, input: "escape", op: "read" })).toThrow(
      PathJailError,
    );
  });

  it("rejects .env reads", () => {
    const root = tmpWorkspace();
    fs.writeFileSync(path.join(root, ".env"), "SECRET=1");
    expect(() => resolvePath({ workspaceRoot: root, input: ".env", op: "read" })).toThrow(
      PathJailError,
    );
  });

  it("rejects writes under node_modules", () => {
    const root = tmpWorkspace();
    fs.mkdirSync(path.join(root, "node_modules", "x"), { recursive: true });
    expect(() =>
      resolvePath({ workspaceRoot: root, input: "node_modules/x/a.js", op: "write" }),
    ).toThrow(PathJailError);
  });

  it("accepts extra denylist globs", () => {
    const root = tmpWorkspace();
    fs.writeFileSync(path.join(root, "secrets.txt"), "x");
    expect(() =>
      resolvePath({
        workspaceRoot: root,
        input: "secrets.txt",
        op: "read",
        extraDenylist: ["secrets.txt"],
      }),
    ).toThrow(PathJailError);
  });
});
