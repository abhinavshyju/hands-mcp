import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { spawn } from "node:child_process";
import {
  DaemonClient,
  applyGlobalConfigKey,
  authStartupWarnings,
  buildOAuthDiscoveryUrls,
  ensureDaemon,
  formatOAuthDiscoveryLines,
  loadGlobalConfig,
  saveGlobalConfig,
  setModeScoped,
  type HandsRuntime,
} from "@hands/core";
import type { ApprovalResponse } from "@hands/core";
import {
  authModeSchema,
  filterSlashCompletions,
  formatSlashHelp,
  type AuthMode,
  type TunnelMode,
  type WorkspaceMode,
} from "@hands/shared";
import { dispatchSlashToCli } from "./slashDispatch.js";
import {
  fetchAuditEvents,
  formatMainActivityLine,
  isMainActivityEvent,
  printAuditEvents,
  printMainActivityEvents,
  resolveActiveWorkspaceId,
} from "./log-view.js";
import { promptString } from "./ui/prompt.js";
import {
  helpSection,
  hint,
  info,
  printBox,
  printJson,
  printKv,
  rule,
  success,
  writeWarn,
  writeln,
} from "./ui/render.js";
import { styles } from "./ui/theme.js";

export interface ConsoleOptions {
  rt: HandsRuntime;
  localUrl: string;
  daemonClient?: DaemonClient;
  useDaemonOnly?: boolean;
  /** Avoid /healthz on every poll when the daemon is already known to be up. */
  daemonUp?: boolean;
  /** Called on /quit, q, or Ctrl+C — use to stop MCP server, tunnel, and child processes */
  onExit?: () => void | Promise<void>;
}

const MODE_CHOICES: Array<{ value: WorkspaceMode; hint: string }> = [
  { value: "readonly", hint: "no edits or shell" },
  { value: "review", hint: "approve shell commands (default)" },
  { value: "auto", hint: "no approvals" },
];

const APPROVAL_KEYS = [
  { key: "y", hint: "approve current request" },
  { key: "n", hint: "reject current request" },
  { key: "d", hint: "show diff for current request" },
  { key: "a", hint: "approve all pending" },
];

function isReadlineAbort(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "AbortError" || (err as NodeJS.ErrnoException).code === "ABORT_ERR")
  );
}

function consoleCompleter(line: string): [string[], string] {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("/")) {
    const hits = filterSlashCompletions(trimmed);
    return [hits.length > 0 ? hits : filterSlashCompletions("/"), line];
  }
  if (trimmed.length === 0) {
    return [[...APPROVAL_KEYS.map((k) => k.key), "/help"], line];
  }
  const keyHits = APPROVAL_KEYS.filter((k) => k.key.startsWith(trimmed)).map((k) => k.key);
  return [keyHits, line];
}

export function clearTerminalScreen(): void {
  if (process.stdout.isTTY && typeof console.clear === "function") {
    console.clear();
    return;
  }
  process.stdout.write("\x1b[2J\x1b[H");
}

function printConsoleHelp(topic?: string): void {
  if (topic === "mode") {
    helpSection(
      "Mode options",
      MODE_CHOICES.map((m) => ({ cmd: `/mode ${m.value}`, detail: m.hint })),
    );
    writeln("");
    return;
  }
  if (!topic) {
    helpSection(
      "Approval keys",
      APPROVAL_KEYS.map((k) => ({ cmd: `[${k.key}]`, detail: k.hint })),
    );
  }
  for (const line of formatSlashHelp(topic)) {
    writeln(line);
  }
  if (!topic) {
    helpSection("Examples", [
      { cmd: "/mode review" },
      { cmd: "/tunnel setup --hostname hands.example.com" },
    ]);
  }
}

