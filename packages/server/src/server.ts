import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import staticPlugin from "@fastify/static";
import type { HandsRuntime } from "@hands/core";
import { PluginLoader, ToolRegistry, registerBuiltins } from "@hands/tools";
import { registerAuth, type AuthRuntimeState } from "./auth.js";
import { rateLimitKeyFromRequest, isLoopbackIp } from "./authUtil.js";
import { authStartupWarnings } from "@hands/core";
import { loadGlobalConfig } from "@hands/core";
import { runWithAuthContextAsync, defaultAuthContext } from "@hands/core";
import { registerProtectedResourceMetadata } from "./oauth/prm.js";
import { createEmbeddedOAuthProvider } from "./oauth/provider.js";
import { registerControl } from "./control.js";
import { createMcpServer, handleMcpHttp, type McpHttpSession } from "./mcp.js";

const here = path.dirname(fileURLToPath(import.meta.url));

function findUiDist(): string | undefined {
  const candidates = [
    path.resolve(process.cwd(), "apps/ui/dist"),
    path.resolve(here, "../../../apps/ui/dist"),
    path.resolve(here, "../ui"),
    path.resolve(here, "../../ui/dist"),
  ];
  return candidates.find((c) => fs.existsSync(path.join(c, "index.html")));
}

export interface StartedServer {
  runtime: HandsRuntime;
  registry: ToolRegistry;
  plugins: PluginLoader;
  close: () => Promise<void>;
  url: string;
}

export async function startServer(runtime: HandsRuntime): Promise<StartedServer> {
  const registry = new ToolRegistry();
  registerBuiltins(registry);
  const plugins = new PluginLoader(runtime, registry);
  await plugins.loadAll();
  plugins.watch();

  const httpLog = process.env.EDITER_HTTP_LOG === "1";
  const app = Fastify({
    logger: httpLog ? { level: process.env.EDITER_HTTP_LOG_LEVEL ?? "info" } : false,
    trustProxy: true,
  });

  await app.register(websocket);
  await app.register(rateLimit, {
    max: runtime.merged().global.rateLimitMax,
    timeWindow: runtime.merged().global.rateLimitWindowMs,
    keyGenerator: (req) => rateLimitKeyFromRequest(req),
    allowList: (req) => isLoopbackIp(req.ip),
  });

  app.get("/healthz", async () => ({ ok: true, version: runtime.version() }));

  const authState: AuthRuntimeState = {};
  authState.embeddedOAuth = (await createEmbeddedOAuthProvider(runtime)) ?? undefined;
  if (authState.embeddedOAuth) {
    authState.embeddedOAuth.registerRoutes(app);
  }
  registerProtectedResourceMetadata(app, runtime);

  for (const line of authStartupWarnings(loadGlobalConfig(runtime.paths))) {
    console.warn(`[hands] ${line}`);
  }

  app.addHook("preHandler", registerAuth(runtime, authState));

  const sessions = new Map<string, McpHttpSession>();

  app.all("/mcp", async (req, reply) => {
    const ctx = req.handsAuth ?? defaultAuthContext("none", "mcp");
    reply.hijack();
    await runWithAuthContextAsync(ctx, async () =>
      handleMcpHttp(
        () => createMcpServer(runtime, registry),
        sessions,
        req.raw,
        reply.raw,
        req.body,
      ),
    );
  });

  registerControl(app, runtime, registry, plugins);

  const shutdownState: { close?: () => Promise<void> } = {};

  app.post("/api/shutdown", async (_req, reply) => {
    reply.send({ ok: true });
    setImmediate(() => {
      void shutdownState.close?.().then(() => process.exit(0));
    });
  });

  const uiDist = runtime.headless ? undefined : findUiDist();
  if (uiDist) {
    await app.register(staticPlugin, { root: uiDist, prefix: "/", wildcard: false });
    app.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith("/api") || req.url.startsWith("/mcp") || req.url.startsWith("/ws")) {
        return reply.code(404).send({ error: "not found" });
      }
      return reply.sendFile("index.html");
    });
  }

  const host = runtime.host;
  const port = runtime.port;
  await app.listen({ host, port });
  const addr = app.server.address();
  const actualPort = typeof addr === "object" && addr ? addr.port : port;
  runtime.port = actualPort;

  const close = async () => {
    plugins.close();
    await runtime.processes.stopAll();
    await runtime.browser.stopAll();
    await runtime.tunnel.stop();
    await app.close();
    if (fs.existsSync(runtime.paths.pidFile)) {
      try {
        fs.unlinkSync(runtime.paths.pidFile);
      } catch {
        // ignore
      }
    }
  };
  shutdownState.close = close;

  if (!process.env.VITEST && !process.env.EDITER_CLI_OWNS_SHUTDOWN) {
    const shutdown = () => {
      void close().then(() => process.exit(0));
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  }

  if (!runtime.noTunnel) {
    await runtime.tunnel.start();
  }

  return {
    runtime,
    registry,
    plugins,
    close,
    url: `http://${host}:${actualPort}`,
  };
}
