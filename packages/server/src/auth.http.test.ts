import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { HandsRuntime, loadGlobalConfig, saveGlobalConfig } from "@hands/core";
import { startServer, type StartedServer } from "./server.js";

describe("HTTP auth modes", () => {
  let started: StartedServer | undefined;

  afterAll(async () => {
    if (started) await started.close();
  });

  it("bearer mode rejects missing token on /api/state", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "editer-auth-http-"));
    const rt = new HandsRuntime({
      home,
      headless: true,
      noTunnel: true,
      host: "127.0.0.1",
      port: 0,
    });
    rt.tokens.create("test");
    const cfg = loadGlobalConfig(rt.paths);
    cfg.auth.mode = "bearer";
    cfg.auth.loopbackBypass = false;
    saveGlobalConfig(rt.paths, cfg);

    started = await startServer(rt);
    const res = await fetch(`${started.url}/api/state`);
    expect(res.status).toBe(401);
  });

  it("bearer mode accepts valid token", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "editer-auth-http2-"));
    const rt = new HandsRuntime({
      home,
      headless: true,
      noTunnel: true,
      host: "127.0.0.1",
      port: 0,
    });
    const t = rt.tokens.create("ci");
    const cfg = loadGlobalConfig(rt.paths);
    cfg.auth.mode = "bearer";
    saveGlobalConfig(rt.paths, cfg);

    started = await startServer(rt);
    const res = await fetch(`${started.url}/api/state`, {
      headers: { Authorization: `Bearer ${t.token}` },
    });
    expect(res.status).toBe(200);
  });

  it("oauth mode exposes protected resource metadata when public base is set", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "editer-auth-oauth-"));
    const rt = new HandsRuntime({
      home,
      headless: true,
      noTunnel: true,
      host: "127.0.0.1",
      port: 0,
    });
    const cfg = loadGlobalConfig(rt.paths);
    cfg.auth.mode = "oauth";
    cfg.auth.oauth.publicBaseUrl = "http://127.0.0.1:9999";
    saveGlobalConfig(rt.paths, cfg);

    started = await startServer(rt);
    const res = await fetch(`${started.url}/.well-known/oauth-protected-resource/mcp`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { authorization_servers?: string[] };
    expect(body.authorization_servers?.[0]).toContain("/oauth");
  });
});
