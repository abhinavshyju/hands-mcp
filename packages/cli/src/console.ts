import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { spawn } from "node:child_process";
import {
  DaemonClient,
  ensureDaemon,
  loadGlobalConfig,
  saveGlobalConfig,
  setModeScoped,
  type EditerRuntime,
} from "@editer/core";
import type { ApprovalResponse } from "@editer/core";
import type { WorkspaceMode } from "@editer/shared";
import { fetchAuditEvents, formatAuditLine, printAuditEvents } from "./log-view.js";

export interface ConsoleOptions {
  rt: EditerRuntime;
  localUrl: string;
  daemonClient?: DaemonClient;
  useDaemonOnly?: boolean;
  /** Called on /quit, q, or Ctrl+C — use to stop MCP server, tunnel, and child processes */
  onExit?: () => void | Promise<void>;
}

const MODE_CHOICES: Array<{ value: WorkspaceMode; hint: string }> = [
  { value: "readonly", hint: "no edits or shell" },
  { value: "review", hint: "approve shell commands (default)" },
  { value: "auto", hint: "no approvals" },
];

const SLASH_COMMANDS: Array<{ cmd: string; usage: string; detail?: string }> = [
  { cmd: "/mode", usage: "/mode <readonly|review|auto>", detail: "Change workspace safety mode" },
  { cmd: "/status", usage: "/status", detail: "Print daemon state (JSON)" },
  { cmd: "/open", usage: "/open", detail: "Open web UI in browser" },
  { cmd: "/workspace", usage: "/workspace <path>", detail: "Register and activate a folder" },
  { cmd: "/logs", usage: "/logs [n|follow|off]", detail: "Show or tail audit activity" },
  { cmd: "/help", usage: "/help [topic]", detail: "Show commands or /help mode" },
  { cmd: "/quit", usage: "/quit", detail: "Exit and stop MCP server, tunnel, and processes" },
];

const APPROVAL_KEYS = [
  { key: "y", hint: "approve current request" },
  { key: "n", hint: "reject current request" },
  { key: "d", hint: "show diff for current request" },
  { key: "a", hint: "approve all pending" },
];

function slashCompletions(partial: string): string[] {
  const modes = MODE_CHOICES.map((m) => `/mode ${m.value}`);
  const flat = [
    ...modes,
    ...SLASH_COMMANDS.map((c) => c.usage.split(" ")[0]!).filter((c, i, a) => a.indexOf(c) === i),
    "/status",
    "/open",
    "/workspace ",
    "/logs",
    "/logs follow",
    "/logs off",
    "/help",
    "/help mode",
    "/help logs",
    "/quit",
  ];
  const p = partial.trimStart();
  if (!p.startsWith("/")) return [];
  return flat.filter((c) => c.startsWith(p));
}

function consoleCompleter(line: string): [string[], string] {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("/")) {
    const hits = slashCompletions(trimmed);
    return [hits.length > 0 ? hits : slashCompletions("/"), line];
  }
  if (trimmed.length === 0) {
    return [[...APPROVAL_KEYS.map((k) => k.key), "/help"], line];
  }
  const keyHits = APPROVAL_KEYS.filter((k) => k.key.startsWith(trimmed)).map((k) => k.key);
  return [keyHits, line];
}

function printConsoleHelp(topic?: string): void {
  if (topic === "mode") {
    console.log("\nMode options:");
    for (const m of MODE_CHOICES) {
      console.log(`  /mode ${m.value.padEnd(10)} ${m.hint}`);
    }
    console.log("");
    return;
  }
  if (topic === "logs") {
    console.log("\n  /logs           last 30 entries");
    console.log("  /logs 50        last 50 entries");
    console.log("  /logs follow    stream new activity (default in console)");
    console.log("  /logs off       pause live log stream\n");
    return;
  }
  console.log("\nApproval keys:");
  for (const k of APPROVAL_KEYS) {
    console.log(`  ${k.key.padEnd(4)} ${k.hint}`);
  }
  console.log("\nSlash commands (Tab to complete):");
  for (const c of SLASH_COMMANDS) {
    console.log(`  ${c.usage.padEnd(28)} ${c.detail ?? ""}`);
  }
  console.log("\nExamples:");
  console.log("  /mode review");
  console.log("  /workspace ~/my-project");
  console.log("");
}

