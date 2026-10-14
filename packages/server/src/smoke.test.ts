import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { EditerRuntime } from "@editer/core";
import { startServer, type StartedServer } from "./server.js";

describe("e2e mcp smoke", () => {
  let started: StartedServer;
  let home: string;
  let root: string;
  it("connects, orients, edits, runs, restores", async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "editer-e2e-home-"));
    root = fs.mkdtempSync(path.join(os.tmpdir(), "editer-e2e-ws-"));
    const runtime = new EditerRuntime({
      home,
      headless: true,
      noTunnel: true,
      host: "127.0.0.1",
      port: 0,
    });
    runtime.workspaces.add(root, "smoke");
    runtime.approvals.addSurface((req) => {
      runtime.approvals.decide(req.id, true, "ci-auto");
    });
    started = await startServer(runtime);
    const health = await fetch(`${started.url}/healthz`);
    expect(health.status).toBe(200);

    const client = new Client({ name: "ci", version: "0.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(`${started.url}/mcp`));
    await client.connect(transport);

    const tools = await client.listTools();
    expect(tools.tools.some((x) => x.name === "get_project_overview")).toBe(true);

    await client.callTool({ name: "get_project_overview", arguments: {} });
    await client.callTool({
      name: "write_file",
      arguments: { path: "hello.js", contents: "console.log(1);\n" },
    });
    expect(fs.readFileSync(path.join(root, "hello.js"), "utf8")).toContain("console.log(1)");

    await client.callTool({
      name: "str_replace",
      arguments: { path: "hello.js", old_string: "console.log(1);", new_string: "console.log(2);" },
    });

    const run = await client.callTool({
      name: "run_command",
      arguments: { command: "node hello.js" },
    });
    expect(JSON.stringify(run)).toContain("2");

    await client.callTool({
      name: "str_replace",
      arguments: { path: "hello.js", old_string: "console.log(2);", new_string: "BROKEN" },
    });
    const cps = await client.callTool({ name: "list_checkpoints", arguments: {} });
    const text = (cps.content as Array<{ text?: string }>)[0]?.text ?? "[]";
    const list = JSON.parse(text) as Array<{ id: string }>;
    expect(list.length).toBeGreaterThan(0);
    await client.callTool({
      name: "restore_checkpoint",
      arguments: { id: list[0]!.id },
    });

    await client.close();
  }, 60_000);

  afterAll(async () => {
    if (started) await started.close();
  });
});
