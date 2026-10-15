import {
  blockedInSessionMessage,
  catalogEntryForTokens,
  cliOnlyHint,
  formatSlashHelp,
  resolveSlashLine,
  type SlashCommandKind,
} from "@hands/shared";
import { api } from "./api.js";
import type { AuthMode, TunnelMode } from "./api.js";

export type SlashResult = { ok: true; lines: string[] } | { ok: false; error: string };

function linesFromJson(data: unknown): string[] {
  return [JSON.stringify(data, null, 2)];
}

function parseFlags(tokens: string[]): {
  positional: string[];
  flags: Record<string, string | boolean>;
} {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t === "--all") {
      flags.all = true;
      continue;
    }
    if (t === "--skip-login") {
      flags.skipLogin = true;
      continue;
    }
    if (t.startsWith("--")) {
      const key = t.slice(2);
      const next = tokens[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
      continue;
    }
    positional.push(t);
  }
  return { positional, flags };
}

export async function runSlashCommand(line: string): Promise<SlashResult> {
  const trimmed = line.trim();
  if (!trimmed.startsWith("/")) {
    return { ok: false, error: "Commands start with / (e.g. /auth mode oauth)" };
  }

  const tokens = resolveSlashLine(trimmed);
  if (tokens.length === 0) {
    return { ok: false, error: "Empty command" };
  }

  const entry = catalogEntryForTokens(tokens);
  const kind: SlashCommandKind = entry?.kind ?? "rest";

  if (kind === "session") {
    const cmd = tokens[0];
    if (cmd === "help") {
      const topic = tokens[1];
      return { ok: true, lines: formatSlashHelp(topic) };
    }
    if (cmd === "open") {
      window.open(window.location.origin, "_blank");
      return { ok: true, lines: ["Opened web UI"] };
    }
    if (cmd === "clear" || cmd === "quit") {
      return { ok: true, lines: ["Use the console for /clear and /quit"] };
    }
  }

  if (kind === "blockedInSession") {
    return { ok: false, error: blockedInSessionMessage(tokens) };
  }

  if (kind === "local") {
    return { ok: true, lines: [cliOnlyHint(tokens)] };
  }

  try {
    return await executeRestSlash(tokens);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function executeRestSlash(tokens: string[]): Promise<SlashResult> {
  const { positional, flags } = parseFlags(tokens);
  const [top, sub, ...rest] = positional;

  if (top === "auth") {
    if (sub === "mode") {
      const modeArg = (positional[2] ?? flags.mode) as string | undefined;
      if (!modeArg) {
        const cfg = await api<{ auth?: { mode?: AuthMode } }>("/api/config/global");
        return {
          ok: true,
          lines: [`auth.mode = ${cfg.auth?.mode ?? "none"}`, "Usage: /auth mode none|bearer|oauth"],
        };
      }
      const res = await api<{ auth: { mode: AuthMode }; warnings: string[] }>("/api/auth/mode", {
        method: "POST",
        body: JSON.stringify({ mode: modeArg }),
      });
      const lines = [`auth.mode = ${res.auth.mode}`];
      for (const w of res.warnings ?? []) lines.push(`Warning: ${w}`);
      return { ok: true, lines };
    }
    if (sub === "show") {
      const cfg = await api<{ auth?: unknown }>("/api/config/global");
      return { ok: true, lines: linesFromJson(cfg.auth ?? {}) };
    }
    if (sub === "oauth-urls") {
      const urls = await api<Record<string, unknown>>("/api/auth/oauth-urls");
      return { ok: true, lines: linesFromJson(urls) };
    }
  }

  if (top === "token") {
    if (sub === "new") {
      const name = rest.join(" ").trim() || (flags.name as string | undefined);
      if (!name) return { ok: false, error: "Usage: /token new <name>" };
      const t = await api<{ name: string; id: string; token: string }>("/api/tokens", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      return {
        ok: true,
        lines: [
          `Created token "${t.name}" (${t.id})`,
          `Bearer ${t.token}`,
          "(copy now — not shown again in the UI list)",
        ],
      };
    }
    if (sub === "list") {
      const cfg = await api<{ tokens?: Array<{ id: string; name: string; createdAt: number }> }>(
        "/api/config/global",
      );
      const lines = (cfg.tokens ?? []).map((t) => `${t.name}\t${t.id}\t${t.createdAt}`);
      return { ok: true, lines: lines.length ? lines : ["(no tokens)"] };
    }
    if (sub === "revoke") {
      const id = positional[2];
      if (!id) return { ok: false, error: "Usage: /token revoke <id>" };
      await api(`/api/tokens/${encodeURIComponent(id)}`, { method: "DELETE" });
      return { ok: true, lines: [`Revoked token ${id}`] };
    }
  }

  if (top === "mode") {
    if (!sub || sub === "set") {
      const modeArg = sub === "set" ? positional[2] : sub;
      if (!modeArg) {
        const st = await api<{ mode: string; modeSource: string }>("/api/state");
        return {
          ok: true,
          lines: [
            `Current mode: ${st.mode} (${st.modeSource})`,
            "Usage: /mode set readonly|review|auto",
          ],
        };
      }
      await api("/api/mode", {
        method: "POST",
        body: JSON.stringify({ mode: modeArg }),
      });
      return { ok: true, lines: [`Mode set to ${modeArg}`] };
    }
  }

  if (top === "auto" || top === "readonly") {
    const mode = top === "auto" ? "auto" : "readonly";
    await api("/api/mode", { method: "POST", body: JSON.stringify({ mode }) });
    return { ok: true, lines: [`Mode set to ${mode}`] };
  }

  if (top === "config") {
    if (sub === "show") {
      const scope = flags.global ? "global" : flags.project ? "project" : "effective";
      if (scope === "global") {
        return { ok: true, lines: linesFromJson(await api("/api/config/global")) };
      }
      return { ok: true, lines: linesFromJson(await api("/api/config")) };
    }
    if (sub === "get") {
      const key = positional[2];
      if (!key) return { ok: false, error: "Usage: /config get <key>" };
      const merged = await api<Record<string, unknown>>("/api/config");
      const parts = key.split(".");
      let cur: unknown = merged;
      for (const p of parts) {
        if (cur && typeof cur === "object" && p in cur) cur = (cur as Record<string, unknown>)[p];
        else cur = null;
      }
      return { ok: true, lines: [JSON.stringify(cur ?? null)] };
    }
    if (sub === "set") {
      const key = positional[2];
      const value = positional.slice(3).join(" ");
      if (!key || !value) return { ok: false, error: "Usage: /config set <key> <value>" };
      await api("/api/config/global", {
        method: "POST",
        body: JSON.stringify({ [key.split(".")[0]!]: JSON.parse(value) }),
      });
      return { ok: true, lines: ["OK (global config patch sent)"] };
    }
  }

  if (top === "workspace") {
    if (sub === "add") {
      const root = rest.join(" ") || positional[2];
      if (!root) return { ok: false, error: "Usage: /workspace add <root>" };
      await api("/api/workspaces", { method: "POST", body: JSON.stringify({ root }) });
      return { ok: true, lines: [`Workspace added: ${root}`] };
    }
    if (sub === "list") {
      const list =
        await api<Array<{ id: string; name: string; root: string; mode: string }>>(
          "/api/workspaces",
        );
      return {
        ok: true,
        lines: list.map((w) => `${w.id}\t${w.mode}\t${w.name}\t${w.root}`),
      };
    }
    if (sub === "remove") {
      const id = positional[2];
      if (!id) return { ok: false, error: "Usage: /workspace remove <id>" };
      await api(`/api/workspaces/${encodeURIComponent(id)}`, { method: "DELETE" });
      return { ok: true, lines: [`Removed ${id}`] };
    }
    if (sub === "use") {
      const id = positional[2];
      if (!id) return { ok: false, error: "Usage: /workspace use <id>" };
      await api(`/api/workspaces/${encodeURIComponent(id)}/activate`, {
        method: "POST",
        body: "{}",
      });
      return { ok: true, lines: [`Active workspace: ${id}`] };
    }
    if (sub === "mode") {
      const id = positional[2];
      const mode = positional[3];
      if (!id || !mode) return { ok: false, error: "Usage: /workspace mode <id> <mode>" };
      await api(`/api/workspaces/${encodeURIComponent(id)}/mode`, {
        method: "POST",
        body: JSON.stringify({ mode }),
      });
      return { ok: true, lines: [`Mode for ${id}: ${mode}`] };
    }
  }

  if (top === "approvals") {
    if (sub === "list") {
      const pending =
        await api<Array<{ id: string; tool: string; summary: string }>>("/api/approvals");
      return {
        ok: true,
        lines: pending.length
          ? pending.map((a) => `${a.id.slice(0, 8)}… ${a.tool} ${a.summary}`)
          : ["No pending approvals."],
      };
    }
    if (sub === "approve") {
      if (flags.all) {
        const res = await api<{ count: number }>("/api/approvals/decide-all", {
          method: "POST",
          body: JSON.stringify({ approved: true, reason: "slash-all" }),
        });
        return { ok: true, lines: [`Approved ${res.count}.`] };
      }
      const id = positional[2];
      if (!id) return { ok: false, error: "Usage: /approvals approve <id> or --all" };
      await api(`/api/approvals/${encodeURIComponent(id)}`, {
        method: "POST",
        body: JSON.stringify({ approved: true, reason: "slash" }),
      });
      return { ok: true, lines: ["Approved."] };
    }
    if (sub === "reject") {
      const id = positional[2];
      if (!id) return { ok: false, error: "Usage: /approvals reject <id>" };
      await api(`/api/approvals/${encodeURIComponent(id)}`, {
        method: "POST",
        body: JSON.stringify({ approved: false, reason: "slash" }),
      });
      return { ok: true, lines: ["Rejected."] };
    }
  }

  if (top === "status") {
    return { ok: true, lines: linesFromJson(await api("/api/state")) };
  }

  if (top === "logs") {
    const arg = sub?.toLowerCase();
    const verbose = arg === "all";
    const limitToken = verbose ? positional[2] : sub;
    const limit = limitToken && /^\d+$/.test(limitToken) ? Number(limitToken) : 30;
    const events = await api<Array<{ id: string; tool?: string; summary?: string }>>(
      `/api/audit?limit=${limit}`,
    );
    return {
      ok: true,
      lines: events.map((e) => `${e.tool ?? "event"}\t${e.summary ?? e.id}`),
    };
  }

  if (top === "connect") {
    const client = (flags.client as string | undefined) ?? "generic";
    const out = await api<{ pasteText: string }>(
      `/api/mcp/connect?client=${encodeURIComponent(client)}`,
    );
    return { ok: true, lines: out.pasteText.split("\n") };
  }

  if (top === "tunnel") {
    return executeTunnelSlash(positional, flags, rest);
  }

  return { ok: false, error: `Unknown command /${tokens.join(" ")}. Try /help` };
}

async function executeTunnelSlash(
  positional: string[],
  flags: Record<string, string | boolean>,
  rest: string[],
): Promise<SlashResult> {
  const sub = positional[1]?.toLowerCase();
  if (!sub || sub === "help") {
    return { ok: true, lines: formatSlashHelp("tunnel") };
  }

  if (sub === "status") {
    const st = await api<{ tunnel: unknown }>("/api/state");
    return { ok: true, lines: linesFromJson(st.tunnel) };
  }
  if (sub === "quick") {
    const out = await api<{ tunnel: unknown }>("/api/tunnel/quick", { method: "POST", body: "{}" });
    return { ok: true, lines: linesFromJson(out.tunnel) };
  }
  if (sub === "ngrok") {
    await api("/api/config/tunnel", {
      method: "POST",
      body: JSON.stringify({ mode: "ngrok", enabled: true }),
    });
    const out = await api<{ tunnel: unknown }>("/api/tunnel/restart", {
      method: "POST",
      body: "{}",
    });
    return {
      ok: true,
      lines: [
        ...linesFromJson(out.tunnel),
        "Tip: set NGROK_AUTHTOKEN or tunnel ngrok authtoken in settings",
      ],
    };
  }
  if (sub === "off" || sub === "disable") {
    await api("/api/config/tunnel", {
      method: "POST",
      body: JSON.stringify({ mode: "off", enabled: false }),
    });
    return { ok: true, lines: ["Tunnel disabled"] };
  }
  if (sub === "restart") {
    const out = await api<{ tunnel: unknown }>("/api/tunnel/restart", {
      method: "POST",
      body: "{}",
    });
    return { ok: true, lines: linesFromJson(out.tunnel) };
  }
  if (sub === "start" || sub === "stop") {
    const out = await api<{ tunnel: unknown }>(`/api/tunnel/${sub}`, {
      method: "POST",
      body: "{}",
    });
    return { ok: true, lines: linesFromJson(out.tunnel) };
  }
  if (sub === "enable") {
    await api("/api/config/tunnel", { method: "POST", body: JSON.stringify({ enabled: true }) });
    return { ok: true, lines: ["Tunnel enabled"] };
  }
  if (sub === "install") {
    const out = await api<{ bin: string }>("/api/tunnel/install", { method: "POST", body: "{}" });
    return { ok: true, lines: [`Installed: ${out.bin}`] };
  }
  if (sub === "login") {
    const out = await api<{ ok: boolean; loginUrl?: string; stderr: string }>("/api/tunnel/login", {
      method: "POST",
      body: "{}",
    });
    const lines: string[] = [];
    if (out.loginUrl) lines.push(`Open in browser: ${out.loginUrl}`);
    if (out.ok) lines.push("cloudflared login completed.");
    else if (out.stderr) lines.push(out.stderr);
    if (!out.ok) {
      return {
        ok: false,
        error: lines.join("\n") || "cloudflared tunnel login failed",
      };
    }
    return {
      ok: true,
      lines: lines.length ? lines : ["Login finished — check cloudflared credentials"],
    };
  }
  if (sub === "create") {
    const name = (flags.name as string | undefined) ?? positional[2];
    const out = await api<Record<string, unknown>>("/api/tunnel/create", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    return { ok: true, lines: linesFromJson(out) };
  }
  if (sub === "list") {
    const out = await api<{ text: string }>("/api/tunnel/list");
    return { ok: true, lines: out.text.split("\n") };
  }
  if (sub === "route" && positional[2]?.toLowerCase() === "dns") {
    const hostname = positional[3] ?? (flags.hostname as string | undefined);
    const name = flags.name as string | undefined;
    if (!hostname) return { ok: false, error: "Usage: /tunnel route dns <hostname> [--name]" };
    await api("/api/tunnel/route-dns", {
      method: "POST",
      body: JSON.stringify({ hostname, name }),
    });
    return { ok: true, lines: [`DNS route created for ${hostname}`] };
  }
  if (sub === "config") {
    if (positional[2]?.toLowerCase() === "set") {
      const field = positional[3]?.toLowerCase();
      const value = positional[4] ?? rest.join(" ");
      if (field === "hostname" && value) {
        await api("/api/config/tunnel", {
          method: "POST",
          body: JSON.stringify({ hostname: value, mode: "named", enabled: true }),
        });
        return { ok: true, lines: [`hostname = ${value}`] };
      }
      if (field === "name" && value) {
        await api("/api/config/tunnel", {
          method: "POST",
          body: JSON.stringify({ tunnelName: value }),
        });
        return { ok: true, lines: [`tunnelName = ${value}`] };
      }
      return { ok: false, error: "Usage: /tunnel config set hostname|name <value>" };
    }
    const cfg = await api<Record<string, unknown>>("/api/tunnel/config");
    return { ok: true, lines: linesFromJson(cfg) };
  }
  if (sub === "setup") {
    const hostname = (flags.hostname as string | undefined) ?? positional[2];
    if (!hostname) {
      return {
        ok: false,
        error: "Usage: /tunnel setup --hostname <host> [--name] [--skip-login]",
      };
    }
    const out = await api<{ mcpUrl: string; tunnelName: string }>("/api/tunnel/setup", {
      method: "POST",
      body: JSON.stringify({
        hostname,
        name: flags.name as string | undefined,
        skipLogin: flags.skipLogin === true,
      }),
    });
    return {
      ok: true,
      lines: [`Tunnel configured (${out.tunnelName})`, `MCP URL: ${out.mcpUrl}`],
    };
  }
  if (sub === "set") {
    const modeArg = positional[2]?.toLowerCase() as TunnelMode | undefined;
    const modes: TunnelMode[] = ["off", "quick", "token", "named", "ngrok"];
    if (!modeArg || !modes.includes(modeArg)) {
      return { ok: false, error: "Usage: /tunnel set off|quick|token|named|ngrok [hostname]" };
    }
    const hostname = positional[3];
    await api("/api/config/tunnel", {
      method: "POST",
      body: JSON.stringify({
        mode: modeArg,
        enabled: modeArg !== "off",
        ...(hostname ? { hostname } : {}),
      }),
    });
    return { ok: true, lines: [`Tunnel mode set to ${modeArg}`] };
  }
  if (sub === "token") {
    const token = positional[2];
    if (!token) return { ok: false, error: "Usage: /tunnel token <token>" };
    await api("/api/config/tunnel", {
      method: "POST",
      body: JSON.stringify({ mode: "token", token, enabled: true }),
    });
    return { ok: true, lines: ["Tunnel mode: token"] };
  }

  return { ok: false, error: `Unknown /tunnel subcommand "${sub}"` };
}
