import { describe, expect, it, afterEach } from "vitest";
import { box, jsonBlock, kv } from "./render.js";
import { setColorEnabledForTests, visibleWidth } from "./theme.js";

describe("render", () => {
  afterEach(() => {
    setColorEnabledForTests(undefined);
  });

  it("kv aligns keys", () => {
    setColorEnabledForTests(false);
    const lines = kv([
      { key: "Local", value: "http://127.0.0.1:4877" },
      { key: "MCP", value: "http://127.0.0.1:4877/mcp" },
    ]);
    expect(lines[0]).toMatch(/Local:/);
    expect(lines[1]).toMatch(/MCP:/);
    const localIdx = lines[0]!.indexOf("http");
    const mcpIdx = lines[1]!.indexOf("http");
    expect(localIdx).toBe(mcpIdx);
  });

  it("box wraps body within width", () => {
    setColorEnabledForTests(false);
    const lines = box("title", ["short line"]);
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines.some((l) => l.includes("short line"))).toBe(true);
  });

  it("jsonBlock returns raw JSON when color off", () => {
    setColorEnabledForTests(false);
    const out = jsonBlock({ ok: true });
    expect(out).toBe('{\n  "ok": true\n}');
  });

  it("jsonBlock adds escapes when color on", () => {
    setColorEnabledForTests(true);
    const out = jsonBlock({ ok: true });
    expect(out).toContain("\u001b[");
    expect(visibleWidth(out)).toBeLessThan(out.length);
  });
});
