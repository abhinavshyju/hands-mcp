import type { Command } from "commander";
import { buildMcpConnect, type McpConnectClient } from "@editer/core";
import { runtimeFromOpts } from "../runtime-opts.js";

export function registerConnect(program: Command): void {
  program
    .command("connect")
    .description("Print MCP connector config for a client")
    .option("--client <name>", "claude|cursor|generic", "generic")
    .option("--home <dir>")
    .action((opts: { client?: string; home?: string }) => {
      const rt = runtimeFromOpts(opts);
      const client = (opts.client ?? "generic") as McpConnectClient;
      try {
        const out = buildMcpConnect(rt, client);
        if (client === "claude") {
          console.log("Paste into Claude Desktop mcp config:\n");
        } else if (client === "cursor") {
          console.log("Cursor MCP config:\n");
        }
        console.log(out.pasteText);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  program
    .command("stdio")
    .description("Serve MCP over stdio for same-machine clients")
    .option("--home <dir>")
    .option("--mode <mode>")
    .action(async (opts: { home?: string; mode?: string }) => {
      const rt = runtimeFromOpts(opts);
      const { serveStdio } = await import("@editer/server");
      const { ToolRegistry, registerBuiltins } = await import("@editer/tools");
      const registry = new ToolRegistry();
      registerBuiltins(registry);
      await serveStdio(rt, registry);
    });
}
