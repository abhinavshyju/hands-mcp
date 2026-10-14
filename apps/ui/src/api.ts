export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return (await res.json()) as T;
}

export interface DaemonState {
  version: string;
  host: string;
  port: number;
  mode: string;
  workspace: { id: string; name: string; root: string; mode: string } | null;
  tunnel: { enabled: boolean; hostname?: string; healthy: boolean; status: string };
  toolCount: number;
  headless: boolean;
}

export interface TreeEntry {
  name: string;
  isDirectory: boolean;
}

export interface Approval {
  id: string;
  summary: string;
  tool: string;
  preview?: string;
  diff?: string;
  command?: string;
  status: string;
}

export interface Checkpoint {
  id: string;
  ts: number;
  tool: string;
  files: string[];
  message: string;
}

export interface AuditEvent {
  id: string;
  ts: number;
  type: string;
  tool?: string;
  clientName?: string;
  durationMs?: number;
  args?: unknown;
  result?: unknown;
  error?: string;
}

export interface Proc {
  id: string;
  command: string;
  status: string;
  detectedPort?: number;
}

export interface BrowserSessionInfo {
  name: string;
  url: string;
  title?: string;
  consoleErrors: number;
  createdAt: number;
  lastUsedAt: number;
}

export type McpConnectClient = "claude" | "cursor" | "generic";

export interface McpConnectInfo {
  client: McpConnectClient;
  url: string;
  json?: {
    mcpServers: Record<string, { url: string }>;
  };
  pasteText: string;
}
