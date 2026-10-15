import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createFile, multiEdit, strReplace, writeFile } from "./edit.js";
import { applyPatchToFiles } from "./patch.js";
import { initShadowGit, restoreCheckpoint, snapshotFiles, userGitState } from "./checkpoints.js";
import { spawnSync } from "node:child_process";

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "editer-edit-"));
}

describe("edit engine", () => {
  it("preserves CRLF", async () => {
    const dir = tmp();
    const file = path.join(dir, "a.txt");
    fs.writeFileSync(file, "hello\r\nworld\r\n");
    await writeFile(file, "hello\nthere\n", { formatOnEdit: false });
    expect(fs.readFileSync(file, "utf8")).toBe("hello\r\nthere\r\n");
  });

  it("create_file fails if exists", async () => {
    const dir = tmp();
    const file = path.join(dir, "a.txt");
    await createFile(file, "x", { formatOnEdit: false });
    await expect(createFile(file, "y", { formatOnEdit: false })).rejects.toThrow(/already exists/);
  });

  it("rejects ambiguous str_replace", async () => {
    const dir = tmp();
    const file = path.join(dir, "a.txt");
    fs.writeFileSync(file, "foo\nfoo\n");
    await expect(
      strReplace(file, "foo", "bar", undefined, { formatOnEdit: false }),
    ).rejects.toThrow(/matched 2 times/);
    expect(fs.readFileSync(file, "utf8")).toBe("foo\nfoo\n");
  });

  it("replaces expected occurrences", async () => {
    const dir = tmp();
    const file = path.join(dir, "a.txt");
    fs.writeFileSync(file, "foo\nfoo\n");
    await strReplace(file, "foo", "bar", 2, { formatOnEdit: false });
    expect(fs.readFileSync(file, "utf8")).toBe("bar\nbar\n");
  });

  it("multi_edit rolls back if a later step fails", async () => {
    const dir = tmp();
    const file = path.join(dir, "a.txt");
    fs.writeFileSync(file, "one\ntwo\nthree\n");
    await expect(
      multiEdit(
        file,
        [
          { old_string: "one", new_string: "ONE" },
          { old_string: "two", new_string: "TWO" },
          { old_string: "missing", new_string: "x" },
        ],
        { formatOnEdit: false },
      ),
    ).rejects.toThrow(/step 3/);
    expect(fs.readFileSync(file, "utf8")).toBe("one\ntwo\nthree\n");
  });

  it("rejects a drifted patch and leaves the file untouched", async () => {
    const dir = tmp();
    const file = path.join(dir, "a.txt");
    fs.writeFileSync(file, "alpha\nbeta\ngamma\n");
    const patch = `--- a/a.txt
+++ b/a.txt
@@ -1,3 +1,3 @@
 alpha
-BETTER
+beta2
 gamma
`;
    await expect(
      applyPatchToFiles(dir, patch, (rel) => path.join(dir, rel), { formatOnEdit: false }),
    ).rejects.toThrow(/drifted|mismatch/);
    expect(fs.readFileSync(file, "utf8")).toBe("alpha\nbeta\ngamma\n");
  });

  it("applies a valid unified diff", async () => {
    const dir = tmp();
    const file = path.join(dir, "a.txt");
    fs.writeFileSync(file, "alpha\nbeta\ngamma\n");
    const patch = `--- a/a.txt
+++ b/a.txt
@@ -1,3 +1,3 @@
 alpha
-beta
+beta2
 gamma
`;
    await applyPatchToFiles(dir, patch, (rel) => path.join(dir, rel), { formatOnEdit: false });
    expect(fs.readFileSync(file, "utf8")).toBe("alpha\nbeta2\ngamma\n");
  });
});

describe("shadow git checkpoints", () => {
  it("restores bytes and does not touch the user repo", () => {
    const dir = tmp();
    spawnSync("git", ["init"], { cwd: dir });
    fs.writeFileSync(path.join(dir, "tracked.txt"), "orig\n");
    spawnSync("git", ["add", "tracked.txt"], { cwd: dir });
    spawnSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-m", "init"], {
      cwd: dir,
    });
    const before = userGitState(dir);
    initShadowGit(dir);
    const file = path.join(dir, "tracked.txt");
    const ck = snapshotFiles(dir, [file], { tool: "write_file" });
    fs.writeFileSync(file, "changed\n");
    restoreCheckpoint(dir, ck.id);
    expect(fs.readFileSync(file, "utf8")).toBe("orig\n");
    const after = userGitState(dir);
    expect(after.head).toBe(before.head);
  });
});
