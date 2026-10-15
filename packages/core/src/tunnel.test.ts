import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildCloudflaredArgs,
  effectiveTunnelMode,
  normalizeTunnelConfigForSession,
  parseNgrokPublicUrl,
  parseQuickTunnelUrl,
} from "./tunnel.js";
import { loadGlobalConfig, saveGlobalConfig } from "./config.js";
import { resolveHandsPaths } from "./paths.js";

describe("tunnel helpers", () => {
  it("parses trycloudflare URL", () => {
    const text = "INF |  https://abc-def.trycloudflare.com  |  some log";
    expect(parseQuickTunnelUrl(text)).toBe("https://abc-def.trycloudflare.com");
  });

  it("builds quick args", () => {
    expect(buildCloudflaredArgs({ enabled: true, mode: "quick" }, 4877)).toEqual([
      "tunnel",
      "--url",
      "http://127.0.0.1:4877",
    ]);
  });

  it("builds token args", () => {
    expect(buildCloudflaredArgs({ enabled: true, mode: "token", token: "tok" }, 4877)).toEqual([
      "tunnel",
      "run",
      "--token",
      "tok",
    ]);
  });

  it("parses ngrok forwarding URL", () => {
    const text = "Forwarding  https://abc123.ngrok-free.app -> http://localhost:4877";
    expect(parseNgrokPublicUrl(text)).toBe("https://abc123.ngrok-free.app");
  });

  it("effective mode from legacy enabled", () => {
    expect(effectiveTunnelMode({ enabled: true })).toBe("named");
    expect(effectiveTunnelMode({ enabled: false, mode: "off" })).toBe("off");
  });

  it("normalizeTunnelConfigForSession upgrades off mode when hostname and creds exist", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "hands-tunnel-norm-"));
    const paths = resolveHandsPaths(home);
    fs.mkdirSync(paths.tunnel, { recursive: true });
    fs.writeFileSync(path.join(paths.tunnel, "credentials.json"), "{}", "utf8");
    saveGlobalConfig(paths, {
      tunnel: { enabled: true, mode: "off", hostname: "mcp.example.com" },
    } as Parameters<typeof saveGlobalConfig>[1]);
    normalizeTunnelConfigForSession(paths);
    const cfg = loadGlobalConfig(paths);
    expect(cfg.tunnel.mode).toBe("named");
  });
});