export async function runInteractiveConsole(opts: ConsoleOptions): Promise<void> {
  const { rt, localUrl, useDaemonOnly, daemonUp = false } = opts;
  const client = opts.daemonClient ?? DaemonClient.fromPaths(rt.paths);
  const workspaceId = await resolveActiveWorkspaceId(client, rt, daemonUp);
  const auditOpts = { daemonUp, workspaceId };
  if (useDaemonOnly && !(await client.isRunning())) {
    throw new Error("Daemon is not running");
  }

  const rl = readline.createInterface({
    input,
    output,
    terminal: true,
    completer: consoleCompleter,
  });

  writeln("");
  info(
    styles.bold("Interactive console") +
      styles.dim(" — Tab completes commands. Type /help for suggestions."),
  );
  writeln("");
  printConsoleHelp();

  rule("recent changes");
  const recent = await fetchAuditEvents(client, rt, { limit: 40, ...auditOpts });
  printMainActivityEvents(recent, true);
  hint("Live activity on — /logs off to pause, /logs all for verbose");
  writeln("");

  let promptMode = rt.merged().mode;
  if (await client.isRunning()) {
    try {
      const st = await client.state();
      promptMode = st.mode;
    } catch {
      // keep merged
    }
  }

  const shown = new Set<string>();
  const seenLogIds = new Set(recent.map((e) => e.id));
  let liveLogs = process.env.EDITER_CONSOLE_LOGS !== "0";

  const poll = async () => {
    try {
      const up = daemonUp || (await client.isRunning());
      if (up) {
        const pending = (await client.approvals()).filter((a) => a.status === "pending");
        for (const req of pending) {
          if (shown.has(req.id)) continue;
          shown.add(req.id);
          printApproval(req);
        }
      }
      if (liveLogs && up) {
        const events = await fetchAuditEvents(client, rt, { limit: 20, ...auditOpts });
        for (const e of events) {
          if (seenLogIds.has(e.id)) continue;
          seenLogIds.add(e.id);
          if (!isMainActivityEvent(e)) continue;
          writeln(formatMainActivityLine(e));
        }
      }
    } catch {
      // ignore poll errors
    }
  };

  const timer = setInterval(() => {
    void poll();
  }, 1500);
  await poll();

  let exiting = false;
  const exitSession = async (reason: string) => {
    if (exiting) return;
    exiting = true;
    clearInterval(timer);
    rl.close();
    writeln("");
    info(reason);
    rt.audit.clear();
    if (opts.onExit) {
      hint("Stopping MCP server, tunnel, and background processes…");
      await opts.onExit();
    }
    success("Goodbye.");
  };

  const onSigint = () => {
    void exitSession("Interrupted.");
  };
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigint);

  try {
    while (true) {
      let line: string;
      try {
        line = (await rl.question(promptString(promptMode))).trim();
      } catch (err) {
        if (isReadlineAbort(err) || exiting) {
          if (!exiting) await exitSession("Interrupted.");
          break;
        }
        throw err;
      }
      if (!line) continue;

      if (line === "clear" || line === "/clear") {
        clearTerminalScreen();
        continue;
      }
      if (line === "q" || line === "/quit" || line === "quit") {
        await exitSession("Exiting.");
        break;
      }
      if (line === "y" || line === "n" || line === "d" || line === "a") {
        await handleApprovalKey(client, line, rl);
        continue;
      }
      if (line.startsWith("/")) {
        const handled = await handleSlash(client, rt, line, localUrl, {
          getLiveLogs: () => liveLogs,
          setLiveLogs: (v) => {
            liveLogs = v;
          },
          seenLogIds,
          auditOpts,
          setPromptMode: (m) => {
            promptMode = m;
          },
        });
        if (!handled) {
          const suggestions = filterSlashCompletions(line.split(/\s+/)[0] ?? line);
          if (suggestions.length > 0) {
            info("Did you mean:");
            for (const s of suggestions.slice(0, 8)) hint(`  ${s}`);
          }
          printConsoleHelp(line === "/help" ? undefined : line.slice(1).split(/\s+/)[0]);
        }
        continue;
      }
      hint("Type /help for commands, or Tab to complete a /command.");
    }
  } finally {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigint);
    if (!exiting) {
      clearInterval(timer);
      rl.close();
    }
  }
}

function printApproval(req: ApprovalResponse): void {
  writeln("");
  const body = [
    `${styles.bold(req.tool ?? "tool")}: ${req.summary}`,
    styles.dim(`id: ${req.id}`),
    ...(req.command ? [styles.muted(`cmd: ${req.command}`)] : []),
    ...(req.preview ? [req.preview.slice(0, 400)] : []),
    "",
    `${styles.ok("[y]")} approve  ${styles.err("[n]")} reject  ${styles.accent("[d]")} diff  ${styles.warn("[a]")} approve all`,
  ];
  printBox("approval", body);
  writeln("");
}

async function handleApprovalKey(
  client: DaemonClient,
  key: string,
  rl: readline.Interface,
): Promise<void> {
  const pending = (await client.approvals()).filter((a) => a.status === "pending");
  if (pending.length === 0) {
    hint("No pending approvals.");
    return;
  }
  const req = pending[0]!;
  if (key === "y") {
    await client.decide(req.id, true, "console");
    success("Approved.");
    return;
  }
  if (key === "n") {
    await client.decide(req.id, false, "console");
    info("Rejected.");
    return;
  }
  if (key === "a") {
    const { count } = await client.decideAll(true, "console-all");
    success(`Approved ${count}.`);
    return;
  }
  if (key === "d") {
    if (req.diff) writeln(req.diff);
    else if (req.preview) writeln(req.preview);
    else hint("(no diff)");
    void rl;
  }
}

