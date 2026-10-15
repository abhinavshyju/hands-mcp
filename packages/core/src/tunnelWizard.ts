import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { HandsPaths } from "./paths.js";
import { ensureDir } from "./paths.js";
import { loadGlobalConfig, saveGlobalConfig } from "./config.js";
import { writeTunnelConfig } from "./tunnel.js";

export interface TunnelCreateParsed {
  name?: string;
  id?: string;
  credentialsFile?: string;
}

const CREDENTIALS_WRITTEN_RE = /credentials (?:file )?written to[^\n]*?([^\s'"]+\.json)/i;
const CREATED_WITH_ID_RE = /Created tunnel ([^\s]+) with id ([a-f0-9-]+)/i;
const TUNNEL_ID_RE = /with id ([a-f0-9-]{36})/i;

export function parseTunnelCreateOutput(output: string): TunnelCreateParsed {
  const result: TunnelCreateParsed = {};
  const credMatch = output.match(CREDENTIALS_WRITTEN_RE);
  if (credMatch?.[1]) {
    result.credentialsFile = credMatch[1].replace(/^['"]|['"]$/g, "");
  }
  const createdMatch = output.match(CREATED_WITH_ID_RE);
  if (createdMatch) {
    result.name = createdMatch[1];
    result.id = createdMatch[2];
  } else {
    const idMatch = output.match(TUNNEL_ID_RE);
    if (idMatch?.[1]) result.id = idMatch[1];
  }
  return result;
}

export function resolveCredentialsFile(
  credDir: string,
  opts: { parsedPath?: string; tunnelId?: string },
): string | undefined {
  if (opts.parsedPath && fs.existsSync(opts.parsedPath)) {
    return opts.parsedPath;
  }
  if (opts.tunnelId) {
    const byId = path.join(credDir, `${opts.tunnelId}.json`);
    if (fs.existsSync(byId)) return byId;
  }
  if (!fs.existsSync(credDir)) return undefined;
  const jsonFiles = fs.readdirSync(credDir).filter((f) => f.endsWith(".json"));
  if (jsonFiles.length === 1) {
    return path.join(credDir, jsonFiles[0]!);
  }
  return undefined;
}

export interface RunCloudflaredResult {
  ok: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
}

export function runCloudflared(
  bin: string,
  args: string[],
  opts?: { inheritStdio?: boolean },
): RunCloudflaredResult {
  const inherit = opts?.inheritStdio ?? false;
  const res = spawnSync(bin, args, {
    encoding: "utf8",
    stdio: inherit ? "inherit" : "pipe",
  });
  return {
    ok: res.status === 0,
    status: res.status,
    stdout: typeof res.stdout === "string" ? res.stdout : "",
    stderr: typeof res.stderr === "string" ? res.stderr : "",
  };
}

export function defaultTunnelName(): string {
  const host = os
    .hostname()
    .replace(/[^a-zA-Z0-9-]/g, "")
    .slice(0, 20);
  return `hands-${host || "local"}`;
}

export interface ApplyNamedTunnelOpts {
  tunnelId: string;
  tunnelName: string;
  hostname: string;
  credentialsFile: string;
  port: number;
}

export function applyNamedTunnelConfig(paths: HandsPaths, opts: ApplyNamedTunnelOpts): string {
  ensureDir(paths.tunnel);
  const destCreds = path.join(paths.tunnel, "credentials.json");
  if (opts.credentialsFile !== destCreds && fs.existsSync(opts.credentialsFile)) {
    fs.copyFileSync(opts.credentialsFile, destCreds);
  }
  const configFile = writeTunnelConfig(paths, {
    tunnelId: opts.tunnelId,
    credentialsFile: destCreds,
    hostname: opts.hostname,
    port: opts.port,
  });
  const cfg = loadGlobalConfig(paths);
  cfg.tunnel = {
    ...cfg.tunnel,
    enabled: true,
    mode: "named",
    hostname: opts.hostname,
    tunnelName: opts.tunnelName,
    credentialsFile: destCreds,
    configFile,
  };
  saveGlobalConfig(paths, cfg);
  return configFile;
}

export function cloudflaredCredDir(): string {
  return path.join(os.homedir(), ".cloudflared");
}
