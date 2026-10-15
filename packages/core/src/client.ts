import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type {
  AuditEvent,
  GlobalConfig,
  MergedConfig,
  ModeSource,
  ProjectConfig,
  TunnelMode,
  WorkspaceMode,
  WorkspaceRecord,
} from "@hands/shared";
import { loadGlobalConfig } from "./config.js";
import type { HandsPaths } from "./paths.js";

export interface DaemonStateResponse {
  version: string;
  host: string;
  port: number;
  mode: WorkspaceMode;
  modeSource: ModeSource;
  workspace: WorkspaceRecord | null;
  tunnel: {
    enabled: boolean;
    mode?: TunnelMode;
    hostname?: string;
    quickUrl?: string;
    healthy: boolean;
    status: string;
    lastError?: string;
  };
  toolCount: number;
  headless: boolean;
  pendingApprovals: number;
}

export interface ApprovalResponse {
  id: string;
  summary: string;
  tool: string;
  preview?: string;
  diff?: string;
  command?: string;
  status: string;
  ts: number;
  timeoutMs: number;
}

export class DaemonClient {
  constructor(
    readonly baseUrl: string,
    readonly paths: HandsPaths,
  ) {}

  static fromPaths(paths: HandsPaths, urlOverride?: string): DaemonClient {
    const cfg = loadGlobalConfig(paths);
    const base = urlOverride ?? `http://${cfg.host}:${cfg.port}`;
    return new DaemonClient(base.replace(/\/$/, ""), paths);
  }

