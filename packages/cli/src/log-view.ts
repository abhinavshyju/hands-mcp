import type { AuditEvent } from "@editer/shared";
import type { DaemonClient, EditerRuntime } from "@editer/core";

export function formatAuditLine(e: AuditEvent): string {
  const ts = new Date(e.ts).toISOString();
  const parts = [ts, e.type];
  if (e.clientName) parts.push(`client=${e.clientName}`);
  if (e.tool) parts.push(`tool=${e.tool}`);
  if (e.durationMs !== undefined) parts.push(`${e.durationMs}ms`);
  if (e.error) parts.push(`ERR ${e.error}`);
  return parts.join(" ");
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
  opts: { limit?: number; tool?: string } = {},
): Promise<AuditEvent[]> {
  const limit = opts.limit ?? 50;
  if (await client.isRunning()) {
    return client.audit({ limit, tool: opts.tool });
  }
  return rt.audit.query({ limit, tool: opts.tool });
}

export async function followAuditLogs(
  client: DaemonClient,
  rt: EditerRuntime,
  opts: { limit?: number; tool?: string; intervalMs?: number; signal?: AbortSignal },
): Promise<void> {
  const seen = new Set<string>();
  const intervalMs = opts.intervalMs ?? 500;
  const initial = await fetchAuditEvents(client, rt, { limit: opts.limit ?? 30, tool: opts.tool });
  for (const e of initial) seen.add(e.id);

  while (!opts.signal?.aborted) {
    await sleep(intervalMs);
    const batch = await fetchAuditEvents(client, rt, { limit: 20, tool: opts.tool });
    for (const e of batch) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      console.log(formatAuditLine(e));
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
