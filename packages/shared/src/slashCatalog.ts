export type SlashCommandKind = "rest" | "local" | "session" | "blockedInSession";

export interface SlashCommandEntry {
  id: string;
  /** CLI argv tokens after leading `/` (e.g. ["tunnel", "status"]) */
  tokens: string[];
  usage: string;
  detail?: string;
  kind: SlashCommandKind;
  /** Alternate first-token forms rewritten before dispatch */
  aliases?: string[][];
  /** Show in `/` picker and Tab completion */
  picker?: boolean;
  /** Group for /help (auth, tunnel, …) */
  group?: string;
}

function e(partial: Omit<SlashCommandEntry, "picker"> & { picker?: boolean }): SlashCommandEntry {
  return { picker: partial.kind !== "blockedInSession", ...partial };
}

/** Canonical slash command catalog (matches `hands` CLI + session extras). */
export const SLASH_CATALOG: SlashCommandEntry[] = [
  e({
    id: "help",
    tokens: ["help"],
    usage: "/help [topic]",
    detail: "List commands or /help tunnel",
    kind: "session",
    group: "session",
  }),
  e({
    id: "clear",
    tokens: ["clear"],
    usage: "/clear",
    detail: "Clear terminal",
    kind: "session",
    group: "session",
  }),
  e({
    id: "quit",
    tokens: ["quit"],
    usage: "/quit",
    detail: "Exit interactive session",
    kind: "session",
    group: "session",
  }),
  e({
    id: "open",
    tokens: ["open"],
    usage: "/open",
    detail: "Open web UI in browser",
    kind: "session",
    group: "session",
  }),

  e({
    id: "auth.mode",
    tokens: ["auth", "mode"],
    usage: "/auth mode <none|bearer|oauth>",
    detail: "HTTP auth for /mcp",
    kind: "rest",
    group: "auth",
    aliases: [["auth-mode"]],
  }),
  e({
    id: "auth.show",
    tokens: ["auth", "show"],
    usage: "/auth show",
    detail: "Auth config JSON",
    kind: "rest",
    group: "auth",
  }),
  e({
    id: "auth.oauth-urls",
    tokens: ["auth", "oauth-urls"],
    usage: "/auth oauth-urls",
    detail: "OAuth discovery URLs",
    kind: "rest",
    group: "auth",
    aliases: [["oauth-urls"]],
  }),

  e({
    id: "token.new",
    tokens: ["token", "new"],
    usage: "/token new <name>",
    kind: "rest",
    group: "token",
  }),
  e({
    id: "token.list",
    tokens: ["token", "list"],
    usage: "/token list",
    kind: "rest",
    group: "token",
  }),
  e({
    id: "token.revoke",
    tokens: ["token", "revoke"],
    usage: "/token revoke <id>",
    kind: "rest",
    group: "token",
  }),

  e({
    id: "mode.show",
    tokens: ["mode"],
    usage: "/mode",
    detail: "Show current mode",
    kind: "rest",
    group: "mode",
  }),
  e({
    id: "mode.set",
    tokens: ["mode", "set"],
    usage: "/mode set <readonly|review|auto>",
    kind: "rest",
    group: "mode",
  }),
  e({
    id: "auto",
    tokens: ["auto"],
    usage: "/auto",
    detail: "Set mode auto",
    kind: "rest",
    group: "mode",
  }),
  e({
    id: "readonly",
    tokens: ["readonly"],
    usage: "/readonly",
    detail: "Set mode readonly",
    kind: "rest",
    group: "mode",
  }),

  e({
    id: "config.show",
    tokens: ["config", "show"],
    usage: "/config show [--global|--project|--effective]",
    kind: "rest",
    group: "config",
  }),
  e({
    id: "config.get",
    tokens: ["config", "get"],
    usage: "/config get <key>",
    kind: "rest",
    group: "config",
  }),
  e({
    id: "config.set",
    tokens: ["config", "set"],
    usage: "/config set <key> <value>",
    kind: "rest",
    group: "config",
  }),
  e({
    id: "config.unset",
    tokens: ["config", "unset"],
    usage: "/config unset <key>",
    kind: "local",
    group: "config",
  }),
  e({
    id: "config.path",
    tokens: ["config", "path"],
    usage: "/config path",
    kind: "local",
    group: "config",
  }),
  e({
    id: "config.edit",
    tokens: ["config", "edit"],
    usage: "/config edit",
    kind: "local",
    group: "config",
  }),

  e({
    id: "workspace.add",
    tokens: ["workspace", "add"],
    usage: "/workspace add <root>",
    kind: "rest",
    group: "workspace",
    aliases: [["workspace"]],
  }),
  e({
    id: "workspace.list",
    tokens: ["workspace", "list"],
    usage: "/workspace list",
    kind: "rest",
    group: "workspace",
  }),
  e({
    id: "workspace.remove",
    tokens: ["workspace", "remove"],
    usage: "/workspace remove <id>",
    kind: "rest",
    group: "workspace",
  }),
  e({
    id: "workspace.use",
    tokens: ["workspace", "use"],
    usage: "/workspace use <id>",
    kind: "rest",
    group: "workspace",
  }),
  e({
    id: "workspace.mode",
    tokens: ["workspace", "mode"],
    usage: "/workspace mode <id> <mode>",
    kind: "rest",
    group: "workspace",
  }),
  e({
    id: "workspace.init",
    tokens: ["workspace", "init"],
    usage: "/workspace init",
    kind: "local",
    group: "workspace",
  }),

  e({
    id: "approvals.list",
    tokens: ["approvals", "list"],
    usage: "/approvals list",
    kind: "rest",
    group: "approvals",
  }),
  e({
    id: "approvals.approve",
    tokens: ["approvals", "approve"],
    usage: "/approvals approve [id] [--all]",
    kind: "rest",
    group: "approvals",
  }),
  e({
    id: "approvals.reject",
    tokens: ["approvals", "reject"],
    usage: "/approvals reject <id>",
    kind: "rest",
    group: "approvals",
  }),
  e({
    id: "review",
    tokens: ["review"],
    usage: "/review",
    kind: "blockedInSession",
    group: "approvals",
  }),

  e({
    id: "status",
    tokens: ["status"],
    usage: "/status",
    kind: "rest",
    group: "daemon",
  }),
  e({
    id: "logs",
    tokens: ["logs"],
    usage: "/logs [n|all|follow|off]",
    kind: "rest",
    group: "daemon",
  }),
  e({
    id: "start",
    tokens: ["start"],
    usage: "/start",
    kind: "blockedInSession",
    group: "daemon",
  }),
  e({
    id: "stop",
    tokens: ["stop"],
    usage: "/stop",
    kind: "blockedInSession",
    group: "daemon",
  }),

  e({
    id: "tunnel.status",
    tokens: ["tunnel", "status"],
    usage: "/tunnel status",
    kind: "rest",
    group: "tunnel",
  }),
  e({
    id: "tunnel.quick",
    tokens: ["tunnel", "quick"],
    usage: "/tunnel quick",
    kind: "rest",
    group: "tunnel",
  }),
  e({
    id: "tunnel.ngrok",
    tokens: ["tunnel", "ngrok"],
    usage: "/tunnel ngrok",
    kind: "rest",
    group: "tunnel",
  }),
  e({
    id: "tunnel.token",
    tokens: ["tunnel", "token"],
    usage: "/tunnel token <token>",
    kind: "rest",
    group: "tunnel",
  }),
  e({
    id: "tunnel.set",
    tokens: ["tunnel", "set"],
    usage: "/tunnel set <off|quick|token|named|ngrok> [hostname]",
    kind: "rest",
    group: "tunnel",
  }),
  e({
    id: "tunnel.enable",
    tokens: ["tunnel", "enable"],
    usage: "/tunnel enable",
    kind: "rest",
    group: "tunnel",
  }),
  e({
    id: "tunnel.disable",
    tokens: ["tunnel", "disable"],
    usage: "/tunnel disable",
    kind: "rest",
    group: "tunnel",
    aliases: [["tunnel", "off"]],
  }),
  e({
    id: "tunnel.restart",
    tokens: ["tunnel", "restart"],
    usage: "/tunnel restart",
    kind: "rest",
    group: "tunnel",
  }),
  e({
    id: "tunnel.start",
    tokens: ["tunnel", "start"],
    usage: "/tunnel start",
    kind: "rest",
    group: "tunnel",
  }),
  e({
    id: "tunnel.stop",
    tokens: ["tunnel", "stop"],
    usage: "/tunnel stop",
    kind: "rest",
    group: "tunnel",
  }),
  e({
    id: "tunnel.install",
    tokens: ["tunnel", "install"],
    usage: "/tunnel install",
    kind: "rest",
    group: "tunnel",
  }),
  e({
    id: "tunnel.login",
    tokens: ["tunnel", "login"],
    usage: "/tunnel login",
    kind: "rest",
    group: "tunnel",
  }),
  e({
    id: "tunnel.create",
    tokens: ["tunnel", "create"],
    usage: "/tunnel create [--name]",
    kind: "rest",
    group: "tunnel",
  }),
  e({
    id: "tunnel.list",
    tokens: ["tunnel", "list"],
    usage: "/tunnel list",
    kind: "rest",
    group: "tunnel",
  }),
  e({
    id: "tunnel.route.dns",
    tokens: ["tunnel", "route", "dns"],
    usage: "/tunnel route dns <hostname> [--name]",
    kind: "rest",
    group: "tunnel",
  }),
  e({
    id: "tunnel.config",
    tokens: ["tunnel", "config"],
    usage: "/tunnel config",
    kind: "rest",
    group: "tunnel",
  }),
  e({
    id: "tunnel.config.set",
    tokens: ["tunnel", "config", "set"],
    usage: "/tunnel config set hostname|name <value>",
    kind: "rest",
    group: "tunnel",
  }),
  e({
    id: "tunnel.setup",
    tokens: ["tunnel", "setup"],
    usage: "/tunnel setup --hostname <host> [--name] [--skip-login]",
    kind: "rest",
    group: "tunnel",
  }),

  e({
    id: "connect",
    tokens: ["connect"],
    usage: "/connect [--client claude|cursor|generic]",
    kind: "rest",
    group: "connect",
  }),
  e({
    id: "stdio",
    tokens: ["stdio"],
    usage: "/stdio",
    kind: "local",
    group: "connect",
  }),
  e({
    id: "tool.new",
    tokens: ["tool", "new"],
    usage: "/tool new <name>",
    kind: "local",
    group: "tool",
  }),
  e({
    id: "init",
    tokens: ["init"],
    usage: "/init [dir]",
    kind: "local",
    group: "init",
  }),
  e({
    id: "completion.bash",
    tokens: ["completion", "bash"],
    usage: "/completion bash",
    kind: "local",
    group: "completion",
  }),
  e({
    id: "completion.zsh",
    tokens: ["completion", "zsh"],
    usage: "/completion zsh",
    kind: "local",
    group: "completion",
  }),
  e({
    id: "completion.fish",
    tokens: ["completion", "fish"],
    usage: "/completion fish",
    kind: "local",
    group: "completion",
  }),
  e({
    id: "completion.install",
    tokens: ["completion", "install"],
    usage: "/completion install",
    kind: "local",
    group: "completion",
  }),
  {
    id: "completion.__complete",
    tokens: ["completion", "__complete"],
    usage: "/completion __complete",
    kind: "local",
    picker: false,
    group: "completion",
  },
];

