import type { AuditEvent } from "@hands/shared";
import type { DaemonClient, HandsRuntime } from "@hands/core";
import { formatColoredActivityLines } from "./ui/activity.js";
import { hint } from "./ui/render.js";

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

function terminalWidth(): number {
  if (typeof process.stdout.columns === "number" && process.stdout.columns > 0) {
    return process.stdout.columns;
  }
  return 80;
}

function printActivityEvent(e: AuditEvent, verbose = false): void {
  for (const line of formatColoredActivityLines(e, {
    verbose,
    terminalWidth: terminalWidth(),
  })) {
    console.log(line);
  }
}

/** Short line for console (multi-line human-readable block). */
export function formatMainActivityLine(e: AuditEvent): string {
  return formatColoredActivityLines(e, { verbose: false, terminalWidth: terminalWidth() }).join(
    "\n",
  );
}

/** Verbose audit line (human-readable with type/client meta). */
export function formatAuditLine(e: AuditEvent): string {
  return formatColoredActivityLines(e, { verbose: true, terminalWidth: terminalWidth() }).join(
    "\n",
  );
}

export function printMainActivityEvents(events: AuditEvent[], chronological = true): void {
  const list = filterMainActivity(chronological ? [...events].reverse() : events);
  if (list.length === 0) {
    hint("(no recent file or command activity)");
    return;
  }
  for (const e of list) {
    printActivityEvent(e, false);
  }
}

export function printAuditEvents(events: AuditEvent[], chronological = true, verbose = true): void {
  const list = chronological ? [...events].reverse() : events;
  if (list.length === 0) {
    hint("(no log entries)");
    return;
  }
  for (const e of list) {
    printActivityEvent(e, verbose);
  }
}

/** Legacy compact ISO line (for `hands logs --verbose-legacy` if needed). */
export function formatAuditLineLegacy(e: AuditEvent): string {
  const ts = new Date(e.ts).toISOString();
  const parts = [ts, e.type];
  if (e.clientName) parts.push(`client=${e.clientName}`);
  if (e.tool) parts.push(`tool=${e.tool}`);
  if (e.durationMs !== undefined) parts.push(`${e.durationMs}ms`);
  if (e.error) parts.push(`ERR ${e.error}`);
  return parts.join(" ");
}

export type AuditFetchOpts = {
  limit?: number;
  tool?: string;
  daemonUp?: boolean;
  workspaceId?: string;
  all?: boolean;
};

export async function resolveActiveWorkspaceId(
  client: DaemonClient,
  rt: HandsRuntime,
  daemonUp = false,
): Promise<string | undefined> {
  if (daemonUp || (await client.isRunning())) {
    try {
      const st = await client.state();
      return st.workspace?.id;
    } catch {
      // fall through
    }
  }
  return rt.workspaces.getActive()?.id;
}

export async function fetchAuditEvents(
  client: DaemonClient,
  rt: HandsRuntime,
  opts: AuditFetchOpts = {},
): Promise<AuditEvent[]> {
  const limit = opts.limit ?? 50;
  const queryOpts = {
    limit,
    tool: opts.tool,
    workspaceId: opts.all ? undefined : opts.workspaceId,
  };
  if (opts.daemonUp || (await client.isRunning())) {
    return client.audit({
      limit,
      tool: opts.tool,
      all: opts.all,
      workspaceId: opts.all ? undefined : opts.workspaceId,
    });
  }
  return rt.audit.query(queryOpts);
}

export async function followAuditLogs(
  client: DaemonClient,
  rt: HandsRuntime,
  opts: {
    limit?: number;
    tool?: string;
    intervalMs?: number;
    signal?: AbortSignal;
    daemonUp?: boolean;
    mainOnly?: boolean;
    verbose?: boolean;
    workspaceId?: string;
    all?: boolean;
  },
): Promise<void> {
  const seen = new Set<string>();
  const intervalMs = opts.intervalMs ?? 500;
  const fetchOpts = {
    limit: opts.limit ?? 30,
    tool: opts.tool,
    daemonUp: opts.daemonUp,
    workspaceId: opts.workspaceId,
    all: opts.all,
  };
  const initial = await fetchAuditEvents(client, rt, fetchOpts);
  for (const e of initial) seen.add(e.id);

  while (!opts.signal?.aborted) {
    await sleep(intervalMs);
    const batch = await fetchAuditEvents(client, rt, {
      limit: 20,
      tool: opts.tool,
      daemonUp: opts.daemonUp,
      workspaceId: opts.workspaceId,
      all: opts.all,
    });
    for (const e of batch) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      if (opts.mainOnly && !isMainActivityEvent(e)) continue;
      printActivityEvent(e, opts.verbose ?? !opts.mainOnly);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
