import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SymbolIndex } from "./symbols.js";

describe("symbol index", () => {
  it("finds a function definition by name", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "editer-sym-"));
    fs.writeFileSync(path.join(dir, "app.ts"), "export function greet(name: string) { return name; }\n");
    const idx = new SymbolIndex();
    const ms = await idx.reindex(dir);
    expect(ms).toBeLessThan(5000);
    const hits = idx.findDefinition("greet");
    expect(hits[0]?.name).toBe("greet");
    const single = await idx.reindex(dir, "app.ts");
    expect(single).toBeLessThan(1000);
  });
});