const MODE_VALUES = ["readonly", "review", "auto"] as const;
const AUTH_MODES = ["none", "bearer", "oauth"] as const;

export function parseSlashLine(line: string): { tokens: string[]; args: string[] } {
  const trimmed = line.trim();
  if (!trimmed.startsWith("/")) {
    return { tokens: [], args: [] };
  }
  const parts = trimmed.slice(1).split(/\s+/).filter(Boolean);
  return { tokens: parts, args: parts };
}

/** Rewrite legacy aliases to canonical CLI token paths. */
export function resolveSlashTokens(tokens: string[]): string[] {
  if (tokens.length === 0) return tokens;
  const first = tokens[0]!.toLowerCase();

  if (first === "auth-mode") {
    return ["auth", "mode", ...tokens.slice(1)];
  }
  if (first === "oauth-urls") {
    return ["auth", "oauth-urls", ...tokens.slice(1)];
  }

  if (
    first === "mode" &&
    tokens.length === 2 &&
    MODE_VALUES.includes(tokens[1]!.toLowerCase() as (typeof MODE_VALUES)[number])
  ) {
    return ["mode", "set", tokens[1]!.toLowerCase()];
  }

  if (first === "workspace" && tokens.length >= 2) {
    const sub = tokens[1]!.toLowerCase();
    const known = new Set(["add", "list", "remove", "use", "mode", "init"]);
    if (!known.has(sub)) {
      return ["workspace", "add", ...tokens.slice(1)];
    }
  }

  if (first === "tunnel" && tokens.length >= 2 && tokens[1]!.toLowerCase() === "off") {
    return ["tunnel", "disable", ...tokens.slice(2)];
  }

  if (first === "auth-mode" || first === "auth") {
    void AUTH_MODES;
  }

  return tokens.map((t, i) => (i === 0 ? t.toLowerCase() : t));
}

