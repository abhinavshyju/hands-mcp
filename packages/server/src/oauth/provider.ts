import type { FastifyInstance } from "fastify";
import Provider, { type ClientMetadata } from "oidc-provider";
import type { HandsRuntime } from "@hands/core";
import { loadGlobalConfig, resolvePublicBaseUrl } from "@hands/core";
import {
  appendRegisteredClient,
  loadOrCreateCookieKeys,
  loadOrCreateOAuthKeys,
  loadRegisteredClients,
} from "./keys.js";
import { oauthIssuerUrl } from "./prm.js";

export interface EmbeddedOAuth {
  issuer: string;
  publicJwks: { keys: import("jose").JWK[] };
  registerRoutes: (app: FastifyInstance) => void;
}

export async function createEmbeddedOAuthProvider(
  runtime: HandsRuntime,
): Promise<EmbeddedOAuth | undefined> {
  const cfg = loadGlobalConfig(runtime.paths);
  if (cfg.auth.mode !== "oauth" || cfg.auth.oauth.externalIssuer) {
    return undefined;
  }
  const publicBase = resolvePublicBaseUrl(cfg);
  if (!publicBase) return undefined;

  const keys = await loadOrCreateOAuthKeys(runtime.paths);
  const issuer = oauthIssuerUrl(cfg, publicBase);

  const persisted = loadRegisteredClients(runtime.paths);
  const clients: ClientMetadata[] = persisted
    .filter((c) => Boolean(c.client_id))
    .map(
      (c) =>
        ({
          client_id: String(c.client_id),
          client_secret: c.client_secret as string | undefined,
          redirect_uris: (c.redirect_uris as string[] | undefined) ?? [],
          grant_types: (c.grant_types as string[] | undefined) ?? [
            "authorization_code",
            "refresh_token",
          ],
          response_types: ((c.response_types as string[] | undefined) ?? ["code"]) as ["code"],
          token_endpoint_auth_method: ((c.token_endpoint_auth_method as string | undefined) ??
            "none") as "none",
        }) satisfies ClientMetadata,
    );

  const provider = new Provider(issuer, {
    clients,
    scopes: cfg.auth.oauth.scopes,
    features: {
      devInteractions: { enabled: true },
      registration: cfg.auth.oauth.allowDcr
        ? {
            enabled: true,
            initialAccessToken: false,
          }
        : { enabled: false },
      resourceIndicators: {
        enabled: true,
        defaultResource: () => `${publicBase.replace(/\/$/, "")}/mcp`,
      },
    },
    jwks: { keys: [keys.privateJwk] },
    cookies: {
      keys: loadOrCreateCookieKeys(runtime.paths),
    },
    pkce: {
      required: () => true,
    },
    findAccount: (_ctx, sub) => ({
      accountId: sub,
      async claims() {
        return { sub };
      },
    }),
  });

  provider.on("registration_create.success", (_ctx, client) => {
    appendRegisteredClient(runtime.paths, {
      client_id: client.clientId,
      client_secret: client.clientSecret,
      redirect_uris: client.redirectUris,
      grant_types: client.grantTypes,
      response_types: client.responseTypes,
      token_endpoint_auth_method: client.tokenEndpointAuthMethod,
      registeredAt: Date.now(),
    });
  });

  const callback = provider.callback();

  return {
    issuer,
    publicJwks: keys.publicJwks,
    registerRoutes(app: FastifyInstance) {
      const forward = async (
        req: import("fastify").FastifyRequest,
        reply: import("fastify").FastifyReply,
      ) => {
        reply.hijack();
        await callback(req.raw, reply.raw);
      };
      app.all("/oauth", forward);
      app.all("/oauth/*", forward);
    },
  };
}
