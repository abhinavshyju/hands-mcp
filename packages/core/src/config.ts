import fs from "node:fs";
import path from "node:path";
import {
  globalConfigSchema,
  projectConfigSchema,
  type GlobalConfig,
  type MergedConfig,
  type ProjectConfig,
  type WorkspaceMode,
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

export function mergeConfig(
  global: GlobalConfig,
  project: ProjectConfig,
  workspaceMode?: WorkspaceMode,
): MergedConfig {
  const mode = project.mode ?? workspaceMode ?? "review";
  return {
    global,
    project,
    mode,
    denylist: project.denylist,
    scripts: project.scripts,
    toolGroupOverrides: project.toolGroupOverrides,
  };
}

export function loadMerged(paths: EditerPaths, workspaceRoot?: string): MergedConfig {
  const global = loadGlobalConfig(paths);
  const resolved = workspaceRoot ? path.resolve(workspaceRoot) : undefined;
  const ws = resolved
    ? global.workspaces.find((w) => path.resolve(w.root) === resolved)
    : global.workspaces.find((w) => w.id === global.activeWorkspaceId);
  const root = resolved ?? ws?.root;
  const project = root ? loadProjectConfig(root) : emptyProject;
  return mergeConfig(global, project, ws?.mode);
}
