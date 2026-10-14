import { loadGlobalConfig } from "./config.js";
import type { EditerRuntime } from "./runtime.js";

export type McpConnectClient = "claude" | "cursor" | "generic";

export interface McpConnectResult {
  client: McpConnectClient;
  url: string;
  json?: {
    mcpServers: Record<string, { url: string }>;
  };
  pasteText: string;
}

export function buildMcpConnect(
  runtime: EditerRuntime,
  client: McpConnectClient = "generic",
): McpConnectResult {
  const cfg = loadGlobalConfig(runtime.paths);

  const url = cfg.tunnel.hostname
    ? `https://${cfg.tunnel.hostname}/mcp`
    : `http://${runtime.host}:${runtime.port}/mcp`;

  if (client === "generic") {
    const pasteText = `URL: ${url}`;
    return { client, url, pasteText };
  }

  const json = {
    mcpServers: {
      editer: { url },
    },
  };

  return {
    client,
    url,
    json,
    pasteText: JSON.stringify(json, null, 2),
  };
}
