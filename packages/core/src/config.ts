import fs from "node:fs";
import path from "node:path";
import {
  globalConfigSchema,
  projectConfigSchema,
  type GlobalConfig,
  type MergedConfig,
  type ModeSource,
  type ProjectConfig,
  type WorkspaceMode,
  type WorkspaceRecord,
} from "@editer/shared";
import { ensureDir, projectConfigPath, type EditerPaths } from "./paths.js";

const emptyProject: ProjectConfig = projectConfigSchema.parse({});

export function defaultGlobalConfig(): GlobalConfig {
  return globalConfigSchema.parse({});
}

export function loadGlobalConfig(paths: EditerPaths): GlobalConfig {
  if (!fs.existsSync(paths.globalConfig)) {
    return defaultGlobalConfig();
  }
  const raw = JSON.parse(fs.readFileSync(paths.globalConfig, "utf8")) as unknown;
  return globalConfigSchema.parse(raw);
}

export function saveGlobalConfig(paths: EditerPaths, config: GlobalConfig): void {
  ensureDir(paths.home);
  const parsed = globalConfigSchema.parse(config);
  fs.writeFileSync(paths.globalConfig, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

export function loadProjectConfig(workspaceRoot: string): ProjectConfig {
  const p = projectConfigPath(workspaceRoot);
  if (!fs.existsSync(p)) return emptyProject;
  const raw = JSON.parse(fs.readFileSync(p, "utf8")) as unknown;
  return projectConfigSchema.parse(raw);
}

export function saveProjectConfig(workspaceRoot: string, config: ProjectConfig): void {
  const p = projectConfigPath(workspaceRoot);
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, `${JSON.stringify(projectConfigSchema.parse(config), null, 2)}\n`, "utf8");
}

export function resolveMode(
  project: ProjectConfig,
  workspaceMode: WorkspaceMode | undefined,
  override?: WorkspaceMode,
): { mode: WorkspaceMode; source: ModeSource } {
  if (override) return { mode: override, source: "override" };
  if (project.mode) return { mode: project.mode, source: "project" };
  if (workspaceMode) return { mode: workspaceMode, source: "workspace" };
  return { mode: "review", source: "default" };
}

export function mergeConfig(
  global: GlobalConfig,
  project: ProjectConfig,
  workspaceMode?: WorkspaceMode,
  override?: WorkspaceMode,
): MergedConfig {
  const { mode, source } = resolveMode(project, workspaceMode, override);
  return {
    global,
    project,
    mode,
    modeSource: source,
    denylist: project.denylist,
    scripts: project.scripts,
    toolGroupOverrides: project.toolGroupOverrides,
  };
}

export function loadMerged(paths: EditerPaths, workspaceRoot?: string, override?: WorkspaceMode): MergedConfig {
  const global = loadGlobalConfig(paths);
  const resolved = workspaceRoot ? path.resolve(workspaceRoot) : undefined;
  const ws = resolved
    ? global.workspaces.find((w) => path.resolve(w.root) === resolved)
    : global.workspaces.find((w) => w.id === global.activeWorkspaceId);
  const root = resolved ?? ws?.root;
  const project = root ? loadProjectConfig(root) : emptyProject;
  return mergeConfig(global, project, ws?.mode, override);
}

export type ModeWriteScope = "workspace" | "project";

export function setModeScoped(
  paths: EditerPaths,
  mode: WorkspaceMode,
  scope: ModeWriteScope,
  workspace: WorkspaceRecord,
): MergedConfig {
  if (scope === "project") {
    const project = loadProjectConfig(workspace.root);
    project.mode = mode;
    saveProjectConfig(workspace.root, project);
    return mergeConfig(loadGlobalConfig(paths), project, workspace.mode);
  }
  const cfg = loadGlobalConfig(paths);
  const rec = cfg.workspaces.find((w) => w.id === workspace.id);
  if (!rec) throw new Error(`Workspace not found: ${workspace.id}`);
  rec.mode = mode;
  saveGlobalConfig(paths, cfg);
  const project = loadProjectConfig(workspace.root);
  if (project.mode !== undefined) {
    delete project.mode;
    saveProjectConfig(workspace.root, project);
  }
  return mergeConfig(cfg, loadProjectConfig(workspace.root), rec.mode);
}

function parseJsonValue(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

export function getConfigValue(obj: Record<string, unknown>, dotPath: string): unknown {
  const parts = dotPath.split(".").filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export function setConfigValue(obj: Record<string, unknown>, dotPath: string, value: unknown): void {
  const parts = dotPath.split(".").filter(Boolean);
  if (parts.length === 0) throw new Error("Empty config key");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    const next = cur[p];
    if (next === undefined || typeof next !== "object" || next === null) {
      cur[p] = {};
    }
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

export function unsetConfigValue(obj: Record<string, unknown>, dotPath: string): void {
  const parts = dotPath.split(".").filter(Boolean);
  if (parts.length === 0) throw new Error("Empty config key");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    const next = cur[p];
    if (next === undefined || typeof next !== "object" || next === null) return;
    cur = next as Record<string, unknown>;
  }
  delete cur[parts[parts.length - 1]!];
}

export function applyGlobalConfigKey(paths: EditerPaths, key: string, rawValue: string): GlobalConfig {
  const cfg = loadGlobalConfig(paths);
  const obj = { ...cfg } as unknown as Record<string, unknown>;
  setConfigValue(obj, key, parseJsonValue(rawValue));
  const parsed = globalConfigSchema.parse(obj);
  saveGlobalConfig(paths, parsed);
  return parsed;
}

export function unsetGlobalConfigKey(paths: EditerPaths, key: string): GlobalConfig {
  const cfg = loadGlobalConfig(paths);
  const obj = structuredClone(cfg) as unknown as Record<string, unknown>;
  unsetConfigValue(obj, key);
  const parsed = globalConfigSchema.parse(obj);
  saveGlobalConfig(paths, parsed);
  return parsed;
}

export function applyProjectConfigKey(workspaceRoot: string, key: string, rawValue: string): ProjectConfig {
  const project = loadProjectConfig(workspaceRoot);
  const obj = structuredClone(project) as unknown as Record<string, unknown>;
  setConfigValue(obj, key, parseJsonValue(rawValue));
  const parsed = projectConfigSchema.parse(obj);
  saveProjectConfig(workspaceRoot, parsed);
  return parsed;
}

export function unsetProjectConfigKey(workspaceRoot: string, key: string): ProjectConfig {
  const project = loadProjectConfig(workspaceRoot);
  const obj = structuredClone(project) as unknown as Record<string, unknown>;
  unsetConfigValue(obj, key);
  const parsed = projectConfigSchema.parse(obj);
  saveProjectConfig(workspaceRoot, parsed);
  return parsed;
}

export function redactGlobalConfigForApi(cfg: GlobalConfig): Record<string, unknown> {
  const tunnel = cfg.tunnel;
  return {
    host: cfg.host,
    port: cfg.port,
    tunnel: {
      enabled: tunnel.enabled,
      mode: tunnel.mode ?? (tunnel.enabled ? "named" : "off"),
      hostname: tunnel.hostname,
      tunnelName: tunnel.tunnelName,
      credentialsFile: tunnel.credentialsFile,
      configFile: tunnel.configFile,
      tokenSet: Boolean(tunnel.token),
      quickUrl: tunnel.quickUrl,
    },
    exposeUiOverTunnel: cfg.exposeUiOverTunnel,
    tokens: cfg.tokens.map((t) => ({ id: t.id, name: t.name, createdAt: t.createdAt, revokedAt: t.revokedAt })),
    workspaces: cfg.workspaces,
    activeWorkspaceId: cfg.activeWorkspaceId,
    approvalTimeoutMs: cfg.approvalTimeoutMs,
    rateLimitWindowMs: cfg.rateLimitWindowMs,
    rateLimitMax: cfg.rateLimitMax,
    pluginDir: cfg.pluginDir,
    approvalWebhookUrl: cfg.approvalWebhookUrl,
  };
}
