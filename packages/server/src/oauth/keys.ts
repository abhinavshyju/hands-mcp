import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { exportJWK, generateKeyPair, type JWK } from "jose";
import type { HandsPaths } from "@hands/core";

export interface OAuthKeyMaterial {
  dir: string;
  privateJwk: JWK;
  publicJwks: { keys: JWK[] };
}

function oauthDir(paths: HandsPaths): string {
  return path.join(paths.home, "oauth");
}

export async function loadOrCreateOAuthKeys(paths: HandsPaths): Promise<OAuthKeyMaterial> {
  const dir = oauthDir(paths);
  const privPath = path.join(dir, "private.jwk.json");
  const pubPath = path.join(dir, "jwks.json");

  if (fs.existsSync(privPath) && fs.existsSync(pubPath)) {
    const privateJwk = JSON.parse(fs.readFileSync(privPath, "utf8")) as JWK;
    const publicJwks = JSON.parse(fs.readFileSync(pubPath, "utf8")) as { keys: JWK[] };
    return { dir, privateJwk, publicJwks };
  }

  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const { privateKey, publicKey } = await generateKeyPair("RS256", {
    modulusLength: 2048,
    extractable: true,
  });
  const privateJwk = await exportJWK(privateKey);
  privateJwk.alg = "RS256";
  privateJwk.kid = "hands-oauth-1";
  const publicJwk = await exportJWK(publicKey);
  publicJwk.alg = "RS256";
  publicJwk.kid = "hands-oauth-1";
  const publicJwks = { keys: [publicJwk] };

  fs.writeFileSync(privPath, `${JSON.stringify(privateJwk, null, 2)}\n`, { mode: 0o600 });
  fs.writeFileSync(pubPath, `${JSON.stringify(publicJwks, null, 2)}\n`, { mode: 0o644 });

  return { dir, privateJwk, publicJwks };
}

export function loadRegisteredClients(paths: HandsPaths): Array<Record<string, unknown>> {
  const file = path.join(oauthDir(paths), "clients.json");
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Array<Record<string, unknown>>;
  } catch {
    return [];
  }
}

export function loadOrCreateCookieKeys(paths: HandsPaths): string[] {
  const dir = oauthDir(paths);
  const file = path.join(dir, "cookie-keys.json");
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, "utf8")) as string[];
  }
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const keys = [crypto.randomBytes(32).toString("hex")];
  fs.writeFileSync(file, `${JSON.stringify(keys)}\n`, { mode: 0o600 });
  return keys;
}

export function appendRegisteredClient(paths: HandsPaths, client: Record<string, unknown>): void {
  const dir = oauthDir(paths);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, "clients.json");
  const list = loadRegisteredClients(paths);
  list.push(client);
  fs.writeFileSync(file, `${JSON.stringify(list, null, 2)}\n`, { mode: 0o600 });
}
