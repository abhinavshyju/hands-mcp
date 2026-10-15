import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  applyNamedTunnelConfig,
  cloudflaredCredDir,
  defaultTunnelName,
  loadGlobalConfig,
  parseTunnelCreateOutput,
  resolveCredentialsFile,
  runCloudflared,
  type HandsRuntime,
} from "@hands/core";
import { hint, success } from "./ui/render.js";

export async function cloudflaredBin(rt: HandsRuntime): Promise<string> {
  return rt.tunnel.ensureBinary();
}

export function failCloudflared(
  step: string,
  res: { status: number | null; stderr: string },
): never {
  const detail = res.stderr.trim() || `exit ${res.status ?? "unknown"}`;
  console.error(`${step} failed: ${detail}`);
  process.exit(res.status === null ? 1 : res.status || 1);
}

export async function runTunnelLogin(rt: HandsRuntime): Promise<void> {
  const bin = await cloudflaredBin(rt);
  const res = runCloudflared(bin, ["tunnel", "login"], { inheritStdio: true });
  if (!res.ok) failCloudflared("cloudflared tunnel login", res);
}

export async function runTunnelCreate(
  rt: HandsRuntime,
  name?: string,
): Promise<{ name: string; id: string; credentialsFile: string }> {
  const bin = await cloudflaredBin(rt);
  const tunnelName = name?.trim() || defaultTunnelName();
  const res = runCloudflared(bin, ["tunnel", "create", tunnelName]);
  if (!res.ok) failCloudflared("cloudflared tunnel create", res);
  const combined = `${res.stdout}\n${res.stderr}`;
  const parsed = parseTunnelCreateOutput(combined);
  const credDir = cloudflaredCredDir();
  const credentialsFile = resolveCredentialsFile(credDir, {
    parsedPath: parsed.credentialsFile,
    tunnelId: parsed.id,
  });
  if (!credentialsFile) {
    console.error("Could not locate tunnel credentials file after create.");
    process.exit(1);
  }
  const id = parsed.id ?? tunnelName;
  return {
    name: parsed.name ?? tunnelName,
    id,
    credentialsFile,
  };
}

export async function runTunnelRouteDns(
  rt: HandsRuntime,
  hostname: string,
  tunnelName?: string,
): Promise<void> {
  const bin = await cloudflaredBin(rt);
  const cfg = loadGlobalConfig(rt.paths);
  const name = tunnelName?.trim() || cfg.tunnel.tunnelName;
  if (!name) {
    console.error("Tunnel name required (--name or configured tunnelName).");
    process.exit(1);
  }
  const res = runCloudflared(bin, ["tunnel", "route", "dns", name, hostname.trim()], {
    inheritStdio: true,
  });
  if (!res.ok) failCloudflared("cloudflared tunnel route dns", res);
}

export async function runTunnelList(rt: HandsRuntime): Promise<void> {
  const bin = await cloudflaredBin(rt);
  const res = runCloudflared(bin, ["tunnel", "list"], { inheritStdio: true });
  if (!res.ok) failCloudflared("cloudflared tunnel list", res);
}

export async function promptHostname(defaultValue?: string): Promise<string> {
  if (defaultValue?.trim()) return defaultValue.trim();
  const rl = readline.createInterface({ input, output });
  const hostname = await rl.question("Public hostname (e.g. hands.example.com): ");
  rl.close();
  const trimmed = hostname.trim();
  if (!trimmed) {
    console.error("Hostname is required.");
    process.exit(1);
  }
  return trimmed;
}

export interface SetupNamedTunnelOpts {
  skipLogin?: boolean;
  name?: string;
  hostname?: string;
}

export async function setupNamedTunnel(
  rt: HandsRuntime,
  opts: SetupNamedTunnelOpts,
): Promise<void> {
  const bin = await cloudflaredBin(rt);
  hint(`Using ${bin}`);
  if (!opts.skipLogin) {
    await runTunnelLogin(rt);
  }
  const created = await runTunnelCreate(rt, opts.name);
  const hostname = await promptHostname(opts.hostname);
  await runTunnelRouteDns(rt, hostname, created.name);
  const cfg = loadGlobalConfig(rt.paths);
  applyNamedTunnelConfig(rt.paths, {
    tunnelId: created.id,
    tunnelName: created.name,
    hostname,
    credentialsFile: created.credentialsFile,
    port: cfg.port,
  });
  success(`Tunnel configured. MCP URL: https://${hostname}/mcp`);
}
