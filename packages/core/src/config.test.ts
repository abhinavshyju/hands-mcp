import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveEditerPaths } from "./paths.js";
import {
  loadGlobalConfig,
  loadProjectConfig,
  mergeConfig,
  resolveMode,
  saveGlobalConfig,
  saveProjectConfig,
  setConfigValue,
  setModeScoped,
} from "./config.js";
import { WorkspaceRegistry } from "./workspaces.js";
import { projectConfigSchema } from "@editer/shared";

describe("config merge", () => {
  it("project mode overrides workspace mode", () => {
    const merged = mergeConfig(
      { host: "127.0.0.1", port: 1, tokens: [], tunnel: { enabled: false, mode: "off" }, workspaces: [], approvalTimeoutMs: 1, exposeUiOverTunnel: false, rateLimitWindowMs: 1, rateLimitMax: 1 },
      projectConfigSchema.parse({ mode: "auto" }),
      "review",
    );
    expect(merged.mode).toBe("auto");
    expect(merged.modeSource).toBe("project");
  });

  it("falls back to workspace then review", () => {
    const merged = mergeConfig(
      { host: "127.0.0.1", port: 1, tokens: [], tunnel: { enabled: false, mode: "off" }, workspaces: [], approvalTimeoutMs: 1, exposeUiOverTunnel: false, rateLimitWindowMs: 1, rateLimitMax: 1 },
      projectConfigSchema.parse({}),
      "readonly",
    );
    expect(merged.mode).toBe("readonly");
    expect(merged.modeSource).toBe("workspace");
  });

  it("resolveMode reports override", () => {
    expect(resolveMode(projectConfigSchema.parse({ mode: "auto" }), "review", "readonly")).toEqual({
      mode: "readonly",
      source: "override",
    });
  });

  it("setModeScoped workspace clears project mode", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "editer-cfg-"));
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "editer-proj-"));
    const paths = resolveEditerPaths(home);
    saveProjectConfig(root, projectConfigSchema.parse({ mode: "auto" }));
    const ws = new WorkspaceRegistry(paths).add(root, "p");
    setModeScoped(paths, "review", "workspace", ws);
    expect(loadProjectConfig(root).mode).toBeUndefined();
    expect(new WorkspaceRegistry(paths).getActive()?.mode).toBe("review");
  });

  it("setConfigValue dot paths", () => {
    const obj: Record<string, unknown> = { tunnel: { enabled: false } };
    setConfigValue(obj, "tunnel.hostname", "x.example.com");
    expect((obj.tunnel as { hostname: string }).hostname).toBe("x.example.com");
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
      { host: "127.0.0.1", port: 1, tokens: [], tunnel: { enabled: false, mode: "off" }, workspaces: [], approvalTimeoutMs: 1, exposeUiOverTunnel: false, rateLimitWindowMs: 1, rateLimitMax: 1 },
      projectConfigSchema.parse(JSON.parse(fs.readFileSync(path.join(root, ".editer/config.json"), "utf8"))),
    );
    expect(merged.denylist).toEqual(["secrets/**"]);
  });
});
