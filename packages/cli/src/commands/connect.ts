import type { Command } from "commander";
import { buildMcpConnect, type McpConnectClient } from "@hands/core";
import { runtimeFromOpts } from "../runtime-opts.js";
import { info, writeErr, writeln } from "../ui/render.js";

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
          info("Paste into Claude Desktop mcp config:\n");
        } else if (client === "cursor") {
          info("Cursor MCP config:\n");
        }
        writeln(out.pasteText);
      } catch (err) {
        writeErr(err instanceof Error ? err.message : String(err));
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
      const { serveStdio } = await import("@hands/server");
      const { ToolRegistry, registerBuiltins } = await import("@hands/tools");
      const registry = new ToolRegistry();
      registerBuiltins(registry);
      await serveStdio(rt, registry);
    });
}
