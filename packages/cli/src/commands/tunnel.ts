import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { spawnSync } from "node:child_process";
import type { Command } from "commander";
import {
  ensureDir,
  loadGlobalConfig,
  saveGlobalConfig,
  writeTunnelConfig,
} from "@editer/core";
import type { TunnelMode } from "@editer/shared";
import { runtimeFromOpts } from "../runtime-opts.js";
import { withDaemon } from "./config.js";

export function registerTunnel(program: Command): void {
  const tunnel = program.command("tunnel").description("Cloudflare tunnel configuration");

  tunnel
    .command("status")
    .option("--check", "Verify public /healthz")
    .option("--home <dir>")
    .action(async (opts: { check?: boolean; home?: string }) => {
      const rt = runtimeFromOpts(opts);
      const { DaemonClient } = await import("@editer/core");
      const client = DaemonClient.fromPaths(rt.paths);
      if (await client.isRunning()) {
        const st = await client.state();
        console.log(JSON.stringify(st.tunnel, null, 2));
        if (opts.check && st.tunnel.hostname) {
          const health = await client.tunnelHealth();
          console.log(`Public health: ${health.ok ? "ok" : "failed"}`);
        }
        return;
      }
      const cfg = loadGlobalConfig(rt.paths);
      console.log(JSON.stringify(cfg.tunnel, null, 2));
    });

  tunnel
    .command("quick")
    .description("Enable ephemeral trycloudflare tunnel")
    .option("--home <dir>")
    .action(async (opts: { home?: string }) => {
      const rt = runtimeFromOpts(opts);
      const ws = rt.workspaces.getActive();
      const root = ws?.root ?? process.cwd();
      await withDaemon(rt, root, async (c) => {
        const out = await c.tunnelQuick();
        console.log(JSON.stringify(out, null, 2));
      });
    });

  tunnel
    .command("token")
    .argument("<token>")
    .option("--hostname <h>")
    .option("--home <dir>")
    .action(async (token: string, opts: { hostname?: string; home?: string }) => {
      const rt = runtimeFromOpts(opts);
      const ws = rt.workspaces.requireActive();
      await withDaemon(rt, ws.root, (c) =>
        c.setTunnel({ mode: "token", token, hostname: opts.hostname, enabled: true }),
      );
      console.log("Tunnel mode: token");
    });

  tunnel
    .command("set")
    .option("--hostname <h>")
    .option("--mode <m>", "off|quick|token|named")
    .option("--expose-ui", "Expose web UI over tunnel")
    .option("--no-expose-ui", "Do not expose web UI over tunnel")
    .option("--home <dir>")
    .action(async (opts: { hostname?: string; mode?: string; exposeUi?: boolean; noExposeUi?: boolean; home?: string }) => {
      const rt = runtimeFromOpts(opts);
      const ws = rt.workspaces.requireActive();
      const patch: { hostname?: string; mode?: TunnelMode; exposeUiOverTunnel?: boolean; enabled?: boolean } = {};
      if (opts.hostname) patch.hostname = opts.hostname;
      if (opts.mode) {
        patch.mode = opts.mode as TunnelMode;
        patch.enabled = opts.mode !== "off";
      }
      if (opts.exposeUi) patch.exposeUiOverTunnel = true;
      if (opts.noExposeUi) patch.exposeUiOverTunnel = false;
      await withDaemon(rt, ws.root, (c) => c.setTunnel(patch));
      console.log("Tunnel config updated.");
    });

  tunnel
    .command("enable")
    .option("--home <dir>")
    .action(async (opts: { home?: string }) => {
      const rt = runtimeFromOpts(opts);
      const ws = rt.workspaces.requireActive();
      const cfg = loadGlobalConfig(rt.paths);
      const mode = cfg.tunnel.mode && cfg.tunnel.mode !== "off" ? cfg.tunnel.mode : "named";
      await withDaemon(rt, ws.root, (c) => c.setTunnel({ enabled: true, mode }));
      console.log(`Tunnel enabled (${mode})`);
    });

  tunnel
    .command("disable")
    .option("--home <dir>")
    .action(async (opts: { home?: string }) => {
      const rt = runtimeFromOpts(opts);
      const ws = rt.workspaces.requireActive();
      await withDaemon(rt, ws.root, (c) => c.setTunnel({ mode: "off", enabled: false }));
      console.log("Tunnel disabled");
    });

  tunnel
    .command("restart")
    .option("--home <dir>")
    .action(async (opts: { home?: string }) => {
      const rt = runtimeFromOpts(opts);
      const ws = rt.workspaces.requireActive();
      await withDaemon(rt, ws.root, (c) => c.tunnelRestart());
      console.log("Tunnel restarted");
    });

  tunnel
    .command("install")
    .description("Download cloudflared to ~/.editer/bin")
    .option("--home <dir>")
    .action(async (opts: { home?: string }) => {
      const rt = runtimeFromOpts(opts);
      const bin = await rt.tunnel.ensureBinary();
      console.log(bin);
    });

  tunnel
    .command("setup")
    .description("Create a Cloudflare named tunnel (requires cloudflared login)")
    .option("--home <dir>")
    .action(async (opts: { home?: string }) => {
      const rt = runtimeFromOpts(opts);
      const bin = await rt.tunnel.ensureBinary();
      console.log(`Using ${bin}`);
      spawnSync(bin, ["tunnel", "login"], { stdio: "inherit" });
      const name = `editer-${os.hostname().replace(/[^a-zA-Z0-9-]/g, "").slice(0, 20) || "local"}`;
      spawnSync(bin, ["tunnel", "create", name], { stdio: "inherit" });
      const credDir = path.join(os.homedir(), ".cloudflared");
      const cred = fs.existsSync(credDir)
        ? fs.readdirSync(credDir).find((f) => f.endsWith(".json"))
        : undefined;
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const hostname = await rl.question("Public hostname (e.g. editer.example.com): ");
      rl.close();
      const credentialsFile = cred ? path.join(credDir, cred) : path.join(rt.paths.tunnel, "credentials.json");
      ensureDir(rt.paths.tunnel);
      if (cred) fs.copyFileSync(path.join(credDir, cred), path.join(rt.paths.tunnel, "credentials.json"));
      const cfg = loadGlobalConfig(rt.paths);
      const configFile = writeTunnelConfig(rt.paths, {
        tunnelId: name,
        credentialsFile: fs.existsSync(path.join(rt.paths.tunnel, "credentials.json"))
          ? path.join(rt.paths.tunnel, "credentials.json")
          : credentialsFile,
        hostname: hostname.trim(),
        port: cfg.port,
      });
      spawnSync(bin, ["tunnel", "route", "dns", name, hostname.trim()], { stdio: "inherit" });
      cfg.tunnel = {
        ...cfg.tunnel,
        enabled: true,
        mode: "named",
        hostname: hostname.trim(),
        tunnelName: name,
        credentialsFile: path.join(rt.paths.tunnel, "credentials.json"),
        configFile,
      };
      saveGlobalConfig(rt.paths, cfg);
      console.log(`Tunnel configured. MCP URL: https://${hostname.trim()}/mcp`);
    });
}
