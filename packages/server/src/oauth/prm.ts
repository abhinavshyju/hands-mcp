import type { FastifyInstance } from "fastify";
import type { HandsRuntime } from "@hands/core";
import { loadGlobalConfig, resolvePublicBaseUrl } from "@hands/core";
import type { GlobalConfig } from "@hands/shared";

export function oauthIssuerUrl(cfg: GlobalConfig, publicBase: string): string {
  const external = cfg.auth.oauth.externalIssuer?.replace(/\/$/, "");
  if (external) return external;
  return `${publicBase.replace(/\/$/, "")}/oauth`;
}

export function resourceIdentifier(publicBase: string): string {
  return `${publicBase.replace(/\/$/, "")}/mcp`;
}

export function prmWellKnownPath(suffix = ""): string {
  const base = "/.well-known/oauth-protected-resource";
  return suffix ? `${base}/${suffix.replace(/^\//, "")}` : base;
}

export function buildProtectedResourceMetadata(
  cfg: GlobalConfig,
  publicBase: string,
): Record<string, unknown> {
  const issuer = oauthIssuerUrl(cfg, publicBase);
  return {
    resource: resourceIdentifier(publicBase),
    authorization_servers: [issuer],
    scopes_supported: cfg.auth.oauth.scopes,
    bearer_methods_supported: ["header"],
  };
}

export function wwwAuthenticateChallenge(cfg: GlobalConfig, publicBase: string): string {
  const metaUrl = `${publicBase.replace(/\/$/, "")}${prmWellKnownPath("mcp")}`;
  const scope = cfg.auth.oauth.scopes.join(" ") || "mcp";
  return `Bearer resource_metadata="${metaUrl}", scope="${scope}"`;
}

export function registerProtectedResourceMetadata(
  app: FastifyInstance,
  runtime: HandsRuntime,
): void {
  const serve = () => {
    const cfg = loadGlobalConfig(runtime.paths);
    const publicBase = resolvePublicBaseUrl(cfg);
    if (!publicBase) {
      return { error: "oauth public base URL not configured" };
    }
    return buildProtectedResourceMetadata(cfg, publicBase);
  };

  app.get(prmWellKnownPath(), async () => serve());
  app.get(prmWellKnownPath("mcp"), async () => serve());
}
