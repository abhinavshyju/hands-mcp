import { loadGlobalConfig } from "./config.js";
import { resolvePublicBaseUrl } from "./authConfig.js";
import type { HandsRuntime } from "./runtime.js";

export type McpConnectClient = "claude" | "cursor" | "generic";

export interface McpConnectResult {
  client: McpConnectClient;
  url: string;
  authMode: "none" | "bearer" | "oauth";
  json?: {
    mcpServers: Record<string, { url: string; headers?: Record<string, string> }>;
  };
  pasteText: string;
}

function mcpUrl(cfg: ReturnType<typeof loadGlobalConfig>, runtime: HandsRuntime): string {
  const publicBase = resolvePublicBaseUrl(cfg);
  if (cfg.auth.mode === "oauth" && publicBase) {
    return `${publicBase.replace(/\/$/, "")}/mcp`;
  }
  if (cfg.tunnel.hostname) {
    return `https://${cfg.tunnel.hostname.replace(/^https?:\/\//, "")}/mcp`;
  }
  return `http://${runtime.host}:${runtime.port}/mcp`;
}

function bearerHeader(cfg: ReturnType<typeof loadGlobalConfig>): string | undefined {
  const active = cfg.tokens.filter((t) => !t.revokedAt);
  const first = active[0];
  return first ? `Bearer ${first.token}` : undefined;
}

export function buildMcpConnect(
  runtime: HandsRuntime,
  client: McpConnectClient = "generic",
): McpConnectResult {
  const cfg = loadGlobalConfig(runtime.paths);
  const url = mcpUrl(cfg, runtime);
  const authMode = cfg.auth.mode;

  if (authMode === "oauth") {
    const publicBase = resolvePublicBaseUrl(cfg);
    const prm = publicBase
      ? `${publicBase.replace(/\/$/, "")}/.well-known/oauth-protected-resource/mcp`
      : "(configure auth.oauth.publicBaseUrl or tunnel)";
    const pasteText = [
      `URL: ${url}`,
      "Auth: OAuth (client discovers authorization via protected resource metadata)",
      `Protected resource metadata: ${prm}`,
    ].join("\n");
    return { client, url, authMode, pasteText };
  }

  const authHeader = authMode === "bearer" ? bearerHeader(cfg) : undefined;

  if (client === "generic") {
    const lines = [`URL: ${url}`];
    if (authMode === "bearer") {
      lines.push(
        authHeader
          ? `Authorization: ${authHeader}`
          : "Authorization: Bearer YOUR_TOKEN (create with: hands token new <name>)",
      );
    } else {
      lines.push("Auth: none (local default)");
    }
    return { client, url, authMode, pasteText: lines.join("\n") };
  }

  const serverEntry: { url: string; headers?: Record<string, string> } = { url };
  if (authHeader) {
    serverEntry.headers = { Authorization: authHeader };
  }

  const json = {
    mcpServers: {
      hands: serverEntry,
    },
  };

  const pasteText =
    authMode === "bearer" && !authHeader
      ? `${JSON.stringify(json, null, 2)}\n\n# Add Authorization header — run: hands token new <name>`
      : JSON.stringify(json, null, 2);

  return {
    client,
    url,
    authMode,
    json,
    pasteText,
  };
}
