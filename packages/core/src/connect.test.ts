import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildMcpConnect } from "./connect.js";
import { HandsRuntime } from "./runtime.js";
import { saveGlobalConfig, loadGlobalConfig } from "./config.js";

describe("buildMcpConnect", () => {
  it("builds cursor-style JSON with tunnel hostname when configured", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "editer-connect-"));
    const rt = new HandsRuntime({ home, host: "127.0.0.1", port: 4999 });
    const cfg = loadGlobalConfig(rt.paths);
    cfg.tunnel.hostname = "editer.example.com";
    saveGlobalConfig(rt.paths, cfg);

    const out = buildMcpConnect(rt, "cursor");
    expect(out.url).toBe("https://editer.example.com/mcp");
    expect(out.json?.mcpServers.hands.url).toBe("https://editer.example.com/mcp");
    expect(out.pasteText).toContain("mcpServers");
    expect(out.authMode).toBe("none");
    expect(out.pasteText).not.toContain("Bearer");
  });

  it("includes bearer hint when auth.mode is bearer", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "editer-connect-"));
    const rt = new HandsRuntime({ home, port: 4877 });
    const t = rt.tokens.create("claude");
    const cfg = loadGlobalConfig(rt.paths);
    cfg.auth.mode = "bearer";
    saveGlobalConfig(rt.paths, cfg);

    const out = buildMcpConnect(rt, "generic");
    expect(out.authMode).toBe("bearer");
    expect(out.pasteText).toContain(t.token);
  });

  it("uses local URL when no tunnel hostname", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "editer-connect-"));
    const rt = new HandsRuntime({ home, port: 4877 });

    const out = buildMcpConnect(rt, "generic");
    expect(out.url).toBe("http://127.0.0.1:4877/mcp");
    expect(out.pasteText).toContain("URL:");
  });
});
