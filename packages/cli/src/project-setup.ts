import fs from "node:fs";
import path from "node:path";
import {
  ensureDir,
  loadGlobalConfig,
  loadProjectConfig,
  saveGlobalConfig,
  saveProjectConfig,
  scaffoldProject,
  type EditerRuntime,
} from "@editer/core";
import { projectConfigSchema, type WorkspaceMode } from "@editer/shared";

export interface EnsureProjectOptions {
  mode?: WorkspaceMode;
  template?: string;
  registerWorkspace?: boolean;
  name?: string;
}

export function ensureGlobalHome(rt: EditerRuntime): void {
  ensureDir(rt.paths.home);
  ensureDir(rt.paths.pluginDir);
  saveGlobalConfig(rt.paths, loadGlobalConfig(rt.paths));
}

export function ensureProjectDir(root: string, opts: EnsureProjectOptions = {}): string {
  const resolved = path.resolve(root);
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }
  if (opts.template) {
    scaffoldProject(resolved, opts.template);
  }
  ensureDir(path.join(resolved, ".editer"));
  const existing = loadProjectConfig(resolved);
  const project = projectConfigSchema.parse({
    ...existing,
    ...(opts.mode ? { mode: opts.mode } : {}),
  });
  saveProjectConfig(resolved, project);
  return resolved;
}

export function registerProjectWorkspace(rt: EditerRuntime, root: string, name?: string, mode?: WorkspaceMode) {
  return rt.workspaces.add(root, name, mode ?? "review");
}
