import { randomBytes, timingSafeEqual } from "node:crypto";
import { type ClientToken, AuthError } from "@editer/shared";
import { loadGlobalConfig, saveGlobalConfig } from "./config.js";
import type { EditerPaths } from "./paths.js";

export class TokenStore {
  constructor(private readonly paths: EditerPaths) {}

  list(): ClientToken[] {
    return loadGlobalConfig(this.paths).tokens.filter((t) => !t.revokedAt);
  }

  create(name: string): ClientToken {
    const token: ClientToken = {
      id: randomBytes(8).toString("hex"),
      name,
      token: randomBytes(32).toString("hex"),
      createdAt: Date.now(),
    };
    const cfg = loadGlobalConfig(this.paths);
    cfg.tokens.push(token);
    saveGlobalConfig(this.paths, cfg);
    return token;
  }

  revoke(idOrName: string): void {
    const cfg = loadGlobalConfig(this.paths);
    const rec = cfg.tokens.find((t) => t.id === idOrName || t.name === idOrName);
    if (!rec) throw new Error(`Token not found: ${idOrName}`);
    rec.revokedAt = Date.now();
    saveGlobalConfig(this.paths, cfg);
  }

  authenticate(presented: string | undefined): ClientToken {
    if (!presented) throw new AuthError("Missing bearer token");
    const cfg = loadGlobalConfig(this.paths);
    const active = cfg.tokens.filter((t) => !t.revokedAt);
    for (const t of active) {
      const a = Buffer.from(t.token);
      const b = Buffer.from(presented);
      if (a.length === b.length && timingSafeEqual(a, b)) return t;
    }
    throw new AuthError("Invalid bearer token");
  }
}
