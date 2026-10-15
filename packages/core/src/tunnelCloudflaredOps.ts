import fs from "node:fs";
import { loadGlobalConfig } from "./config.js";
import type { HandsPaths } from "./paths.js";
import type { HandsRuntime } from "./runtime.js";
import {
  applyNamedTunnelConfig,
  cloudflaredCredDir,
  defaultTunnelName,
  parseTunnelCreateOutput,
  resolveCredentialsFile,
  runCloudflared,
} from "./tunnelWizard.js";

const LOGIN_URL_RE = /https:\/\/[^\s]+cloudflareaccess[^\s]+/i;

export function parseCloudflaredLoginUrl(output: string): string | undefined {
  const m = output.match(LOGIN_URL_RE) ?? output.match(/(https:\/\/[^\s]+)/);
  return m?.[1] ?? m?.[0];
}

export async function tunnelInstallBinary(rt: HandsRuntime): Promise<{ bin: string }> {
  const bin = await rt.tunnel.ensureBinary();
  return { bin };
}

export async function tunnelLogin(rt: HandsRuntime): Promise<{
  ok: boolean;
  loginUrl?: string;
  stdout: string;
  stderr: string;
}> {
  const bin = await rt.tunnel.ensureBinary();
  const res = runCloudflared(bin, ["tunnel", "login"]);
  const combined = `${res.stdout}\n${res.stderr}`;
  return {
    ok: res.ok,
    loginUrl: parseCloudflaredLoginUrl(combined),
    stdout: res.stdout,
    stderr: res.stderr,
  };
}

export async function tunnelCreateNamed(
  rt: HandsRuntime,
  name?: string,
): Promise<{ name: string; id: string; credentialsFile: string }> {
  const bin = await rt.tunnel.ensureBinary();
  const tunnelName = name?.trim() || defaultTunnelName();
  const res = runCloudflared(bin, ["tunnel", "create", tunnelName]);
  if (!res.ok) {
    throw new Error(res.stderr.trim() || `cloudflared tunnel create failed (${res.status})`);
  }
  const combined = `${res.stdout}\n${res.stderr}`;
  const parsed = parseTunnelCreateOutput(combined);
  const credDir = cloudflaredCredDir();
  const credentialsFile = resolveCredentialsFile(credDir, {
    parsedPath: parsed.credentialsFile,
    tunnelId: parsed.id,
  });
  if (!credentialsFile) {
    throw new Error("Could not locate tunnel credentials file after create");
  }
  return {
    name: parsed.name ?? tunnelName,
    id: parsed.id ?? tunnelName,
    credentialsFile,
  };
}

export async function tunnelListText(rt: HandsRuntime): Promise<string> {
  const bin = await rt.tunnel.ensureBinary();
  const res = runCloudflared(bin, ["tunnel", "list"]);
  if (!res.ok) {
    throw new Error(res.stderr.trim() || "cloudflared tunnel list failed");
  }
  return `${res.stdout}${res.stderr}`.trim();
}

export async function tunnelRouteDns(
  rt: HandsRuntime,
  hostname: string,
  tunnelName?: string,
): Promise<void> {
  const bin = await rt.tunnel.ensureBinary();
  const cfg = loadGlobalConfig(rt.paths);
  const name = tunnelName?.trim() || cfg.tunnel.tunnelName;
  if (!name) {
    throw new Error("Tunnel name required (--name or configured tunnelName)");
  }
  const res = runCloudflared(bin, ["tunnel", "route", "dns", name, hostname.trim()]);
  if (!res.ok) {
    throw new Error(res.stderr.trim() || "cloudflared tunnel route dns failed");
  }
}

export async function tunnelSetupNamed(
  rt: HandsRuntime,
  opts: { hostname: string; name?: string; skipLogin?: boolean },
): Promise<{ mcpUrl: string; tunnelName: string; hostname: string }> {
  const hostname = opts.hostname?.trim();
  if (!hostname) {
    throw new Error("hostname is required (use --hostname hands.example.com)");
  }
  await rt.tunnel.ensureBinary();
  if (!opts.skipLogin) {
    const login = await tunnelLogin(rt);
    if (!login.ok) {
      throw new Error(login.stderr.trim() || "cloudflared tunnel login failed");
    }
  }
  const created = await tunnelCreateNamed(rt, opts.name);
  await tunnelRouteDns(rt, hostname, created.name);
  const cfg = loadGlobalConfig(rt.paths);
  applyNamedTunnelConfig(rt.paths, {
    tunnelId: created.id,
    tunnelName: created.name,
    hostname,
    credentialsFile: created.credentialsFile,
    port: cfg.port,
  });
  return { mcpUrl: `https://${hostname}/mcp`, tunnelName: created.name, hostname };
}

export function redactedTunnelConfigView(paths: HandsPaths): Record<string, unknown> {
  const cfg = loadGlobalConfig(paths).tunnel;
  return {
    enabled: cfg.enabled,
    mode: cfg.mode,
    hostname: cfg.hostname,
    tunnelName: cfg.tunnelName,
    tokenSet: Boolean(cfg.token),
    ngrokAuthtokenSet: Boolean(cfg.ngrokAuthtoken),
    credentialsFileSet: Boolean(cfg.credentialsFile && fs.existsSync(cfg.credentialsFile)),
    configFileSet: Boolean(cfg.configFile && fs.existsSync(cfg.configFile)),
    quickUrl: cfg.quickUrl,
  };
}