export function resolveSlashLine(line: string): string[] {
  const { tokens } = parseSlashLine(line);
  return resolveSlashTokens(tokens.map((t) => t.toLowerCase()));
}

export function catalogEntryForTokens(tokens: string[]): SlashCommandEntry | undefined {
  const norm = resolveSlashTokens(tokens.map((t) => t.toLowerCase()));
  if (norm.length === 0) return undefined;

  for (const entry of SLASH_CATALOG) {
    if (entry.tokens.length > norm.length) continue;
    let match = true;
    for (let i = 0; i < entry.tokens.length; i++) {
      if (entry.tokens[i]!.toLowerCase() !== norm[i]!.toLowerCase()) {
        match = false;
        break;
      }
    }
    if (match) return entry;
  }

  for (const entry of SLASH_CATALOG) {
    if (!entry.aliases) continue;
    for (const alias of entry.aliases) {
      if (alias.length > norm.length) continue;
      let match = true;
      for (let i = 0; i < alias.length; i++) {
        if (alias[i]!.toLowerCase() !== norm[i]!.toLowerCase()) {
          match = false;
          break;
        }
      }
      if (match) return entry;
    }
  }
  return undefined;
}

export function pickerEntries(): SlashCommandEntry[] {
  return SLASH_CATALOG.filter((e) => e.picker !== false);
}

