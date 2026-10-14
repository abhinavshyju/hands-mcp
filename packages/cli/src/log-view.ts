import type { AuditEvent } from "@editer/shared";
import type { DaemonClient, EditerRuntime } from "@editer/core";

/** Tools shown in the interactive console (edits, shell, git restore — not reads/meta). */
const MAIN_ACTIVITY_TOOLS = new Set([
  "write_file",
  "create_file",
  "str_replace",
  "multi_edit",
  "apply_patch",
  "delete_path",
  "move_path",
  "run_command",
  "start_process",
  "git_commit",
  "restore_checkpoint",
]);

export function isMainActivityEvent(e: AuditEvent): boolean {
  if (e.type === "tool.error") return Boolean(e.tool && MAIN_ACTIVITY_TOOLS.has(e.tool));
  if (e.type !== "tool.finished") return false;
  return Boolean(e.tool && MAIN_ACTIVITY_TOOLS.has(e.tool));
}

export function filterMainActivity(events: AuditEvent[]): AuditEvent[] {
  return events.filter(isMainActivityEvent);
}

function activityDetail(e: AuditEvent): string {
  const args = e.args as Record<string, unknown> | undefined;
  if (!args) return "";
  if (typeof args.path === "string") return args.path;
  if (typeof args.from === "string" && typeof args.to === "string") {
    return `${args.from} → ${args.to}`;
  }
  if (typeof args.command === "string") {
    const cmd = args.command.trim();
    return cmd.length > 72 ? `${cmd.slice(0, 69)}…` : cmd;
  }
  if (typeof args.message === "string") return args.message;
  if (typeof args.id === "string") return args.id.slice(0, 12);
  return "";
}

/** Short line for console: `write_file  src/app.ts` */
export function formatMainActivityLine(e: AuditEvent): string {
  if (e.type === "tool.error") {
    return `✗ ${e.tool}: ${e.error ?? "failed"}`;
  }
  const tool = e.tool ?? "tool";
  const detail = activityDetail(e);
  return detail ? `${tool}  ${detail}` : tool;
}

export function formatAuditLine(e: AuditEvent): string {
  const ts = new Date(e.ts).toISOString();
  const parts = [ts, e.type];
  if (e.clientName) parts.push(`client=${e.clientName}`);
  if (e.tool) parts.push(`tool=${e.tool}`);
  if (e.durationMs !== undefined) parts.push(`${e.durationMs}ms`);
  if (e.error) parts.push(`ERR ${e.error}`);
  return parts.join(" ");
}

export function printMainActivityEvents(events: AuditEvent[], chronological = true): void {
  const list = filterMainActivity(chronological ? [...events].reverse() : events);
  if (list.length === 0) {
    console.log("(no recent file or command activity)");
    return;
  }
  for (const e of list) {
    console.log(formatMainActivityLine(e));
  }
}

export function printAuditEvents(events: AuditEvent[], chronological = true): void {
  const list = chronological ? [...events].reverse() : events;
  if (list.length === 0) {
    console.log("(no log entries)");
    return;
  }
  for (const e of list) {
    console.log(formatAuditLine(e));
  }
}

export async function fetchAuditEvents(
  client: DaemonClient,
  rt: EditerRuntime,
  opts: { limit?: number; tool?: string; daemonUp?: boolean } = {},
): Promise<AuditEvent[]> {
  const limit = opts.limit ?? 50;
  if (opts.daemonUp || (await client.isRunning())) {
    return client.audit({ limit, tool: opts.tool });
  }
  return rt.audit.query({ limit, tool: opts.tool });
}

export async function followAuditLogs(
  client: DaemonClient,
  rt: EditerRuntime,
  opts: {
    limit?: number;
    tool?: string;
    intervalMs?: number;
    signal?: AbortSignal;
    daemonUp?: boolean;
    mainOnly?: boolean;
  },
): Promise<void> {
  const seen = new Set<string>();
  const intervalMs = opts.intervalMs ?? 500;
  const initial = await fetchAuditEvents(client, rt, {
    limit: opts.limit ?? 30,
    tool: opts.tool,
    daemonUp: opts.daemonUp,
  });
  for (const e of initial) seen.add(e.id);

  while (!opts.signal?.aborted) {
    await sleep(intervalMs);
    const batch = await fetchAuditEvents(client, rt, {
      limit: 20,
      tool: opts.tool,
      daemonUp: opts.daemonUp,
    });
    for (const e of batch) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      if (opts.mainOnly && !isMainActivityEvent(e)) continue;
      console.log(opts.mainOnly ? formatMainActivityLine(e) : formatAuditLine(e));
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
