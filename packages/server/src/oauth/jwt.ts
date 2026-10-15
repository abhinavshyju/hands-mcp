import {
  createLocalJWKSet,
  createRemoteJWKSet,
  jwtVerify,
  type JSONWebKeySet,
  type JWTVerifyGetKey,
} from "jose";
import type { AuthContext, GlobalConfig } from "@hands/shared";
import { oauthIssuerUrl, resourceIdentifier } from "./prm.js";

const metadataCache = new Map<string, { jwks_uri: string; issuer: string; fetchedAt: number }>();

async function fetchAuthorizationServerMetadata(
  issuer: string,
): Promise<{ jwks_uri: string; issuer: string }> {
  const cached = metadataCache.get(issuer);
  if (cached && Date.now() - cached.fetchedAt < 60_000) {
    return { jwks_uri: cached.jwks_uri, issuer: cached.issuer };
  }
  const base = issuer.replace(/\/$/, "");
  const urls = [
    `${base}/.well-known/oauth-authorization-server`,
    `${base}/.well-known/openid-configuration`,
  ];
  let lastErr: Error | undefined;
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const body = (await res.json()) as { jwks_uri?: string; issuer?: string };
      if (!body.jwks_uri) continue;
      const meta = {
        jwks_uri: body.jwks_uri,
        issuer: body.issuer ?? issuer,
        fetchedAt: Date.now(),
      };
      metadataCache.set(issuer, meta);
      return meta;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastErr ?? new Error(`Could not fetch authorization server metadata for ${issuer}`);
}

const jwksClients = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwksClient(jwksUri: string): ReturnType<typeof createRemoteJWKSet> {
  let client = jwksClients.get(jwksUri);
  if (!client) {
    client = createRemoteJWKSet(new URL(jwksUri));
    jwksClients.set(jwksUri, client);
  }
  return client;
}

export async function validateOAuthAccessToken(
  token: string,
  cfg: GlobalConfig,
  publicBase: string,
  localJwks?: JSONWebKeySet,
): Promise<AuthContext> {
  const issuer = oauthIssuerUrl(cfg, publicBase);
  let jwks: JWTVerifyGetKey;
  if (localJwks) {
    jwks = createLocalJWKSet(localJwks);
  } else {
    const meta = await fetchAuthorizationServerMetadata(issuer);
    jwks = getJwksClient(meta.jwks_uri);
  }

  const resource = resourceIdentifier(publicBase);
  let payload: import("jose").JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, jwks, { issuer, audience: resource }));
  } catch {
    ({ payload } = await jwtVerify(token, jwks, { issuer }));
  }

  const scopeStr = typeof payload.scope === "string" ? payload.scope : "";
  const scopes = scopeStr.split(/\s+/).filter(Boolean);
  const required = cfg.auth.oauth.scopes;
  if (required.length > 0 && scopes.length > 0 && !required.some((s) => scopes.includes(s))) {
    throw new Error("insufficient scope");
  }

  const sub = typeof payload.sub === "string" ? payload.sub : "oauth-client";
  const clientId =
    typeof payload.client_id === "string"
      ? payload.client_id
      : typeof payload.azp === "string"
        ? payload.azp
        : undefined;

  return {
    method: "oauth",
    clientId,
    clientName: clientId ?? sub,
    subject: sub,
  };
}