/** @returns true if the line was handled */
async function handleSlash(
  client: DaemonClient,
  rt: HandsRuntime,
  line: string,
  localUrl: string,
  logOpts: {
    getLiveLogs: () => boolean;
    setLiveLogs: (v: boolean) => void;
    seenLogIds: Set<string>;
    auditOpts: { daemonUp?: boolean; workspaceId?: string };
    setPromptMode?: (mode: WorkspaceMode) => void;
  },
): Promise<boolean> {
  const parts = line.slice(1).split(/\s+/);
  const cmd = parts[0]?.toLowerCase();

  if (cmd === "help") {
    printConsoleHelp(parts[1]?.toLowerCase());
    return true;
  }

  if (cmd === "clear") {
    clearTerminalScreen();
    return true;
  }

  if (cmd === "status") {
    if (await client.isRunning()) {
      const st = await client.state();
      printJson(st);
    } else {
      printJson({ running: false, mode: rt.merged().mode });
    }
    return true;
  }

  if (cmd === "open") {
    openBrowser(localUrl);
    success(`Opened ${localUrl}`);
    return true;
  }

  if (cmd === "mode") {
    if (!parts[1]) {
      let current = rt.merged().mode;
      let source = rt.merged().modeSource;
      if (await client.isRunning()) {
        try {
          const st = await client.state();
          current = st.mode;
          source = st.modeSource;
        } catch {
          // use offline merged
        }
      }
      info(`Current mode: ${current} (${source})`);
      printConsoleHelp("mode");
      return true;
    }
    const modeArg = parts[1]!.toLowerCase();
    const valid = MODE_CHOICES.find((m) => m.value === modeArg);
    if (!valid) {
      writeWarn(`Unknown mode "${parts[1]}". Choose one of:`);
      printConsoleHelp("mode");
      return true;
    }
    const mode = valid.value;
    if (!(await client.isRunning())) {
      const ws = rt.workspaces.requireActive();
      setModeScoped(rt.paths, mode, "workspace", ws);
      logOpts.setPromptMode?.(mode);
      success(`Mode set to ${mode} (offline)`);
      return true;
    }
    await client.setMode(mode, "workspace");
    logOpts.setPromptMode?.(mode);
    success(`Mode set to ${mode}`);
    return true;
  }

  if (cmd === "logs") {
    const arg = parts[1]?.toLowerCase();
    if (arg === "follow" || arg === "on") {
      logOpts.setLiveLogs(true);
      success("Live activity stream enabled.");
      return true;
    }
    if (arg === "off") {
      logOpts.setLiveLogs(false);
      hint("Live activity paused. Use /logs follow to resume.");
      return true;
    }
    const verbose = arg === "all";
    const limitToken = verbose ? parts[2] : parts[1];
    const limit = limitToken && /^\d+$/.test(limitToken) ? Number(limitToken) : 30;
    const events = await fetchAuditEvents(client, rt, { limit, ...logOpts.auditOpts });
    for (const e of events) logOpts.seenLogIds.add(e.id);
    rule(verbose ? `last ${limit} audit entries` : `last changes (up to ${limit} fetched)`);
    if (verbose) printAuditEvents(events, true);
    else printMainActivityEvents(events, true);
    return true;
  }

  if (cmd === "auth-mode") {
    if (!parts[1]) {
      const cfg = loadGlobalConfig(rt.paths);
      info(`Current auth.mode: ${cfg.auth.mode}`);
      printConsoleHelp("auth");
      return true;
    }
    let mode: AuthMode;
    try {
      mode = authModeSchema.parse(parts[1]!.toLowerCase());
    } catch {
      writeWarn(`Unknown auth mode "${parts[1]}". Use none, bearer, or oauth.`);
      return true;
    }
    if (await client.isRunning()) {
      const res = await client.setAuthMode(mode);
      for (const w of res.warnings) writeWarn(w);
    } else {
      applyGlobalConfigKey(rt.paths, "auth.mode", JSON.stringify(mode));
      for (const w of authStartupWarnings(loadGlobalConfig(rt.paths))) writeWarn(w);
    }
    success(`auth.mode = ${mode}`);
    return true;
  }

  if (cmd === "auth" && parts[1]?.toLowerCase() === "show") {
    const cfg = loadGlobalConfig(rt.paths);
    printJson(cfg.auth);
    return true;
  }

  if (cmd === "oauth-urls") {
    const cfg = loadGlobalConfig(rt.paths);
    const urls = buildOAuthDiscoveryUrls(cfg);
    if (!urls) {
      hint("No public base URL. Set auth.oauth.publicBaseUrl or configure a tunnel hostname.");
      return true;
    }
    for (const line of formatOAuthDiscoveryLines(urls)) writeln(line);
    return true;
  }

  if (cmd === "tunnel") {
    const sub = parts[1]?.toLowerCase();
    if (!sub || sub === "help") {
      printConsoleHelp("tunnel");
      return true;
    }
    if (!(await client.isRunning())) {
      writeWarn("Daemon is not running — start with `hands .` first.");
      return true;
    }
    if (sub === "status") {
      const st = await client.state();
      printJson(st.tunnel);
      return true;
    }
    if (sub === "quick") {
      const out = await client.tunnelQuick();
      printJson(out);
      return true;
    }
    if (sub === "ngrok") {
      await client.setTunnel({ mode: "ngrok", enabled: true });
      const out = await client.tunnelRestart();
      printJson(out);
      hint("Set NGROK_AUTHTOKEN or hands tunnel ngrok --authtoken if ngrok fails.");
      return true;
    }
    if (sub === "off" || sub === "disable") {
      await client.setTunnel({ mode: "off", enabled: false });
      success("Tunnel disabled");
      return true;
    }
    if (sub === "restart") {
      const out = await client.tunnelRestart();
      printJson(out);
      return true;
    }
    if (sub === "set") {
      const modeArg = parts[2]?.toLowerCase();
      const modes = new Set(["off", "quick", "token", "named", "ngrok"]);
      if (!modeArg || !modes.has(modeArg)) {
        hint("Usage: /tunnel set off|quick|token|named|ngrok [hostname]");
        return true;
      }
      const hostname = parts[3];
      await client.setTunnel({
        mode: modeArg as TunnelMode,
        enabled: modeArg !== "off",
        ...(hostname ? { hostname } : {}),
      });
      success(`Tunnel mode set to ${modeArg}`);
      return true;
    }
    writeWarn(`Unknown /tunnel subcommand "${sub}". Try /help tunnel`);
    return true;
  }

  if (cmd === "token" && parts[1]?.toLowerCase() === "new") {
    const name = parts.slice(2).join(" ").trim();
    if (!name) {
      hint("Usage: /token new <name>");
      return true;
    }
    if (await client.isRunning()) {
      const t = await client.createToken(name);
      printKv([
        { key: "name", value: t.name },
        { key: "id", value: t.id },
        { key: "token", value: t.token, valueStyle: styles.bold },
      ]);
    } else {
      const t = rt.tokens.create(name);
      printKv([
        { key: "name", value: t.name },
        { key: "id", value: t.id },
        { key: "token", value: t.token, valueStyle: styles.bold },
      ]);
    }
    return true;
  }

  if (cmd === "workspace") {
    if (!parts[1]) {
      hint("Usage: /workspace <path>");
      hint("Example: /workspace .");
      return true;
    }
    const root = parts.slice(1).join(" ");
    if (await client.isRunning()) {
      await client.addWorkspace(root);
    } else {
      rt.workspaces.add(root);
    }
    success(`Workspace added: ${root}`);
    return true;
  }

  if (cmd === "quit") {
    return true;
  }

  const dispatched = await dispatchSlashToCli(line, rt.paths.home);
  if (dispatched.handled) {
    if (dispatched.error) writeWarn(dispatched.error);
    for (const l of dispatched.output ?? []) writeln(l);
    return true;
  }

  return false;
}

