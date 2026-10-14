import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { type WorkspaceMode, type WorkspaceRecord } from "@editer/shared";
import { loadGlobalConfig, saveGlobalConfig } from "./config.js";
import type { EditerPaths } from "./paths.js";

export class WorkspaceRegistry {
  constructor(private readonly paths: EditerPaths) {}

  list(): WorkspaceRecord[] {
    return loadGlobalConfig(this.paths).workspaces;
  }

  getActive(): WorkspaceRecord | undefined {
    const cfg = loadGlobalConfig(this.paths);
    return cfg.workspaces.find((w) => w.id === cfg.activeWorkspaceId) ?? cfg.workspaces[0];
  }

  add(root: string, name?: string, mode: WorkspaceMode = "review"): WorkspaceRecord {
    const resolved = path.resolve(root);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      throw new Error(`Not a directory: ${resolved}`);
    }
    const cfg = loadGlobalConfig(this.paths);
    const existing = cfg.workspaces.find((w) => path.resolve(w.root) === resolved);
    if (existing) {
      cfg.activeWorkspaceId = existing.id;
      saveGlobalConfig(this.paths, cfg);
      return existing;
    }
    const rec: WorkspaceRecord = {
      id: randomUUID(),
      name: name ?? path.basename(resolved),
      root: resolved,
      mode,
      createdAt: Date.now(),
    };
    cfg.workspaces.push(rec);
    cfg.activeWorkspaceId = rec.id;
    saveGlobalConfig(this.paths, cfg);
    return rec;
  }

  remove(idOrRoot: string): void {
    const cfg = loadGlobalConfig(this.paths);
    cfg.workspaces = cfg.workspaces.filter(
      (w) => w.id !== idOrRoot && path.resolve(w.root) !== path.resolve(idOrRoot),
    );
    if (cfg.activeWorkspaceId === idOrRoot) {
      cfg.activeWorkspaceId = cfg.workspaces[0]?.id;
    }
    saveGlobalConfig(this.paths, cfg);
  }

  setActive(id: string): WorkspaceRecord {
    const cfg = loadGlobalConfig(this.paths);
    const rec = cfg.workspaces.find((w) => w.id === id || w.name === id);
    if (!rec) throw new Error(`Workspace not found: ${id}`);
    cfg.activeWorkspaceId = rec.id;
    saveGlobalConfig(this.paths, cfg);
    return rec;
  }

  setMode(id: string, mode: WorkspaceMode): WorkspaceRecord {
    const cfg = loadGlobalConfig(this.paths);
    const rec = cfg.workspaces.find((w) => w.id === id || w.name === id);
    if (!rec) throw new Error(`Workspace not found: ${id}`);
    rec.mode = mode;
    saveGlobalConfig(this.paths, cfg);
    return rec;
  }

  requireActive(): WorkspaceRecord {
    const active = this.getActive();
    if (!active) throw new Error("No workspace registered. Run `editer workspace add <path>`.");
    return active;
  }
}