export async function runInteractiveConsole(opts: ConsoleOptions): Promise<void> {
  const { rt, localUrl, useDaemonOnly } = opts;
  const client = opts.daemonClient ?? DaemonClient.fromPaths(rt.paths);
  if (useDaemonOnly && !(await client.isRunning())) {
    throw new Error("Daemon is not running");
  }

  const rl = readline.createInterface({
    input,
    output,
    terminal: true,
    completer: consoleCompleter,
  });

  console.log("\nInteractive console — Tab completes commands. Type /help for suggestions.\n");
  printConsoleHelp();

  console.log("--- recent activity ---");
  const recent = await fetchAuditEvents(client, rt, { limit: 20 });
  printAuditEvents(recent, true);
  console.log("--- (live logs on; /logs off to pause) ---\n");

  const shown = new Set<string>();
  const seenLogIds = new Set(recent.map((e) => e.id));
  let liveLogs = process.env.EDITER_CONSOLE_LOGS !== "0";

  const poll = async () => {
    try {
      if (await client.isRunning()) {
        const pending = (await client.approvals()).filter((a) => a.status === "pending");
        for (const req of pending) {
          if (shown.has(req.id)) continue;
          shown.add(req.id);
          printApproval(req);
        }
      }
      if (liveLogs) {
        const events = await fetchAuditEvents(client, rt, { limit: 15 });
        for (const e of events) {
          if (seenLogIds.has(e.id)) continue;
          seenLogIds.add(e.id);
          console.log(`[log] ${formatAuditLine(e)}`);
        }
      }
    } catch {
      // ignore poll errors
    }
  };

  const timer = setInterval(() => {
    void poll();
  }, 500);
  await poll();

  let exiting = false;
  const exitSession = async (reason: string) => {
    if (exiting) return;
    exiting = true;
    clearInterval(timer);
    rl.close();
    console.log(`\n${reason}`);
    if (opts.onExit) {
      console.log("Stopping MCP server, tunnel, and background processes…");
      await opts.onExit();
    }
    console.log("Goodbye.");
  };

  const onSigint = () => {
    void exitSession("Interrupted.");
  };
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigint);

  try {
  while (true) {
    const line = (await rl.question("editer> ")).trim();
    if (!line) continue;

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
      });
      if (!handled) {
        const suggestions = slashCompletions(line.split(/\s+/)[0] ?? line);
        if (suggestions.length > 0) {
          console.log("Did you mean:");
          for (const s of suggestions.slice(0, 8)) console.log(`  ${s}`);
        }
        printConsoleHelp(line === "/help" ? undefined : line.slice(1).split(/\s+/)[0]);
      }
      continue;
    }
    console.log("Type /help for commands, or Tab to complete a /command.");
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
  console.log(`\n--- approval ---`);
  console.log(`${req.tool}: ${req.summary}`);
  console.log(`id: ${req.id}`);
  if (req.command) console.log(`cmd: ${req.command}`);
  if (req.preview) console.log(req.preview.slice(0, 400));
  console.log(`[y] approve  [n] reject  [d] diff  [a] approve all\n`);
}

async function handleApprovalKey(client: DaemonClient, key: string, rl: readline.Interface): Promise<void> {
  const pending = (await client.approvals()).filter((a) => a.status === "pending");
  if (pending.length === 0) {
    console.log("No pending approvals.");
    return;
  }
  const req = pending[0]!;
  if (key === "y") {
    await client.decide(req.id, true, "console");
    console.log("Approved.");
    return;
  }
  if (key === "n") {
    await client.decide(req.id, false, "console");
    console.log("Rejected.");
    return;
  }
  if (key === "a") {
    const { count } = await client.decideAll(true, "console-all");
    console.log(`Approved ${count}.`);
    return;
  }
  if (key === "d") {
    if (req.diff) console.log(req.diff);
    else if (req.preview) console.log(req.preview);
    else console.log("(no diff)");
    void rl;
  }
}

