import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import staticPlugin from "@fastify/static";
import type { EditerRuntime } from "@editer/core";
import { PluginLoader, ToolRegistry, registerBuiltins } from "@editer/tools";
import { registerAuth } from "./auth.js";
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
  runtime: EditerRuntime;
  registry: ToolRegistry;
  plugins: PluginLoader;
  close: () => Promise<void>;
  url: string;
}

export async function startServer(runtime: EditerRuntime): Promise<StartedServer> {
  const registry = new ToolRegistry();
  registerBuiltins(registry);
  const plugins = new PluginLoader(runtime, registry);
  await plugins.loadAll();
  plugins.watch();

  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  await app.register(websocket);
  await app.register(rateLimit, {
    max: runtime.merged().global.rateLimitMax,
    timeWindow: runtime.merged().global.rateLimitWindowMs,
    keyGenerator: (req) => req.ip,
  });

  app.get("/healthz", async () => ({ ok: true, version: runtime.version() }));

  app.addHook("preHandler", registerAuth(runtime));

  const sessions = new Map<string, McpHttpSession>();

  app.all("/mcp", async (req, reply) => {
    reply.hijack();
    await handleMcpHttp(
      () => createMcpServer(runtime, registry),
      sessions,
      req.raw,
      reply.raw,
      req.body,
    );
  });

  registerControl(app, runtime, registry, plugins);

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
  };

  if (!process.env.VITEST) {
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
