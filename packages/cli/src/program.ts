import { Command } from "commander";
import { APP_VERSION } from "@hands/shared";
import { registerInit } from "./commands/init.js";
import { registerConfig } from "./commands/config.js";
import { registerMode } from "./commands/mode.js";
import { registerReview } from "./commands/review.js";
import { registerWorkspace } from "./commands/workspace.js";
import { registerDaemon } from "./commands/daemon.js";
import { registerTunnel } from "./commands/tunnel.js";
import { registerConnect } from "./commands/connect.js";
import { registerTool } from "./commands/tool.js";
import { registerToken } from "./commands/token.js";
import { registerAuth } from "./commands/auth.js";
import { registerCompletion } from "./commands/completion.js";

export function createProgram(): Command {
  const program = new Command();
  program
    .name("hands")
    .description("Local coding-agent MCP daemon (Hands). Run `hands .` in a project to start.")
    .version(APP_VERSION);

  registerInit(program);
  registerConfig(program);
  registerMode(program);
  registerReview(program);
  registerWorkspace(program);
  registerDaemon(program);
  registerTunnel(program);
  registerConnect(program);
  registerTool(program);
  registerToken(program);
  registerAuth(program);
  registerCompletion(program, createProgram);

  return program;
}