export function openBrowser(url: string): void {
  const plat = process.platform;
  const cmd = plat === "darwin" ? "open" : plat === "win32" ? "start" : "xdg-open";
  spawn(cmd, [url], { stdio: "ignore", detached: true }).unref();
}

export async function runReviewCommand(
  rt: HandsRuntime,
  root: string,
  url?: string,
): Promise<void> {
  const client = await ensureDaemon(rt.paths, { root, noTunnel: true });
  const st = await client.state();
  const localUrl = url ?? `http://${st.host}:${st.port}`;
  const { stopHandsDaemon } = await import("./shutdown.js");
  await runInteractiveConsole({
    rt,
    localUrl,
    daemonClient: client,
    daemonUp: true,
    useDaemonOnly: false,
    onExit: async () => {
      await stopHandsDaemon(rt.paths);
    },
  });
}

export function applySessionTunnelFlags(
  rt: HandsRuntime,
  tunnelQuick?: boolean,
  tunnel?: boolean,
): void {
  const cfg = loadGlobalConfig(rt.paths);
  if (tunnelQuick) {
    cfg.tunnel = { ...cfg.tunnel, mode: "quick", enabled: true };
    saveGlobalConfig(rt.paths, cfg);
    rt.noTunnel = false;
    return;
  }
  if (tunnel) {
    rt.noTunnel = false;
    if (cfg.tunnel.mode === "off" && cfg.tunnel.enabled) {
      cfg.tunnel.mode = "named";
      saveGlobalConfig(rt.paths, cfg);
    }
  }
}
