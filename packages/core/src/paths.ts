import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HANDS_DIRNAME, LEGACY_EDITER_DIRNAME } from "@hands/shared";
import { migrateLegacyDirIfNeeded } from "./migrate.js";

export interface HandsPaths {
  home: string;
  globalConfig: string;
  logs: string;
  bin: string;
  tunnel: string;
  pluginDir: string;
  pidFile: string;
}

export function handsHome(override?: string): string {
  if (override) return override;
  if (process.env.HANDS_HOME) return process.env.HANDS_HOME;
  if (process.env.EDITER_HOME) return process.env.EDITER_HOME;

  const newHome = path.join(os.homedir(), HANDS_DIRNAME);
  const legacyHome = path.join(os.homedir(), LEGACY_EDITER_DIRNAME);
  migrateLegacyDirIfNeeded(legacyHome, newHome);
  return newHome;
}

export function resolveHandsPaths(homeOverride?: string): HandsPaths {
  const home = handsHome(homeOverride);
  return {
    home,
    globalConfig: path.join(home, "config.json"),
    logs: path.join(home, "logs"),
    bin: path.join(home, "bin"),
    tunnel: path.join(home, "tunnel"),
    pluginDir: path.join(home, "tools"),
    pidFile: path.join(home, "hands.pid"),
  };
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function projectHandsDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, HANDS_DIRNAME);
}

export function projectConfigPath(workspaceRoot: string): string {
  return path.join(projectHandsDir(workspaceRoot), "config.json");
}
