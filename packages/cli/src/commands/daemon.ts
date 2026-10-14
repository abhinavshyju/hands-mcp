import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import { DaemonClient, loadGlobalConfig, ensureDir } from "@editer/core";
import { startServer } from "@editer/server";
import { APP_NAME, APP_VERSION } from "@editer/shared";
import { runtimeFromOpts } from "../runtime-opts.js";
import { attachApprovalSurfaces } from "../approval-surfaces.js";
import { applySessionTunnelFlags, openBrowser, runInteractiveConsole } from "../console.js";
import { ensureGlobalHome, ensureProjectDir, registerProjectWorkspace } from "../project-setup.js";
import { stopEditerDaemon } from "../shutdown.js";
import type { StartedServer } from "@editer/server";

export interface StartOpts {
  home?: string;
  headless?: boolean;
  host?: string;
  port?: string;
  noTunnel?: boolean;
  mode?: string;
  ensureWorkspace?: string;
  tunnel?: boolean;
  tunnelQuick?: boolean;
  open?: boolean;
  interactive?: boolean;
}

async function attachToRunningDaemon(
  rt: ReturnType<typeof runtimeFromOpts>,
  opts: StartOpts,
  workspaceRoot?: string,
): Promise<boolean> {
  const client = DaemonClient.fromPaths(rt.paths);
  if (!(await client.isRunning())) return false;

  let st;
  try {
    st = await client.state();
  } catch {
    return false;
  }

  const url = `http://${st.host}:${st.port}`;
  if (workspaceRoot) {
    try {
      await client.addWorkspace(path.resolve(workspaceRoot));
    } catch {
      rt.workspaces.add(path.resolve(workspaceRoot));
    }
  } else {
    const ensurePath = opts.ensureWorkspace?.trim() || process.env.EDITER_AUTO_WORKSPACE?.trim();
    if (ensurePath) {
      try {
        await client.addWorkspace(path.resolve(ensurePath));
      } catch {
        rt.workspaces.add(path.resolve(ensurePath));
      }
    }
  }

  console.log(`${APP_NAME} ${APP_VERSION}`);
  console.log(`Attached: ${url} (daemon already listening)`);
  console.log(`MCP:     ${url}/mcp`);
  console.log(`Mode:    ${st.mode} (${st.modeSource})`);
  console.log(`Tools:   ${st.toolCount}`);

  if (opts.open) openBrowser(url);

  if (opts.interactive && process.stdin.isTTY) {
    await runInteractiveConsole({
      rt,
      localUrl: url,
      daemonClient: client,
      onExit: async () => {
        await stopEditerDaemon(rt.paths);
      },
    });
  } else if (opts.interactive) {
    console.log("No TTY — use `editer review` in a terminal for the interactive console.");
  }

  return true;
}

export async function runStart(opts: StartOpts): Promise<void> {
  const rt = runtimeFromOpts(opts);
  ensureDir(rt.paths.home);
  applySessionTunnelFlags(rt, opts.tunnelQuick, opts.tunnel);
  const ensurePath = opts.ensureWorkspace?.trim() || process.env.EDITER_AUTO_WORKSPACE?.trim();
  if (ensurePath) {
    rt.workspaces.add(path.resolve(ensurePath));
  }

  if (await attachToRunningDaemon(rt, opts, ensurePath ? path.resolve(ensurePath) : undefined)) {
    return;
  }

  const detachApprovals = attachApprovalSurfaces(rt, Boolean(opts.interactive));

  if (opts.interactive) {
    process.env.EDITER_CLI_OWNS_SHUTDOWN = "1";
  }

  let started: StartedServer;
  try {
    started = await startServer(rt);
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as NodeJS.ErrnoException).code) : "";
    if (code === "EADDRINUSE") {
      if (await attachToRunningDaemon(rt, opts, ensurePath ? path.resolve(ensurePath) : undefined)) {
        return;
      }
      const cfg = loadGlobalConfig(rt.paths);
      throw new Error(
        `Port ${rt.port ?? cfg.port} is already in use. Run \`editer stop\`, change port with \`editer config set port 4878\`, or use \`editer review\` if editer is already running.`,
      );
    }
    throw err;
  }
  fs.writeFileSync(rt.paths.pidFile, String(process.pid), "utf8");
  const cfg = loadGlobalConfig(rt.paths);
  console.log(`${APP_NAME} ${APP_VERSION}`);
  console.log(`Local:   ${started.url}`);
  console.log(`MCP:     ${started.url}/mcp`);
  const tunnel = rt.tunnel.getState();
  if (tunnel.quickUrl) console.log(`Tunnel:  ${tunnel.quickUrl}/mcp`);
  else if (cfg.tunnel.hostname) console.log(`Tunnel:  https://${cfg.tunnel.hostname}/mcp`);
  console.log(`Tools:   ${started.registry.list().length}`);
  console.log(`Mode:    ${rt.merged().mode} (${rt.merged().modeSource})${rt.headless ? " (headless)" : ""}`);

  if (opts.open) openBrowser(started.url);

  if (opts.interactive && process.stdin.isTTY) {
    await runInteractiveConsole({
      rt,
      localUrl: started.url,
      onExit: async () => {
        detachApprovals();
        await started.close();
      },
    });
    delete process.env.EDITER_CLI_OWNS_SHUTDOWN;
    return;
  }

  await new Promise<void>(() => {
    // non-interactive: run until SIGINT/SIGTERM (handled in startServer)
  });
}

