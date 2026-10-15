import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import {
  DaemonClient,
  ensureDir,
  loadGlobalConfig,
  normalizeTunnelConfigForSession,
  type HandsPaths,
  tunnelWanted,
} from "@hands/core";
import { startServer } from "@hands/server";
import { APP_NAME, APP_VERSION } from "@hands/shared";
import { runtimeFromOpts } from "../runtime-opts.js";
import { attachApprovalSurfaces } from "../approval-surfaces.js";
import { applySessionTunnelFlags, openBrowser, runInteractiveConsole } from "../console.js";
import { hint, modeBadge, printBanner, printJson, success, writeln } from "../ui/render.js";
import { styles } from "../ui/theme.js";
import { ensureGlobalHome, ensureProjectDir, registerProjectWorkspace } from "../project-setup.js";
import { stopHandsDaemon } from "../shutdown.js";
import type { StartedServer } from "@hands/server";

interface TunnelBannerState {
  enabled: boolean;
  mode?: string;
  hostname?: string;
  quickUrl?: string;
  healthy: boolean;
  status: string;
  lastError?: string;
}

function tunnelBannerLine(tunnel: TunnelBannerState): { key: string; value: string } | undefined {
  if (!tunnel.enabled && (tunnel.mode === "off" || !tunnel.mode)) return undefined;
  const publicBase =
    tunnel.quickUrl ??
    (tunnel.hostname ? `https://${tunnel.hostname.replace(/^https?:\/\//, "")}` : undefined);
  if (tunnel.healthy && publicBase) {
    return { key: "Tunnel", value: `${publicBase.replace(/\/$/, "")}/mcp` };
  }
  if (tunnel.status === "starting") {
    return { key: "Tunnel", value: "starting…" };
  }
  if (tunnel.lastError) {
    return { key: "Tunnel", value: `unavailable (${tunnel.lastError.slice(0, 100)})` };
  }
  if (publicBase) {
    return { key: "Tunnel", value: `${publicBase.replace(/\/$/, "")}/mcp (not reachable)` };
  }
  return undefined;
}

