import type { Command } from "commander";
import { loadGlobalConfig } from "@hands/core";
import type { TunnelMode } from "@hands/shared";
import { runtimeFromOpts } from "../runtime-opts.js";
import { withDaemon } from "./config.js";
import {
  cloudflaredBin,
  runTunnelCreate,
  runTunnelList,
  runTunnelLogin,
  runTunnelRouteDns,
  setupNamedTunnel,
} from "../tunnel-cloudflared.js";
import { hint, info, printJson, success, writeln } from "../ui/render.js";
import { styles } from "../ui/theme.js";

type HomeOpts = { home?: string };

export function registerTunnel(program: Command): void {
  const tunnel = program
    .command("tunnel")
    .description("Public URL tunnels (Cloudflare quick/token/named, or ngrok)");

  tunnel
    .command("status")
    .option("--check", "Verify public /healthz")
    .option("--home <dir>")
    .action(async (opts: { check?: boolean; home?: string }) => {
      const rt = runtimeFromOpts(opts);
      const { DaemonClient } = await import("@hands/core");
      const client = DaemonClient.fromPaths(rt.paths);
      if (await client.isRunning()) {
        const st = await client.state();
        printJson(st.tunnel);
        if (opts.check && st.tunnel.hostname) {
          const health = await client.tunnelHealth();
          info(`Public health: ${health.ok ? styles.ok("ok") : styles.err("failed")}`);
        }
        return;
      }
      const cfg = loadGlobalConfig(rt.paths);
      printJson(cfg.tunnel);
    });

  tunnel
    .command("ngrok")
    .description("Expose MCP via ngrok (requires ngrok on PATH or ~/.hands/bin/ngrok)")
    .option("--authtoken <t>", "ngrok authtoken (or set NGROK_AUTHTOKEN)")
    .option("--home <dir>")
    .action(async (opts: { authtoken?: string; home?: string }) => {
      const rt = runtimeFromOpts(opts);
      const ws = rt.workspaces.requireActive();
      await withDaemon(rt, ws.root, async (c) => {
        await c.setTunnel({
          mode: "ngrok",
          enabled: true,
          ...(opts.authtoken ? { ngrokAuthtoken: opts.authtoken } : {}),
        });
        const out = await c.tunnelRestart();
        printJson(out);
      });
      hint("Tunnel mode: ngrok (check logs/UI for public URL)");
    });

  tunnel
    .command("quick")
    .description("Enable ephemeral trycloudflare tunnel")
    .option("--home <dir>")
    .action(async (opts: HomeOpts) => {
      const rt = runtimeFromOpts(opts);
      const ws = rt.workspaces.getActive();
      const root = ws?.root ?? process.cwd();
      await withDaemon(rt, root, async (c) => {
        const out = await c.tunnelQuick();
        printJson(out);
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
      success("Tunnel mode: token");
    });

  tunnel
    .command("set")
    .option("--hostname <h>")
    .option("--mode <m>", "off|quick|token|named|ngrok")
    .option("--expose-ui", "Expose web UI over tunnel")
    .option("--no-expose-ui", "Do not expose web UI over tunnel")
    .option("--home <dir>")
    .action(
      async (opts: {
        hostname?: string;
        mode?: string;
        exposeUi?: boolean;
        noExposeUi?: boolean;
        home?: string;
      }) => {
        const rt = runtimeFromOpts(opts);
        const ws = rt.workspaces.requireActive();
        const patch: {
          hostname?: string;
          mode?: TunnelMode;
          exposeUiOverTunnel?: boolean;
          enabled?: boolean;
        } = {};
        if (opts.hostname) patch.hostname = opts.hostname;
        if (opts.mode) {
          patch.mode = opts.mode as TunnelMode;
          patch.enabled = opts.mode !== "off";
        }
        if (opts.exposeUi) patch.exposeUiOverTunnel = true;
        if (opts.noExposeUi) patch.exposeUiOverTunnel = false;
        await withDaemon(rt, ws.root, (c) => c.setTunnel(patch));
        success("Tunnel config updated.");
      },
    );

  tunnel
    .command("enable")
    .option("--home <dir>")
    .action(async (opts: HomeOpts) => {
      const rt = runtimeFromOpts(opts);
      const ws = rt.workspaces.requireActive();
      const cfg = loadGlobalConfig(rt.paths);
      const mode = cfg.tunnel.mode && cfg.tunnel.mode !== "off" ? cfg.tunnel.mode : "named";
      await withDaemon(rt, ws.root, (c) => c.setTunnel({ enabled: true, mode }));
      success(`Tunnel enabled (${mode})`);
    });

  tunnel
    .command("disable")
    .option("--home <dir>")
    .action(async (opts: HomeOpts) => {
      const rt = runtimeFromOpts(opts);
      const ws = rt.workspaces.requireActive();
      await withDaemon(rt, ws.root, (c) => c.setTunnel({ mode: "off", enabled: false }));
      success("Tunnel disabled");
    });

  tunnel
    .command("restart")
    .option("--home <dir>")
    .action(async (opts: HomeOpts) => {
      const rt = runtimeFromOpts(opts);
      const ws = rt.workspaces.requireActive();
      await withDaemon(rt, ws.root, (c) => c.tunnelRestart());
      success("Tunnel restarted");
    });

  tunnel
    .command("start")
    .description("Start cloudflared via the running daemon")
    .option("--home <dir>")
    .action(async (opts: HomeOpts) => {
      const rt = runtimeFromOpts(opts);
      const ws = rt.workspaces.requireActive();
      await withDaemon(rt, ws.root, async (c) => {
        const out = await c.tunnelStart();
        printJson(out);
      });
    });

  tunnel
    .command("stop")
    .description("Stop cloudflared via the running daemon")
    .option("--home <dir>")
    .action(async (opts: HomeOpts) => {
      const rt = runtimeFromOpts(opts);
      const ws = rt.workspaces.requireActive();
      await withDaemon(rt, ws.root, async (c) => {
        const out = await c.tunnelStop();
        printJson(out);
      });
    });

  tunnel
    .command("install")
    .description("Download cloudflared to ~/.hands/bin")
    .option("--home <dir>")
    .action(async (opts: HomeOpts) => {
      const rt = runtimeFromOpts(opts);
      const bin = await cloudflaredBin(rt);
      writeln(bin);
    });

  tunnel
    .command("login")
    .description("Authenticate cloudflared with Cloudflare")
    .option("--home <dir>")
    .action(async (opts: HomeOpts) => {
      const rt = runtimeFromOpts(opts);
      await runTunnelLogin(rt);
    });

  tunnel
    .command("create")
    .description("Create a named Cloudflare tunnel")
    .option("--name <n>", "Tunnel name")
    .option("--home <dir>")
    .action(async (opts: { name?: string; home?: string }) => {
      const rt = runtimeFromOpts(opts);
      const created = await runTunnelCreate(rt, opts.name);
      printJson(created);
    });

  const route = tunnel.command("route").description("Configure tunnel routing");

  route
    .command("dns")
    .description("Create a DNS CNAME for a tunnel hostname")
    .argument("<hostname>", "Public hostname (e.g. hands.example.com)")
    .option("--name <n>", "Tunnel name")
    .option("--home <dir>")
    .action(async (hostname: string, opts: { name?: string; home?: string }) => {
      const rt = runtimeFromOpts(opts);
      await runTunnelRouteDns(rt, hostname, opts.name);
    });

  tunnel
    .command("list")
    .description("List Cloudflare tunnels")
    .option("--home <dir>")
    .action(async (opts: HomeOpts) => {
      const rt = runtimeFromOpts(opts);
      await runTunnelList(rt);
    });

  tunnel
    .command("setup")
    .description("Create a Cloudflare named tunnel (login, create, DNS, config)")
    .option("--home <dir>")
    .option("--skip-login", "Skip cloudflared tunnel login")
    .option("--name <n>", "Tunnel name")
    .option("--hostname <h>", "Public hostname (non-interactive)")
    .action(
      async (opts: { home?: string; skipLogin?: boolean; name?: string; hostname?: string }) => {
        const rt = runtimeFromOpts(opts);
        await setupNamedTunnel(rt, {
          skipLogin: opts.skipLogin,
          name: opts.name,
          hostname: opts.hostname,
        });
      },
    );
}