export function registerDaemon(program: Command): void {
  program
    .command("start")
    .description("Start the editer daemon (non-interactive)")
    .option("--headless")
    .option("--no-tunnel")
    .option("--tunnel", "Enable configured tunnel mode")
    .option("--tunnel-quick", "Use ephemeral trycloudflare tunnel")
    .option("--mode <mode>")
    .option("--host <host>")
    .option("--port <port>")
    .option("--home <dir>")
    .option("--ensure-workspace <path>", "Register and activate this folder if missing")
    .option("--open", "Open web UI in browser")
    .action(async (opts: StartOpts) => {
      await runStart({ ...opts, interactive: false });
    });

  program
    .command("stop")
    .description("Stop a daemon started with `editer start`")
    .option("--home <dir>")
    .action(async (opts: { home?: string }) => {
      const rt = runtimeFromOpts(opts);
      const stopped = await stopEditerDaemon(rt.paths);
      console.log(stopped ? "editer stopped." : "No running editer daemon found.");
    });

  program
    .command("status")
    .option("--home <dir>")
    .action(async (opts: { home?: string }) => {
      const rt = runtimeFromOpts(opts);
      const cfg = loadGlobalConfig(rt.paths);
      const running = fs.existsSync(rt.paths.pidFile);
      const merged = rt.merged();
      const { DaemonClient } = await import("@editer/core");
      const client = DaemonClient.fromPaths(rt.paths);
      let daemonReachable = false;
      let pendingApprovals = 0;
      if (await client.isRunning()) {
        daemonReachable = true;
        try {
          const st = await client.state();
          pendingApprovals = st.pendingApprovals;
        } catch {
          // ignore
        }
      }
      console.log(
        JSON.stringify(
          {
            running,
            daemonReachable,
            port: cfg.port,
            mode: merged.mode,
            modeSource: merged.modeSource,
            pendingApprovals,
            tunnel: cfg.tunnel,
            workspaces: cfg.workspaces.length,
          },
          null,
          2,
        ),
      );
    });

  program
    .command("logs")
    .description("Show audit activity (tool calls, approvals, errors)")
    .option("--follow", "Stream new log lines")
    .option("--limit <n>", "Number of entries", "50")
    .option("--tool <name>", "Filter by tool name")
    .option("--home <dir>")
    .action(async (opts: { home?: string; follow?: boolean; limit?: string; tool?: string }) => {
      const rt = runtimeFromOpts(opts);
      const limit = Number(opts.limit ?? 50);
      const { DaemonClient } = await import("@editer/core");
      const { fetchAuditEvents, followAuditLogs, printAuditEvents } = await import("../log-view.js");
      const client = DaemonClient.fromPaths(rt.paths);
      if (opts.follow) {
        const initial = await fetchAuditEvents(client, rt, { limit, tool: opts.tool });
        printAuditEvents(initial, true);
        const ac = new AbortController();
        process.once("SIGINT", () => ac.abort());
        console.log("Following logs (Ctrl+C to stop)…");
        await followAuditLogs(client, rt, { tool: opts.tool, signal: ac.signal });
        return;
      }

      const events = await fetchAuditEvents(client, rt, { limit, tool: opts.tool });
      printAuditEvents(events, true);
    });
}

export async function runDefaultSession(dir: string, opts: StartOpts): Promise<void> {
  const rt = runtimeFromOpts(opts);
  ensureGlobalHome(rt);
  const mode = opts.mode as "readonly" | "review" | "auto" | undefined;
  const root = ensureProjectDir(dir, { mode });
  registerProjectWorkspace(rt, root, undefined, mode);

  const client = DaemonClient.fromPaths(rt.paths);
  if (await client.isRunning()) {
    const attached = await attachToRunningDaemon(rt, {
      ...opts,
      headless: opts.headless ?? false,
      interactive: !opts.headless,
    }, root);
    if (attached) return;
  }

  await runStart({
    ...opts,
    ensureWorkspace: root,
    headless: opts.headless ?? false,
    interactive: !opts.headless,
  });
}
