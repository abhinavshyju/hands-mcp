import { randomUUID } from "node:crypto";
import type { HandsPaths } from "@hands/core";
import { loadGlobalConfig } from "@hands/core";

export const MCP_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "content-type, accept, authorization, mcp-session-id, last-event-id",
  "Access-Control-Expose-Headers": "mcp-session-id",
  "Cache-Control": "no-store",
};

export function applyMcpCorsHeaders(res: {
  setHeader: (name: string, value: string) => void;
}): void {
  for (const [name, value] of Object.entries(MCP_CORS_HEADERS)) {
    res.setHeader(name, value);
  }
}

/** Streamable HTTP options tuned for reverse proxies (e.g. Cloudflare). */
export function mcpStreamableHttpTransportOptions(paths: HandsPaths): {
  sessionIdGenerator: () => string;
  enableJsonResponse: boolean;
  enableDnsRebindingProtection?: boolean;
  allowedHosts?: string[];
  allowedOrigins?: string[];
} {
  const cfg = loadGlobalConfig(paths);
  const hostname = cfg.tunnel.hostname?.replace(/^https?:\/\//, "").trim();
  const port = cfg.port;
  const loopbackHosts = [
    "127.0.0.1",
    "localhost",
    `[::1]`,
    `127.0.0.1:${port}`,
    `localhost:${port}`,
    `[::1]:${port}`,
  ];
  const base = {
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true as const,
  };
  if (!hostname) return base;
  return {
    ...base,
    enableDnsRebindingProtection: true,
    allowedHosts: [...loopbackHosts, hostname],
    allowedOrigins: [`https://${hostname}`],
  };
}
