import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { HandsRuntime } from "@hands/core";
import { startServer, type StartedServer } from "./server.js";

describe("MCP streamable HTTP", () => {
  let started: StartedServer | undefined;

  afterAll(async () => {
    if (started) await started.close();
  });

  it("POST /mcp initialize returns JSON and mcp-session-id", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "editer-mcp-http-"));
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "editer-mcp-ws-"));
    const runtime = new HandsRuntime({
      home,
      headless: true,
      noTunnel: true,
      host: "127.0.0.1",
      port: 0,
    });
    runtime.workspaces.add(root, "mcp-http");
    started = await startServer(runtime);

    const res = await fetch(`${started.url}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "0.0.0" },
        },
        id: 1,
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("mcp-session-id")).toBeTruthy();
    const contentType = res.headers.get("content-type") ?? "";
    expect(contentType.includes("application/json")).toBe(true);
    const body = (await res.json()) as { jsonrpc: string; result?: unknown };
    expect(body.jsonrpc).toBe("2.0");
    expect(body.result).toBeDefined();
  });
});
