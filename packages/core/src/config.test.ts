import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveEditerPaths } from "./paths.js";
import { loadGlobalConfig, mergeConfig, saveGlobalConfig, saveProjectConfig } from "./config.js";
import { projectConfigSchema } from "@editer/shared";

describe("config merge", () => {
  it("project mode overrides workspace mode", () => {
    const merged = mergeConfig(
      { host: "127.0.0.1", port: 1, tokens: [], tunnel: { enabled: false }, workspaces: [], approvalTimeoutMs: 1, exposeUiOverTunnel: false, rateLimitWindowMs: 1, rateLimitMax: 1 },
      projectConfigSchema.parse({ mode: "auto" }),
      "review",
    );
    expect(merged.mode).toBe("auto");
  });

  it("falls back to workspace then review", () => {
    expect(mergeConfig(
      { host: "127.0.0.1", port: 1, tokens: [], tunnel: { enabled: false }, workspaces: [], approvalTimeoutMs: 1, exposeUiOverTunnel: false, rateLimitWindowMs: 1, rateLimitMax: 1 },
      projectConfigSchema.parse({}),
      "readonly",
    ).mode).toBe("readonly");
  });

  it("rejects invalid global config", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "editer-cfg-"));
    const paths = resolveEditerPaths(home);
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(paths.globalConfig, JSON.stringify({ port: "nope" }));
    expect(() => loadGlobalConfig(paths)).toThrow();
  });

  it("round-trips saved global config", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "editer-cfg-"));
    const paths = resolveEditerPaths(home);
    saveGlobalConfig(paths, loadGlobalConfig(paths));
    const again = loadGlobalConfig(paths);
    expect(again.port).toBe(4877);
  });

  it("persists project denylist", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "editer-proj-"));
    saveProjectConfig(root, projectConfigSchema.parse({ denylist: ["secrets/**"] }));
    const merged = mergeConfig(
      { host: "127.0.0.1", port: 1, tokens: [], tunnel: { enabled: false }, workspaces: [], approvalTimeoutMs: 1, exposeUiOverTunnel: false, rateLimitWindowMs: 1, rateLimitMax: 1 },
      projectConfigSchema.parse(JSON.parse(fs.readFileSync(path.join(root, ".editer/config.json"), "utf8"))),
    );
    expect(merged.denylist).toEqual(["secrets/**"]);
  });
});