async function ensureDaemonTunnel(
  client: DaemonClient,
  paths: HandsPaths,
  noTunnel: boolean,
): Promise<void> {
  if (noTunnel) return;
  normalizeTunnelConfigForSession(paths);
  const cfg = loadGlobalConfig(paths);
  if (!tunnelWanted(cfg.tunnel, noTunnel)) return;

  const st = await client.state();
  if (st.tunnel.healthy) return;

  if (st.tunnel.status === "stopped" || st.tunnel.status === "disabled") {
    await client.tunnelStart();
  } else {
    await client.tunnelRestart();
  }

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const health = await client.tunnelHealth();
    if (health.ok) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

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

  if (!opts.noTunnel) {
    await ensureDaemonTunnel(client, rt.paths, false);
    try {
      st = await client.state();
    } catch {
      // keep prior state for banner
    }
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

  const attachTunnel = tunnelBannerLine(st.tunnel);
  printBanner({
    name: APP_NAME,
    version: APP_VERSION,
    subtitle: "Attached to running daemon",
    lines: [
      { key: "Local", value: url },
      { key: "MCP", value: `${url}/mcp` },
      ...(attachTunnel ? [attachTunnel] : []),
      {
        key: "Mode",
        value: st.mode,
        valueStyle: (m) => `${modeBadge(m)} ${styles.dim(`(${st.modeSource})`)}`,
      },
      { key: "Tools", value: String(st.toolCount) },
    ],
  });

  if (opts.open) openBrowser(url);

  if (opts.interactive && process.stdin.isTTY) {
    await runInteractiveConsole({
      rt,
      localUrl: url,
      daemonClient: client,
      daemonUp: true,
      onExit: async () => {
        await stopHandsDaemon(rt.paths);
      },
    });
  } else if (opts.interactive) {
    hint("No TTY — use `hands review` in a terminal for the interactive console.");
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
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as NodeJS.ErrnoException).code)
        : "";
    if (code === "EADDRINUSE") {
      if (
        await attachToRunningDaemon(rt, opts, ensurePath ? path.resolve(ensurePath) : undefined)
      ) {
        return;
      }
      const cfg = loadGlobalConfig(rt.paths);
      throw new Error(
        `Port ${rt.port ?? cfg.port} is already in use. Run \`hands stop\`, change port with \`hands config set port 4878\`, or use \`hands review\` if Hands is already running.`,
      );
    }
    throw err;
  }
  fs.writeFileSync(rt.paths.pidFile, String(process.pid), "utf8");
  const cfgAfterStart = loadGlobalConfig(rt.paths);
  if (tunnelWanted(cfgAfterStart.tunnel, rt.noTunnel) && !rt.tunnel.getState().healthy) {
    await rt.tunnel.refreshHealth();
  }
  const tunnel = rt.tunnel.getState();
  const tunnelLine = tunnelBannerLine(tunnel);
  const mode = rt.merged().mode;
  printBanner({
    name: APP_NAME,
    version: APP_VERSION,
    lines: [
      { key: "Local", value: started.url },
      { key: "MCP", value: `${started.url}/mcp` },
      ...(tunnelLine ? [tunnelLine] : []),
      { key: "Tools", value: String(started.registry.list().length) },
      {
        key: "Mode",
        value: mode,
        valueStyle: (m) =>
          `${modeBadge(m)} ${styles.dim(`(${rt.merged().modeSource})${rt.headless ? " (headless)" : ""}`)}`,
      },
    ],
  });

  if (opts.open) openBrowser(started.url);

  if (opts.interactive && process.stdin.isTTY) {
    await runInteractiveConsole({
      rt,
      localUrl: started.url,
      daemonUp: true,
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
    .description("Start the Hands daemon (non-interactive)")
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
    .description("Stop a daemon started with `hands start`")
    .option("--home <dir>")
    .action(async (opts: { home?: string }) => {
      const rt = runtimeFromOpts(opts);
      const stopped = await stopHandsDaemon(rt.paths);
      success(stopped ? "Hands stopped." : "No running Hands daemon found.");
    });

  program
    .command("status")
    .option("--home <dir>")
    .action(async (opts: { home?: string }) => {
      const rt = runtimeFromOpts(opts);
      const cfg = loadGlobalConfig(rt.paths);
      const running = fs.existsSync(rt.paths.pidFile);
      const merged = rt.merged();
      const { DaemonClient } = await import("@hands/core");
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
      printJson({
        running,
        daemonReachable,
        port: cfg.port,
        mode: merged.mode,
        modeSource: merged.modeSource,
        pendingApprovals,
        tunnel: cfg.tunnel,
        workspaces: cfg.workspaces.length,
      });
    });

  program
    .command("logs")
    .description("Show audit activity (tool calls, approvals, errors)")
    .option("--follow", "Stream new log lines")
    .option("--limit <n>", "Number of entries", "50")
    .option("--tool <name>", "Filter by tool name")
    .option("--verbose", "Include event type and client on each line")
    .option("--legacy", "Compact ISO audit lines (old format)")
    .option("--main", "Only file edits and shell commands")
    .option("--home <dir>")
    .action(
      async (opts: {
        home?: string;
        follow?: boolean;
        limit?: string;
        tool?: string;
        verbose?: boolean;
        legacy?: boolean;
        main?: boolean;
      }) => {
        const rt = runtimeFromOpts(opts);
        const limit = Number(opts.limit ?? 50);
        const { DaemonClient } = await import("@hands/core");
        const {
          fetchAuditEvents,
          followAuditLogs,
          printAuditEvents,
          printMainActivityEvents,
          formatAuditLineLegacy,
          resolveActiveWorkspaceId,
        } = await import("../log-view.js");
        const client = DaemonClient.fromPaths(rt.paths);
        const daemonUp = await client.isRunning();
        const workspaceId = await resolveActiveWorkspaceId(client, rt, daemonUp);
        const auditFetchOpts = { tool: opts.tool, daemonUp, workspaceId };

        const printBatch = (events: Awaited<ReturnType<typeof fetchAuditEvents>>) => {
          if (opts.legacy) {
            const list = [...events].reverse();
            for (const e of list) writeln(formatAuditLineLegacy(e));
            return;
          }
          if (opts.main) printMainActivityEvents(events, true);
          else printAuditEvents(events, true, opts.verbose ?? false);
        };

        if (opts.follow) {
          const initial = await fetchAuditEvents(client, rt, { limit, ...auditFetchOpts });
          printBatch(initial);
          const ac = new AbortController();
          process.once("SIGINT", () => ac.abort());
          hint("Following logs (Ctrl+C to stop)…");
          await followAuditLogs(client, rt, {
            ...auditFetchOpts,
            signal: ac.signal,
            mainOnly: opts.main,
            verbose: opts.legacy ? false : Boolean(opts.verbose),
          });
          return;
        }

        const events = await fetchAuditEvents(client, rt, { limit, ...auditFetchOpts });
        printBatch(events);
      },
    );
}

export async function runDefaultSession(dir: string, opts: StartOpts): Promise<void> {
  const rt = runtimeFromOpts(opts);
  ensureGlobalHome(rt);
  const mode = opts.mode as "readonly" | "review" | "auto" | undefined;
  const root = ensureProjectDir(dir, { mode });
  registerProjectWorkspace(rt, root, undefined, mode);

  const client = DaemonClient.fromPaths(rt.paths);
  if (await client.isRunning()) {
    const attached = await attachToRunningDaemon(
      rt,
      {
        ...opts,
        headless: opts.headless ?? false,
        interactive: !opts.headless,
      },
      root,
    );
    if (attached) return;
  }

  await runStart({
    ...opts,
    ensureWorkspace: root,
    headless: opts.headless ?? false,
    interactive: !opts.headless,
  });
}
