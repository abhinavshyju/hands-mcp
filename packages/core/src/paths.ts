import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EDITER_DIRNAME } from "@editer/shared";

export interface EditerPaths {
  home: string;
  globalConfig: string;
  logs: string;
  bin: string;
  tunnel: string;
  pluginDir: string;
  pidFile: string;
}

export function editerHome(override?: string): string {
  return override ?? process.env.EDITER_HOME ?? path.join(os.homedir(), EDITER_DIRNAME);
}

export function resolveEditerPaths(homeOverride?: string): EditerPaths {
  const home = editerHome(homeOverride);
  return {
    home,
    globalConfig: path.join(home, "config.json"),
    logs: path.join(home, "logs"),
    bin: path.join(home, "bin"),
    tunnel: path.join(home, "tunnel"),
    pluginDir: path.join(home, "tools"),
    pidFile: path.join(home, "editer.pid"),
  };
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function projectEditerDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, EDITER_DIRNAME);
}

export function projectConfigPath(workspaceRoot: string): string {
  return path.join(projectEditerDir(workspaceRoot), "config.json");
}
