#!/usr/bin/env node
import { Command } from "commander";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { spawnSync } from "node:child_process";
import {
  EditerRuntime,
  buildMcpConnect,
  loadGlobalConfig,
  saveGlobalConfig,
  writeTunnelConfig,
  ensureDir,
  type McpConnectClient,
} from "@editer/core";
import { serveStdio, startServer } from "@editer/server";
import { pluginScaffold, registerBuiltins, ToolRegistry } from "@editer/tools";
import { APP_NAME, APP_VERSION } from "@editer/shared";

const program = new Command();
program
  .name("editer")
  .description("Local coding-agent MCP daemon. Install with `pnpm run install:global` from the editer-mcp repo.")
  .version(APP_VERSION);

function runtimeFromOpts(opts: {
  home?: string;
  headless?: boolean;
  host?: string;
  port?: string;
  noTunnel?: boolean;
  mode?: string;
}): EditerRuntime {
  return new EditerRuntime({
    home: opts.home,
    headless: opts.headless,
    host: opts.host,
    port: opts.port ? Number(opts.port) : undefined,
    noTunnel: opts.noTunnel,
    modeOverride: opts.mode as EditerRuntime["modeOverride"],
  });
}

program
  .command("init")
  .description("Create ~/.editer config")
  .option("--home <dir>")
  .action((opts: { home?: string }) => {
    const rt = runtimeFromOpts(opts);
    ensureDir(rt.paths.home);
    ensureDir(rt.paths.pluginDir);
    saveGlobalConfig(rt.paths, loadGlobalConfig(rt.paths));
    console.log(`Initialized ${rt.paths.home}`);
  });

program
  .command("start")
  .description("Start the editer daemon")
  .option("--headless")
  .option("--no-tunnel")
  .option("--mode <mode>")
  .option("--host <host>")
  .option("--port <port>")
  .option("--home <dir>")
  .option("--ensure-workspace <path>", "Register and activate this folder if missing")
  .action(async (opts: {
    home?: string;
    headless?: boolean;
    host?: string;
    port?: string;
    noTunnel?: boolean;
    mode?: string;
    ensureWorkspace?: string;
  }) => {
    const rt = runtimeFromOpts(opts);
    ensureDir(rt.paths.home);
    const ensurePath =
      opts.ensureWorkspace?.trim() ||
      process.env.EDITER_AUTO_WORKSPACE?.trim();
    if (ensurePath) {
      rt.workspaces.add(path.resolve(ensurePath));
    }
    // mcp-ide spawns this process with EDITER_CONTROL_SURFACE=http so native
    // workbench views can decide via POST /api/approvals without a TTY.
    if (process.env.EDITER_CONTROL_SURFACE === "http") {
      rt.approvals.addSurface((req) => {
        console.log(`\n[approval] ${req.summary}\n  id=${req.id}  (approve in MCP IDE)`);
      });
    } else if (!rt.headless) {
      rt.approvals.addSurface((req) => {
        console.log(`\n[approval] ${req.summary}\n  id=${req.id}  (open the UI to approve)`);
      });
    } else {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rt.approvals.addSurface((req) => {
        void (async () => {
          try {
            const answer = await rl.question(`Approve ${req.summary}? [y/N] `);
            rt.approvals.decide(req.id, /^y(es)?$/i.test(answer.trim()), "cli");
          } catch {
            rt.approvals.decide(req.id, false, "cli-closed");
          }
        })();
      });
    }

    const started = await startServer(rt);
    fs.writeFileSync(rt.paths.pidFile, String(process.pid), "utf8");
    const cfg = loadGlobalConfig(rt.paths);
    console.log(`${APP_NAME} ${APP_VERSION}`);
    console.log(`Local:   ${started.url}`);
    console.log(`MCP:     ${started.url}/mcp`);
    if (cfg.tunnel.hostname) console.log(`Tunnel:  https://${cfg.tunnel.hostname}/mcp`);
    console.log(`Tools:   ${started.registry.list().length}`);
    console.log(`Mode:    ${rt.merged().mode}${rt.headless ? " (headless)" : ""}`);
  });

program
  .command("stop")
  .description("Stop a daemon started with `editer start`")
  .option("--home <dir>")
  .action((opts: { home?: string }) => {
    const rt = runtimeFromOpts(opts);
    if (!fs.existsSync(rt.paths.pidFile)) {
      console.log("No pid file; daemon not running?");
      return;
    }
    const pid = Number(fs.readFileSync(rt.paths.pidFile, "utf8"));
    try {
      process.kill(pid, "SIGTERM");
      console.log(`Sent SIGTERM to ${pid}`);
    } catch {
      console.log("Process not running");
    }
    fs.unlinkSync(rt.paths.pidFile);
  });