export function filterSlashCompletions(partial: string): string[] {
  const trimmed = partial.trimStart();
  if (!trimmed.startsWith("/")) return [];

  const inner = trimmed.slice(1);
  const parts = inner.split(/\s+/).filter(Boolean);
  const isPrefix = !inner.endsWith(" ") && parts.length > 0;
  const completedParts = isPrefix ? parts.slice(0, -1) : parts;
  const fragment = isPrefix ? (parts[parts.length - 1] ?? "").toLowerCase() : "";

  const basePrefix = completedParts.length > 0 ? `/${completedParts.join(" ")}` : "/";
  const needSpace = completedParts.length > 0 && !isPrefix;

  const candidates: string[] = [];

  for (const entry of pickerEntries()) {
    const usage = entry.usage;
    if (completedParts.length === 0) {
      const first = `/${entry.tokens[0]}`;
      if (first.toLowerCase().startsWith(trimmed.toLowerCase()) || trimmed === "/") {
        candidates.push(usage.split(" ")[0] ?? usage);
      }
      continue;
    }

    let match = true;
    for (let i = 0; i < completedParts.length; i++) {
      if (entry.tokens[i]?.toLowerCase() !== completedParts[i]!.toLowerCase()) {
        match = false;
        break;
      }
    }
    if (!match) continue;

    const nextToken = entry.tokens[completedParts.length];
    if (nextToken) {
      const cand = `${basePrefix}${needSpace ? " " : " "}${nextToken}`;
      if (!fragment || nextToken.toLowerCase().startsWith(fragment)) {
        candidates.push(cand.trimStart() === "/" ? cand : cand);
      }
    } else if (
      entry.usage.startsWith(basePrefix) ||
      basePrefix.startsWith(`/${entry.tokens.join(" ")}`)
    ) {
      candidates.push(entry.usage);
    }
  }

  if (completedParts.length === 1 && completedParts[0]!.toLowerCase() === "mode") {
    for (const m of MODE_VALUES) {
      const cand = `/mode ${m}`;
      if (cand.startsWith(trimmed) || !fragment || m.startsWith(fragment)) {
        candidates.push(cand);
      }
    }
  }
  if (
    completedParts.length === 2 &&
    completedParts[0]!.toLowerCase() === "auth" &&
    completedParts[1]!.toLowerCase() === "mode"
  ) {
    for (const m of AUTH_MODES) {
      candidates.push(`/auth mode ${m}`);
    }
  }
  if (completedParts.length === 1 && completedParts[0]!.toLowerCase() === "auth-mode") {
    for (const m of AUTH_MODES) {
      candidates.push(`/auth-mode ${m}`);
    }
  }

  const helpTopics = ["mode", "auth", "tunnel", "logs"];
  if (completedParts.length === 1 && completedParts[0]!.toLowerCase() === "help") {
    for (const t of helpTopics) {
      candidates.push(`/help ${t}`);
    }
  }

  const uniq = [...new Set(candidates)].filter((c) =>
    c.toLowerCase().startsWith(trimmed.toLowerCase()),
  );
  if (uniq.length === 0 && trimmed === "/") {
    return pickerEntries().map((e) => e.usage.split(" ")[0] ?? e.usage);
  }
  return uniq.sort();
}

