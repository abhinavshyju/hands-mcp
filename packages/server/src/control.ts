import type { FastifyInstance } from "fastify";
import {
  buildMcpConnect,
  diffCheckpoint,
  listCheckpoints,
  loadGlobalConfig,
  loadProjectConfig,
  redactGlobalConfigForApi,
  restoreCheckpoint,
  saveGlobalConfig,
  saveProjectConfig,
  setModeScoped,
  type McpConnectClient,
} from "@editer/core";
import type { EditerRuntime } from "@editer/core";
import type { ToolRegistry } from "@editer/tools";
import type { PluginLoader } from "@editer/tools";
import fs from "node:fs";
import { unifiedDiff } from "@editer/core";
import { globalConfigSchema, projectConfigSchema, type TunnelMode, type WorkspaceMode } from "@editer/shared";

export function registerControl(
  app: FastifyInstance,
  runtime: EditerRuntime,
  registry: ToolRegistry,
  plugins: PluginLoader,
): void {
  app.get("/api/state", async () => {
    const ws = runtime.workspaces.getActive() ?? null;
    const tunnel = runtime.tunnel.getState();
    const merged = runtime.merged();
    return {
      version: runtime.version(),
      host: runtime.host,
      port: runtime.port,
      mode: merged.mode,
      modeSource: merged.modeSource,
      workspace: ws,
      tunnel,
      clients: 0,
      toolCount: registry.list().length,
      headless: runtime.headless,
      pluginErrors: plugins.errors,
      pendingApprovals: runtime.approvals.listPending().length,
    };
  });

  app.get("/api/workspaces", async () => runtime.workspaces.list());
  app.post("/api/workspaces", async (req) => {
    const body = req.body as { root: string; name?: string };
    return runtime.workspaces.add(body.root, body.name);
  });
  app.delete("/api/workspaces/:id", async (req) => {
    runtime.workspaces.remove((req.params as { id: string }).id);
    return { ok: true };
  });
  app.post("/api/workspaces/:id/activate", async (req) =>
    runtime.workspaces.setActive((req.params as { id: string }).id),
  );
  app.post("/api/workspaces/:id/mode", async (req) => {
    const body = req.body as { mode: WorkspaceMode };
    const id = (req.params as { id: string }).id;
    return runtime.workspaces.setMode(id, body.mode);
  });
  app.post("/api/mode", async (req) => {
    const body = req.body as { mode: WorkspaceMode; scope?: "workspace" | "project"; workspaceId?: string };
    const scope = body.scope ?? "workspace";
    let ws = runtime.workspaces.getActive();
    if (body.workspaceId) {
      ws = runtime.workspaces.list().find((w) => w.id === body.workspaceId || w.name === body.workspaceId) ?? ws;
    }
    if (!ws) throw new Error("No workspace registered");
    if (scope === "project") {
      return setModeScoped(runtime.paths, body.mode, "project", ws);
    }
    return setModeScoped(runtime.paths, body.mode, "workspace", ws);
  });

  app.get("/api/tools", async () =>
    registry.list().map((t) => ({
      name: t.name,
      description: t.description,
      group: t.group,
      mutating: t.mutating,
    })),
  );

  app.get("/api/config", async () => runtime.merged());

  app.get("/api/config/global", async () => redactGlobalConfigForApi(loadGlobalConfig(runtime.paths)));

  app.post("/api/config/global", async (req) => {
    const body = req.body as Record<string, unknown>;
    const cfg = loadGlobalConfig(runtime.paths);
    const merged = { ...cfg, ...body };
    const parsed = globalConfigSchema.parse(merged);
    saveGlobalConfig(runtime.paths, parsed);
    return redactGlobalConfigForApi(parsed);
  });

  app.post("/api/config/tunnel", async (req) => {
    const body = req.body as {
      enabled?: boolean;
      mode?: TunnelMode;
      hostname?: string;
      token?: string;
      exposeUiOverTunnel?: boolean;
    };
    const patch: Parameters<typeof runtime.tunnel.applyConfig>[0] = {};
    if (body.enabled !== undefined) patch.enabled = body.enabled;
    if (body.mode !== undefined) {
      patch.mode = body.mode;
      patch.enabled = body.mode !== "off";
    }
    if (body.hostname !== undefined) patch.hostname = body.hostname.trim() || undefined;
    if (body.token !== undefined) patch.token = body.token.trim() || undefined;
    if (body.exposeUiOverTunnel !== undefined) patch.exposeUiOverTunnel = body.exposeUiOverTunnel;
    await runtime.tunnel.applyConfig(patch);
    if (!runtime.noTunnel) {
      await runtime.tunnel.restart();
    }
    return {
      tunnel: runtime.tunnel.getState(),
      global: redactGlobalConfigForApi(loadGlobalConfig(runtime.paths)).tunnel,
    };
  });

  app.post("/api/tunnel/start", async () => {
    await runtime.tunnel.start();
    return { tunnel: runtime.tunnel.getState() };
  });

  app.post("/api/tunnel/stop", async () => {
    await runtime.tunnel.stop();
    return { tunnel: runtime.tunnel.getState() };
  });

  app.post("/api/tunnel/restart", async () => {
    await runtime.tunnel.restart();
    return { tunnel: runtime.tunnel.getState() };
  });

  app.post("/api/tunnel/quick", async () => {
    await runtime.tunnel.applyConfig({ mode: "quick", enabled: true });
    await runtime.tunnel.restart();
    return { tunnel: runtime.tunnel.getState() };
  });

  app.get("/api/tunnel/health", async () => {
    const st = runtime.tunnel.getState();
    const host = st.quickUrl?.replace(/^https:\/\//, "") ?? st.hostname;
    if (!host) return { ok: false, reason: "no hostname" };
    const ok = await runtime.tunnel.verifyPublicHealth(host);
    return { ok };
  });

  app.get("/api/mcp/connect", async (req, reply) => {
    const q = req.query as { client?: string };
    const client = (q.client ?? "cursor") as McpConnectClient;
    if (client !== "claude" && client !== "cursor" && client !== "generic") {
      return reply.code(400).send({ error: "client must be claude, cursor, or generic" });
    }
    try {
      return buildMcpConnect(runtime, client);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });
  app.post("/api/config/project", async (req) => {
    const body = req.body as Record<string, unknown>;
    const ws = runtime.workspace();
    const next = projectConfigSchema.parse({ ...loadProjectConfig(ws.root), ...body });
    saveProjectConfig(ws.root, next);
    return runtime.merged();
  });

  app.get("/api/checkpoints", async () => {
    const ws = runtime.workspaces.getActive();
    if (!ws) return [];
    return listCheckpoints(ws.root);
  });
  app.get("/api/checkpoints/:id/diff", async (req) => {
    const ws = runtime.workspaces.getActive();
    if (!ws) return { diff: "" };
    return { diff: diffCheckpoint(ws.root, (req.params as { id: string }).id) };
  });
  app.post("/api/checkpoints/:id/restore", async (req) => {
    const ws = runtime.workspaces.getActive();
    if (!ws) throw new Error("No workspace registered");
    const body = (req.body as { files?: string[] }) ?? {};
    return restoreCheckpoint(ws.root, (req.params as { id: string }).id, body.files);
  });

  app.get("/api/processes", async () => runtime.processes.list());
  app.get("/api/browser/sessions", async () => runtime.browser.list());
  app.post("/api/browser/sessions/:name/close", async (req) => {
    const name = (req.params as { name: string }).name;
    await runtime.browser.close(name);
    return { closed: name };
  });
  app.get("/api/media", async (req, reply) => {
    const q = req.query as { path?: string };
    if (!q.path) return reply.code(400).send({ error: "path required" });
    const abs = runtime.resolve(q.path, "read");
    if (!fs.existsSync(abs)) return reply.code(404).send({ error: "not found" });
    const ext = q.path.split(".").pop()?.toLowerCase();
    const types: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
    };
    const buf = fs.readFileSync(abs);
    return reply.type(types[ext ?? ""] ?? "application/octet-stream").send(buf);
  });
  app.post("/api/processes/:id/stop", async (req) =>
    runtime.processes.stop((req.params as { id: string }).id),
  );

  app.get("/api/audit", async (req) => {
    const q = req.query as { limit?: string; tool?: string };
    return runtime.audit.query({
      limit: q.limit ? Number(q.limit) : 200,
      tool: q.tool,
    });
  });

  app.get("/api/approvals", async () => runtime.approvals.listPending());
  app.post("/api/approvals/decide-all", async (req) => {
    const body = req.body as { approved: boolean; reason?: string };
    const count = runtime.approvals.decideAll(body.approved, body.reason);
    return { count };
  });
  app.post("/api/approvals/:id", async (req) => {
    const body = req.body as { approved: boolean; reason?: string };
    return runtime.approvals.decide((req.params as { id: string }).id, body.approved, body.reason);
  });

  app.get("/api/tree", async (req) => {
    const ws = runtime.workspaces.getActive();
    if (!ws) return { path: ".", entries: [] as Array<{ name: string; isDirectory: boolean }> };
    const q = req.query as { path?: string };
    const rel = q.path ?? ".";
    const abs = runtime.resolve(rel, "read");
    const entries = fs.readdirSync(abs, { withFileTypes: true }).map((e) => ({
      name: e.name,
      isDirectory: e.isDirectory(),
    }));
    return { path: rel, entries };
  });

  app.get("/api/file", async (req) => {
    const q = req.query as { path: string };
    const abs = runtime.resolve(q.path, "read");
    return { path: q.path, contents: fs.readFileSync(abs, "utf8") };
  });

  app.get("/api/diff/event/:id", async (req) => {
    const id = (req.params as { id: string }).id;
    const events = runtime.audit.query({ limit: 500 });
    const ev = events.find((e) => e.id === id);
    if (!ev) return { diff: "" };
    const result = ev.result as { diff?: string } | undefined;
    if (result?.diff) return { diff: result.diff };
    return { diff: unifiedDiff("file", "", JSON.stringify(ev.result ?? "", null, 2)) };
  });

  app.get("/api/events/replay", async () => runtime.events.getReplay());

  app.get("/ws", { websocket: true }, (socket) => {
    const replay = runtime.events.getReplay();
    socket.send(JSON.stringify({ type: "replay", ts: Date.now(), payload: replay }));
    const unsub = runtime.events.subscribe((ev) => {
      try {
        socket.send(JSON.stringify(ev));
      } catch {
        // closed
      }
    });
    socket.on("close", unsub);
  });
}
