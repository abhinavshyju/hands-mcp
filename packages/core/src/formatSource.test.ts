import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { writeFile } from "./edit.js";
import { formatSourceFile } from "./formatSource.js";

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hands-fmt-"));
}

describe("formatSourceFile", () => {
  it("formats TypeScript using workspace prettier config", async () => {
    const dir = tmp();
    fs.writeFileSync(
      path.join(dir, "prettier.config.js"),
      `export default { printWidth: 40, semi: true };\n`,
    );
    const file = path.join(dir, "sample.ts");
    fs.writeFileSync(file, "const x={a:1,b:2};", "utf8");
    const result = await formatSourceFile(file);
    expect(result.formatted).toBe(true);
    expect(result.changed).toBe(true);
    const content = fs.readFileSync(file, "utf8");
    expect(content).not.toBe("const x={a:1,b:2};");
    expect(content).toContain("const x");
  });

  it("keeps content and returns warning on parse error", async () => {
    const dir = tmp();
    const file = path.join(dir, "broken.ts");
    const bad = "const {{{";
    fs.writeFileSync(file, bad, "utf8");
    const result = await formatSourceFile(file);
    expect(result.formatted).toBe(false);
    expect(result.warning).toBeDefined();
    expect(fs.readFileSync(file, "utf8")).toBe(bad);
  });

  it("skips non-formattable extensions", async () => {
    const dir = tmp();
    const file = path.join(dir, "notes.txt");
    fs.writeFileSync(file, "plain text", "utf8");
    const result = await formatSourceFile(file);
    expect(result.formatted).toBe(false);
    expect(result.changed).toBe(false);
  });
});

describe("writeFile with formatOnEdit", () => {
  it("returns formatted true after prettier run", async () => {
    const dir = tmp();
    fs.writeFileSync(
      path.join(dir, "prettier.config.js"),
      `export default { printWidth: 40, semi: true };\n`,
    );
    const file = path.join(dir, "out.ts");
    const result = await writeFile(file, "export const n=1;", { formatOnEdit: true });
    expect(result.formatted).toBe(true);
  });
});