export function formatSlashHelp(topic?: string): string[] {
  const lines: string[] = [];
  const entries = pickerEntries();
  const groups = new Map<string, SlashCommandEntry[]>();
  for (const entry of entries) {
    const g = entry.group ?? "other";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(entry);
  }

  const filterGroup = (g: string) => {
    if (!topic) return true;
    if (topic === "auth") return g === "auth" || g === "token";
    return g === topic;
  };

  if (topic === "logs") {
    return [
      "/logs — last 30 entries",
      "/logs 50 — last 50 entries",
      "/logs follow — stream activity (console)",
      "/logs all 30 — full audit log",
      "/logs off — pause live stream (console)",
    ];
  }

  for (const [group, items] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (!filterGroup(group)) continue;
    lines.push(`[${group}]`);
    for (const item of items) {
      lines.push(`  ${item.usage}${item.detail ? ` — ${item.detail}` : ""}`);
    }
    lines.push("");
  }
  return lines.filter((l, i, a) => !(l === "" && i === a.length - 1));
}

export function cliOnlyHint(tokens: string[]): string {
  return `CLI-only. Run: hands ${tokens.join(" ")}`;
}

export function blockedInSessionMessage(tokens: string[]): string {
  const cmd = tokens[0];
  if (cmd === "start" || cmd === "stop") {
    return `Use \`hands ${tokens.join(" ")}\` from another terminal, or /quit to exit this session.`;
  }
  if (cmd === "review") {
    return "Use `hands review` in a dedicated terminal (interactive approval console).";
  }
  return `Not available in this session. Run: hands ${tokens.join(" ")}`;
}
