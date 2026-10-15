import type { AuthMode, GlobalConfig } from "@hands/shared";

/** Public HTTPS base for OAuth issuer and protected-resource metadata. */
export function resolvePublicBaseUrl(cfg: GlobalConfig): string | undefined {
  const explicit = cfg.auth.oauth.publicBaseUrl?.replace(/\/$/, "");
  if (explicit) return explicit;
  const host = cfg.tunnel.hostname?.trim();
  if (host) return `https://${host.replace(/^https?:\/\//, "")}`;
  const quick = cfg.tunnel.quickUrl?.trim();
  if (quick) return quick.replace(/\/$/, "");
  return undefined;
}

export function authStartupWarnings(cfg: GlobalConfig): string[] {
  const warnings: string[] = [];
  const mode = cfg.auth.mode;
  if (mode === "bearer") {
    const active = cfg.tokens.filter((t) => !t.revokedAt);
    if (active.length === 0) {
      warnings.push(
        "auth.mode is bearer but no active tokens — create one with: hands token new <name>",
      );
    }
  }
  if (mode === "oauth" && !cfg.auth.oauth.externalIssuer && !resolvePublicBaseUrl(cfg)) {
    warnings.push(
      "auth.mode is oauth but no public HTTPS URL — set auth.oauth.publicBaseUrl or enable a tunnel with a public hostname",
    );
  }
  return warnings;
}

export interface OAuthDiscoveryUrls {
  publicBaseUrl: string;
  mcpResource: string;
  protectedResourceMetadata: string;
  authorizationServer: string;
  externalIssuer: boolean;
}

export function buildOAuthDiscoveryUrls(cfg: GlobalConfig): OAuthDiscoveryUrls | undefined {
  const publicBase = resolvePublicBaseUrl(cfg);
  if (!publicBase) return undefined;
  const base = publicBase.replace(/\/$/, "");
  const external = Boolean(cfg.auth.oauth.externalIssuer?.trim());
  const authorizationServer = cfg.auth.oauth.externalIssuer?.replace(/\/$/, "") ?? `${base}/oauth`;
  return {
    publicBaseUrl: base,
    mcpResource: `${base}/mcp`,
    protectedResourceMetadata: `${base}/.well-known/oauth-protected-resource/mcp`,
    authorizationServer,
    externalIssuer: external,
  };
}

export function formatOAuthDiscoveryLines(urls: OAuthDiscoveryUrls): string[] {
  const lines = [
    `MCP resource: ${urls.mcpResource}`,
    `Protected resource metadata: ${urls.protectedResourceMetadata}`,
    `Authorization server (issuer): ${urls.authorizationServer}`,
  ];
  if (urls.externalIssuer) {
    lines.push("(external issuer configured — embedded /oauth routes disabled)");
  }
  return lines;
}

export function setAuthModeInConfig(cfg: GlobalConfig, mode: AuthMode): GlobalConfig {
  return {
    ...cfg,
    auth: { ...cfg.auth, mode },
  };
}
