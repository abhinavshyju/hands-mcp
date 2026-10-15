import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { atomicWriteBuffer, atomicWriteFile } from "./atomicWrite.js";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hands-atomic-"));
}

describe("atomicWrite", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes file content on happy path", () => {
    const dir = tmpDir();
    const dest = path.join(dir, "out.txt");
    atomicWriteFile(dest, "hello");
    expect(fs.readFileSync(dest, "utf8")).toBe("hello");
  });

  it("writes buffer content on happy path", () => {
    const dir = tmpDir();
    const dest = path.join(dir, "bin.dat");
    atomicWriteBuffer(dest, Buffer.from([1, 2, 3]));
    expect([...fs.readFileSync(dest)]).toEqual([1, 2, 3]);
  });

  it("creates temp file next to destination", () => {
    const dir = tmpDir();
    const dest = path.join(dir, "nested", "file.txt");
    const writeSpy = vi.spyOn(fs, "writeFileSync");
    atomicWriteFile(dest, "payload");
    const tmpPath = writeSpy.mock.calls[0]?.[0];
    expect(typeof tmpPath).toBe("string");
    expect(path.dirname(String(tmpPath))).toBe(path.dirname(dest));
    expect(String(tmpPath)).toMatch(/\.hands-write-/);
    writeSpy.mockRestore();
  });

  it("falls back to copy when rename hits EXDEV", () => {
    const dir = tmpDir();
    const dest = path.join(dir, "exdev.txt");
    vi.spyOn(fs, "renameSync").mockImplementation((_from, _to) => {
      const err = new Error("EXDEV: cross-device link not permitted") as NodeJS.ErrnoException;
      err.code = "EXDEV";
      throw err;
    });
    const copySpy = vi.spyOn(fs, "copyFileSync");
    atomicWriteFile(dest, "cross-device");
    expect(copySpy).toHaveBeenCalled();
    expect(fs.readFileSync(dest, "utf8")).toBe("cross-device");
    const leftovers = fs.readdirSync(dir).filter((n) => n.startsWith(".hands-write-"));
    expect(leftovers).toEqual([]);
  });

  it("rethrows non-EXDEV rename errors and removes temp file", () => {
    const dir = tmpDir();
    const dest = path.join(dir, "fail.txt");
    vi.spyOn(fs, "renameSync").mockImplementation(() => {
      const err = new Error("permission denied") as NodeJS.ErrnoException;
      err.code = "EACCES";
      throw err;
    });
    expect(() => atomicWriteFile(dest, "nope")).toThrow(/permission denied/);
    expect(fs.existsSync(dest)).toBe(false);
    const leftovers = fs.readdirSync(dir).filter((n) => n.startsWith(".hands-write-"));
    expect(leftovers).toEqual([]);
  });
});