/** @returns true if the line was handled */
async function handleSlash(
  client: DaemonClient,
  rt: EditerRuntime,
  line: string,
  localUrl: string,
  logOpts: {
    getLiveLogs: () => boolean;
    setLiveLogs: (v: boolean) => void;
    seenLogIds: Set<string>;
  },
): Promise<boolean> {
  const parts = line.slice(1).split(/\s+/);
  const cmd = parts[0]?.toLowerCase();

  if (cmd === "help") {
    printConsoleHelp(parts[1]?.toLowerCase());
    return true;
  }

  if (cmd === "status") {
    if (await client.isRunning()) {
      const st = await client.state();
      console.log(JSON.stringify(st, null, 2));
    } else {
      console.log(JSON.stringify({ running: false, mode: rt.merged().mode }, null, 2));
    }
    return true;
  }

  if (cmd === "open") {
    openBrowser(localUrl);
    console.log(`Opened ${localUrl}`);
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
      console.log(`Current mode: ${current} (${source})`);
      printConsoleHelp("mode");
      return true;
    }
    const modeArg = parts[1]!.toLowerCase();
    const valid = MODE_CHOICES.find((m) => m.value === modeArg);
    if (!valid) {
      console.log(`Unknown mode "${parts[1]}". Choose one of:`);
      printConsoleHelp("mode");
      return true;
    }
    const mode = valid.value;
    if (!(await client.isRunning())) {
      const ws = rt.workspaces.requireActive();
      setModeScoped(rt.paths, mode, "workspace", ws);
      console.log(`Mode set to ${mode} (offline)`);
      return true;
    }
    await client.setMode(mode, "workspace");
    console.log(`Mode set to ${mode}`);
    return true;
  }

  if (cmd === "logs") {
    const arg = parts[1]?.toLowerCase();
    if (arg === "follow" || arg === "on") {
      logOpts.setLiveLogs(true);
      console.log("Live log stream enabled.");
      return true;
    }
    if (arg === "off") {
      logOpts.setLiveLogs(false);
      console.log("Live log stream paused. Use /logs follow to resume.");
      return true;
    }
    const limit = arg && /^\d+$/.test(arg) ? Number(arg) : 30;
    const events = await fetchAuditEvents(client, rt, { limit });
    for (const e of events) logOpts.seenLogIds.add(e.id);
    console.log(`--- last ${limit} log entries ---`);
    printAuditEvents(events, true);
    return true;
  }

  if (cmd === "workspace") {
    if (!parts[1]) {
      console.log("Usage: /workspace <path>");
      console.log("Example: /workspace .");
      return true;
    }
    const root = parts.slice(1).join(" ");
    if (await client.isRunning()) {
      await client.addWorkspace(root);
    } else {
      rt.workspaces.add(root);
    }
    console.log(`Workspace added: ${root}`);
    return true;
  }

  if (cmd === "quit") {
    return true;
  }

  return false;
}

export function openBrowser(url: string): void {
  const plat = process.platform;
  const cmd = plat === "darwin" ? "open" : plat === "win32" ? "start" : "xdg-open";
  spawn(cmd, [url], { stdio: "ignore", detached: true }).unref();
}

export async function runReviewCommand(rt: EditerRuntime, root: string, url?: string): Promise<void> {
  const client = await ensureDaemon(rt.paths, { root, noTunnel: true });
  const st = await client.state();
  const localUrl = url ?? `http://${st.host}:${st.port}`;
  const { stopEditerDaemon } = await import("./shutdown.js");
  await runInteractiveConsole({
    rt,
    localUrl,
    daemonClient: client,
    useDaemonOnly: false,
    onExit: async () => {
      await stopEditerDaemon(rt.paths);
    },
  });
}

export function applySessionTunnelFlags(rt: EditerRuntime, tunnelQuick?: boolean, tunnel?: boolean): void {
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