program
  .command("status")
  .option("--home <dir>")
  .action(async (opts: { home?: string }) => {
    const rt = runtimeFromOpts(opts);
    const cfg = loadGlobalConfig(rt.paths);
    const running = fs.existsSync(rt.paths.pidFile);
    console.log(JSON.stringify({ running, port: cfg.port, tunnel: cfg.tunnel, workspaces: cfg.workspaces.length }, null, 2));
  });

program
  .command("logs")
  .option("--home <dir>")
  .action((opts: { home?: string }) => {
    const rt = runtimeFromOpts(opts);
    const events = rt.audit.query({ limit: 50 });
    for (const e of events.reverse()) {
      console.log(`${new Date(e.ts).toISOString()} ${e.type} ${e.tool ?? ""} ${e.error ?? ""}`);
    }
  });

const ws = program.command("workspace");
ws.command("add")
  .argument("<root>")
  .option("--name <name>")
  .option("--home <dir>")
  .action((root: string, opts: { name?: string; home?: string }) => {
    const rt = runtimeFromOpts(opts);
    const rec = rt.workspaces.add(path.resolve(root), opts.name);
    console.log(`Active workspace: ${rec.name} (${rec.root})`);
  });
ws.command("list")
  .option("--home <dir>")
  .action((opts: { home?: string }) => {
    const rt = runtimeFromOpts(opts);
    for (const w of rt.workspaces.list()) {
      const mark = rt.workspaces.getActive()?.id === w.id ? "*" : " ";
      console.log(`${mark} ${w.id}  ${w.mode}  ${w.name}  ${w.root}`);
    }
  });
ws.command("remove")
  .argument("<id>")
  .option("--home <dir>")
  .action((id: string, opts: { home?: string }) => {
    runtimeFromOpts(opts).workspaces.remove(id);
  });

const token = program.command("token");
token
  .command("new")
  .argument("<name>")
  .option("--home <dir>")
  .action((name: string, opts: { home?: string }) => {
    const t = runtimeFromOpts(opts).tokens.create(name);
    console.log(`${t.name}\t${t.id}\t${t.token}`);
  });
token
  .command("list")
  .option("--home <dir>")
  .action((opts: { home?: string }) => {
    for (const t of runtimeFromOpts(opts).tokens.list()) {
      console.log(`${t.name}\t${t.id}\t${t.createdAt}`);
    }
  });
token
  .command("revoke")
  .argument("<id>")
  .option("--home <dir>")
  .action((id: string, opts: { home?: string }) => {
    runtimeFromOpts(opts).tokens.revoke(id);
  });

program
  .command("mode")
  .command("set")
  .argument("<mode>", "readonly|review|auto")
  .option("--home <dir>")
  .action((mode: string, opts: { home?: string }) => {
    const rt = runtimeFromOpts(opts);
    const ws = rt.workspace();
    rt.workspaces.setMode(ws.id, mode as "readonly" | "review" | "auto");
    console.log(`Mode for ${ws.name}: ${mode}`);
  });

program
  .command("stdio")
  .description("Serve MCP over stdio for same-machine clients")
  .option("--home <dir>")
  .option("--mode <mode>")
  .action(async (opts: { home?: string; mode?: string }) => {
    const rt = runtimeFromOpts(opts);
    const registry = new ToolRegistry();
    registerBuiltins(registry);
    await serveStdio(rt, registry);
  });

program
  .command("connect")
  .description("Print MCP connector config for a client")
  .option("--client <name>", "claude|cursor|generic", "generic")
  .option("--home <dir>")
  .action((opts: { client?: string; home?: string }) => {
    const rt = runtimeFromOpts(opts);
    const client = (opts.client ?? "generic") as McpConnectClient;
    try {
      const out = buildMcpConnect(rt, client);
      if (client === "claude") {
        console.log("Paste into Claude Desktop mcp config:\n");
      } else if (client === "cursor") {
        console.log("Cursor MCP config:\n");
      }
      console.log(out.pasteText);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const tunnel = program.command("tunnel");
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
      enabled: true,
      hostname: hostname.trim(),
      tunnelName: name,
      credentialsFile: path.join(rt.paths.tunnel, "credentials.json"),
      configFile,
    };
    saveGlobalConfig(rt.paths, cfg);
    console.log(`Tunnel configured. MCP URL: https://${hostname.trim()}/mcp`);
  });

const tool = program.command("tool");
tool
  .command("new")
  .argument("<name>")
  .option("--home <dir>")
  .action((name: string, opts: { home?: string }) => {
    const rt = runtimeFromOpts(opts);
    ensureDir(rt.paths.pluginDir);
    const file = path.join(rt.paths.pluginDir, `${name}.js`);
    fs.writeFileSync(file, pluginScaffold(name), "utf8");
    console.log(`Wrote ${file}`);
  });

await program.parseAsync(process.argv);
