import type { FastifyReply, FastifyRequest } from "fastify";
import type { HandsRuntime } from "@hands/core";
import { loadGlobalConfig, resolvePublicBaseUrl } from "@hands/core";
import type { AuthContext } from "@hands/shared";
import { AuthError } from "@hands/shared";
import {
  isHealthPath,
  isLoopbackIp,
  isProtectedApiPath,
  parseBearerToken,
  requestPath,
} from "./authUtil.js";
import { validateOAuthAccessToken } from "./oauth/jwt.js";
import { wwwAuthenticateChallenge } from "./oauth/prm.js";
import type { EmbeddedOAuth } from "./oauth/provider.js";

declare module "fastify" {
  interface FastifyRequest {
    handsAuth?: AuthContext;
  }
}

export interface AuthRuntimeState {
  embeddedOAuth?: EmbeddedOAuth;
}

function loopbackBypass(req: FastifyRequest, cfg: ReturnType<typeof loadGlobalConfig>): boolean {
  if (!cfg.auth.loopbackBypass) return false;
  if (!isLoopbackIp(req.ip)) return false;
  const path = requestPath(req);
  return path.startsWith("/api") || path === "/ws";
}

function unauthenticatedReply(
  reply: FastifyReply,
  cfg: ReturnType<typeof loadGlobalConfig>,
  publicBase: string | undefined,
  message: string,
): FastifyReply {
  if (cfg.auth.mode === "oauth" && publicBase) {
    reply.header("WWW-Authenticate", wwwAuthenticateChallenge(cfg, publicBase));
  }
  return reply.code(401).send({ error: message });
}

/** Attach auth context; enforce bearer/oauth on protected routes. */
export function registerAuth(runtime: HandsRuntime, state: AuthRuntimeState) {
  return async function authHook(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const path = requestPath(req);
    if (isHealthPath(path)) return;
    if (path.startsWith("/.well-known/") || path.startsWith("/oauth")) return;
    if (!isProtectedApiPath(path)) {
      req.handsAuth = { method: "none", clientName: "static" };
      return;
    }

    const cfg = loadGlobalConfig(runtime.paths);
    const mode = cfg.auth.mode;
    const publicBase = resolvePublicBaseUrl(cfg);

    if (loopbackBypass(req, cfg)) {
      req.handsAuth = { method: "loopback", clientName: "local-ui" };
      return;
    }

    if (mode === "none") {
      req.handsAuth = { method: "none", clientName: "mcp" };
      return;
    }

    const bearer = parseBearerToken(
      typeof req.headers.authorization === "string" ? req.headers.authorization : undefined,
    );

    if (mode === "bearer") {
      try {
        const token = runtime.tokens.authenticate(bearer);
        req.handsAuth = {
          method: "bearer",
          clientId: token.id,
          clientName: token.name,
        };
      } catch (err) {
        const message = err instanceof AuthError ? err.message : "Unauthorized";
        return unauthenticatedReply(reply, cfg, publicBase, message);
      }
      return;
    }

    if (mode === "oauth") {
      if (!bearer) {
        return unauthenticatedReply(reply, cfg, publicBase, "Missing bearer access token");
      }
      if (!publicBase) {
        void reply.code(503).send({ error: "OAuth public base URL not configured" });
        return;
      }
      try {
        req.handsAuth = await validateOAuthAccessToken(
          bearer,
          cfg,
          publicBase,
          state.embeddedOAuth?.publicJwks as import("jose").JSONWebKeySet,
        );
      } catch {
        return unauthenticatedReply(reply, cfg, publicBase, "Invalid or expired access token");
      }
    }
  };
}
