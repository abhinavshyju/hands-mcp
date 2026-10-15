import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  isInitializeRequest,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  APP_NAME,
  APP_VERSION,
  CODING_STANDARDS_RESOURCE_URI,
  mergeWorkspaceGuidance,
} from "@hands/shared";
import type { HandsRuntime } from "@hands/core";
import { getAuthContext } from "@hands/core";
import { globSearch } from "@hands/core";
import { splitToolResult, type ToolRegistry } from "@hands/tools";
import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import { randomUUID } from "node:crypto";

export interface CreatedMcpServer {
  server: Server;
  dispose: () => void;
}

export function createMcpServer(runtime: HandsRuntime, registry: ToolRegistry): CreatedMcpServer {
  const server = new Server(
    { name: APP_NAME, version: APP_VERSION },
    {
      capabilities: {
        tools: { listChanged: true },
        prompts: {},
        resources: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: registry.list().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.schema, { $refStrategy: "none" }) as Record<string, unknown>,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    try {
      const auth = getAuthContext();
      const result = await runtime.locks.withFileLock("global-tool", async () =>
        registry.invoke(
          req.params.name,
          {
            runtime,
            clientId: auth?.clientId,
            clientName: auth?.clientName ?? "mcp",
            sampling: {
              available: () => Boolean(server.getClientCapabilities()?.sampling),
              createMessage: async (prompt: string) => {
                if (!server.getClientCapabilities()?.sampling) {
                  throw new Error("this client does not advertise sampling capability");
                }
                const sampled = await server.createMessage({
                  messages: [{ role: "user", content: { type: "text", text: prompt } }],
                  maxTokens: 4096,
                });
                return { content: sampled.content };
              },
            },
          },
          req.params.arguments ?? {},
        ),
      );
      const { summary, images } = splitToolResult(result);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(summary, null, 2) },
          ...images.map((img: { mimeType: string; data: string }) => ({
            type: "image" as const,
            data: img.data,
            mimeType: img.mimeType,
          })),
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text", text: message }],
      };
    }
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      {
        name: "build_feature",
        description: "Orient in this repo and implement a feature.",
        arguments: [{ name: "request", description: "What to build", required: true }],
      },
      {
        name: "fix_bug",
        description: "Investigate and fix a bug in the active workspace.",
        arguments: [{ name: "symptom", description: "What is going wrong", required: true }],
      },
    ],
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (req) => {
    const overview = await registry.invoke(
      "get_project_overview",
      { runtime, clientName: "prompt" },
      {},
    );
    const extra =
      req.params.name === "fix_bug"
        ? String((req.params.arguments as { symptom?: string } | undefined)?.symptom ?? "")
        : String((req.params.arguments as { request?: string } | undefined)?.request ?? "");
    const { text: guidance } = mergeWorkspaceGuidance(runtime.workspace().root);
    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `You are connected to Hands (hands-mcp) on a local machine. Use the tools to inspect and edit the workspace.

Before editing: follow the coding standards below (or call get_coding_guidance / read ${CODING_STANDARDS_RESOURCE_URI}). Prefer the smallest correct change; match existing style; avoid speculative abstractions.

Coding standards:
${guidance}

Project overview:
${JSON.stringify(overview, null, 2)}

Task: ${extra}`,
          },
        },
      ],
    };
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const guidanceResource = {
      uri: CODING_STANDARDS_RESOURCE_URI,
      name: "coding-standards",
      description: "Modular edit standards and anti-slop guidance for this workspace",
      mimeType: "text/plain",
    };
    try {
      const files = globSearch(runtime.workspace().root, "**/*", 100);
      return {
        resources: [
          guidanceResource,
          ...files.map((f) => ({
            uri: `hands://workspace/${f}`,
            name: f,
            mimeType: "text/plain",
          })),
        ],
      };
    } catch {
      return { resources: [guidanceResource] };
    }
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const uri = req.params.uri;
    if (uri === CODING_STANDARDS_RESOURCE_URI) {
      const { text } = mergeWorkspaceGuidance(runtime.workspace().root);
      return {
        contents: [{ uri, mimeType: "text/plain", text: text.slice(0, 100_000) }],
      };
    }
    const rel = uri.replace(/^hands:\/\/workspace\//, "");
    const abs = runtime.resolve(rel, "read");
    const text = fs.readFileSync(abs, "utf8");
    return {
      contents: [{ uri, mimeType: "text/plain", text: text.slice(0, 100_000) }],
    };
  });

  const dispose = registry.onChange(() => {
    void server.sendToolListChanged();
  });

  return { server, dispose };
}

export async function serveStdio(runtime: HandsRuntime, registry: ToolRegistry): Promise<void> {
  const { server } = createMcpServer(runtime, registry);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export interface McpHttpSession {
  transport: StreamableHTTPServerTransport;
  server: Server;
  dispose: () => void;
}

function sendJsonRpcError(
  res: ServerResponse,
  status: number,
  code: number,
  message: string,
): void {
  if (res.headersSent) return;
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }));
}

export async function handleMcpHttp(
  createServer: () => CreatedMcpServer,
  sessions: Map<string, McpHttpSession>,
  req: IncomingMessage,
  res: ServerResponse,
  parsedBody?: unknown,
): Promise<void> {
  const sessionId = (req.headers["mcp-session-id"] as string | undefined) ?? undefined;

  try {
    const existing = sessionId ? sessions.get(sessionId) : undefined;
    if (existing) {
      await existing.transport.handleRequest(req, res, parsedBody);
      return;
    }

    if (sessionId) {
      sendJsonRpcError(res, 404, -32001, "Session not found");
      return;
    }

    if (!isInitializeRequest(parsedBody)) {
      sendJsonRpcError(res, 400, -32000, "Bad Request: No valid session ID provided");
      return;
    }

    const created = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        sessions.set(sid, {
          transport,
          server: created.server,
          dispose: created.dispose,
        });
      },
    });

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (!sid) return;
      const session = sessions.get(sid);
      if (!session) return;
      sessions.delete(sid);
      session.dispose();
      void session.server.close();
    };

    await created.server.connect(transport);
    await transport.handleRequest(req, res, parsedBody);
  } catch (err) {
    if (!res.headersSent) {
      sendJsonRpcError(res, 500, -32603, "Internal server error");
    }
    console.error("MCP HTTP request failed:", err);
  }
}
