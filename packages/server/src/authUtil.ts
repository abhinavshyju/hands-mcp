import type { FastifyRequest } from "fastify";

export function isLoopbackIp(ip: string | undefined): boolean {
  if (!ip) return false;
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

export function requestPath(req: FastifyRequest): string {
  const raw = req.url.split("?")[0] ?? req.url;
  return raw;
}

export function isProtectedApiPath(pathname: string): boolean {
  return pathname.startsWith("/mcp") || pathname.startsWith("/api") || pathname === "/ws";
}

export function isHealthPath(pathname: string): boolean {
  return pathname === "/healthz";
}

export function parseBearerToken(authorization: string | undefined): string | undefined {
  if (!authorization) return undefined;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(authorization);
  return m?.[1];
}

export function rateLimitKeyFromRequest(req: FastifyRequest): string {
  const auth = req.headers.authorization;
  const token = parseBearerToken(typeof auth === "string" ? auth : undefined);
  if (token) {
    return `bearer:${token.slice(0, 16)}`;
  }
  const handsAuth = (
    req as FastifyRequest & { handsAuth?: { clientId?: string; subject?: string } }
  ).handsAuth;
  if (handsAuth?.subject) return `oauth:${handsAuth.subject}`;
  if (handsAuth?.clientId) return `oauth:${handsAuth.clientId}`;
  return req.ip;
}