  private async fetchJson<T>(pathname: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${pathname}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || res.statusText);
    }
    return (await res.json()) as T;
  }

  async isRunning(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/healthz`, { signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  state(): Promise<DaemonStateResponse> {
    return this.fetchJson("/api/state");
  }

  approvals(): Promise<ApprovalResponse[]> {
    return this.fetchJson("/api/approvals");
  }

  audit(
    opts: { limit?: number; tool?: string; workspaceId?: string; all?: boolean } = {},
  ): Promise<AuditEvent[]> {
    const q = new URLSearchParams();
    if (opts.limit !== undefined) q.set("limit", String(opts.limit));
    if (opts.tool) q.set("tool", opts.tool);
    if (opts.all) q.set("all", "1");
    else if (opts.workspaceId) q.set("workspaceId", opts.workspaceId);
    const qs = q.toString();
    return this.fetchJson(`/api/audit${qs ? `?${qs}` : ""}`);
  }

  decide(id: string, approved: boolean, reason?: string): Promise<unknown> {
    return this.fetchJson(`/api/approvals/${id}`, {
      method: "POST",
      body: JSON.stringify({ approved, reason }),
    });
  }

  decideAll(approved: boolean, reason?: string): Promise<{ count: number }> {
    return this.fetchJson("/api/approvals/decide-all", {
      method: "POST",
      body: JSON.stringify({ approved, reason }),
    });
  }

  setMode(
    mode: WorkspaceMode,
    scope: "workspace" | "project" = "workspace",
    workspaceId?: string,
  ): Promise<unknown> {
    return this.fetchJson("/api/mode", {
      method: "POST",
      body: JSON.stringify({ mode, scope, workspaceId }),
    });
  }

  workspaces(): Promise<WorkspaceRecord[]> {
    return this.fetchJson("/api/workspaces");
  }

  addWorkspace(root: string, name?: string): Promise<WorkspaceRecord> {
    return this.fetchJson("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ root, name }),
    });
  }

  activateWorkspace(id: string): Promise<WorkspaceRecord> {
    return this.fetchJson(`/api/workspaces/${encodeURIComponent(id)}/activate`, {
      method: "POST",
      body: "{}",
    });
  }

  setWorkspaceMode(id: string, mode: WorkspaceMode): Promise<WorkspaceRecord> {
    return this.fetchJson(`/api/workspaces/${encodeURIComponent(id)}/mode`, {
      method: "POST",
      body: JSON.stringify({ mode }),
    });
  }

  removeWorkspace(id: string): Promise<void> {
    return this.fetchJson(`/api/workspaces/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  effectiveConfig(): Promise<MergedConfig> {
    return this.fetchJson("/api/config");
  }

  globalConfig(): Promise<Record<string, unknown>> {
    return this.fetchJson("/api/config/global");
  }

  setGlobalConfig(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.fetchJson("/api/config/global", {
      method: "POST",
      body: JSON.stringify(patch),
    });
  }

  setAuthMode(mode: "none" | "bearer" | "oauth"): Promise<{ auth: unknown; warnings: string[] }> {
    return this.fetchJson("/api/auth/mode", {
      method: "POST",
      body: JSON.stringify({ mode }),
    });
  }

  oauthUrls(): Promise<{
    publicBaseUrl: string;
    mcpResource: string;
    protectedResourceMetadata: string;
    authorizationServer: string;
    externalIssuer: boolean;
  }> {
    return this.fetchJson("/api/auth/oauth-urls");
  }

  createToken(
    name: string,
  ): Promise<{ id: string; name: string; token: string; createdAt: number }> {
    return this.fetchJson("/api/tokens", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  setProjectConfig(patch: Record<string, unknown>): Promise<MergedConfig> {
    return this.fetchJson("/api/config/project", {
      method: "POST",
      body: JSON.stringify(patch),
    });
  }

  setTunnel(patch: {
    mode?: TunnelMode;
    enabled?: boolean;
    hostname?: string;
    token?: string;
    ngrokAuthtoken?: string;
    exposeUiOverTunnel?: boolean;
  }): Promise<unknown> {
    return this.fetchJson("/api/config/tunnel", {
      method: "POST",
      body: JSON.stringify(patch),
    });
  }

  tunnelStart(): Promise<unknown> {
    return this.fetchJson("/api/tunnel/start", { method: "POST", body: "{}" });
  }

  tunnelStop(): Promise<unknown> {
    return this.fetchJson("/api/tunnel/stop", { method: "POST", body: "{}" });
  }

  tunnelRestart(): Promise<unknown> {
    return this.fetchJson("/api/tunnel/restart", { method: "POST", body: "{}" });
  }

  tunnelQuick(): Promise<unknown> {
    return this.fetchJson("/api/tunnel/quick", { method: "POST", body: "{}" });
  }

  tunnelHealth(): Promise<{ ok: boolean }> {
    return this.fetchJson("/api/tunnel/health");
  }

  shutdown(): Promise<{ ok: boolean }> {
    return this.fetchJson("/api/shutdown", { method: "POST", body: "{}" });
  }
}

export interface EnsureDaemonOptions {
  root: string;
  home?: string;
  headless?: boolean;
  noTunnel?: boolean;
  mode?: WorkspaceMode;
}

export async function ensureDaemon(
  paths: HandsPaths,
  opts: EnsureDaemonOptions,
): Promise<DaemonClient> {
  const client = DaemonClient.fromPaths(paths);
  if (await client.isRunning()) return client;

  const handsBin = process.argv[1] ? path.resolve(process.argv[1]) : "hands";
  const args = [
    "start",
    "--headless",
    "--ensure-workspace",
    path.resolve(opts.root),
    "--home",
    paths.home,
  ];
  if (opts.noTunnel) args.push("--no-tunnel");
  if (opts.mode) args.push("--mode", opts.mode);

  const child = spawn(process.execPath, [handsBin, ...args], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      EDITER_CONTROL_SURFACE: "http",
    },
  });
  child.unref();

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await client.isRunning()) {
      if (fs.existsSync(paths.pidFile)) {
        return client;
      }
      await sleep(200);
      continue;
    }
    await sleep(200);
  }
  throw new Error("Timed out waiting for hands daemon to start");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type { GlobalConfig, ProjectConfig };
