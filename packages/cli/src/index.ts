#!/usr/bin/env node
import { runDefaultSession, type StartOpts } from "./commands/daemon.js";
import { createProgram } from "./program.js";
import { SUBCOMMANDS } from "./subcommands.js";

function parseDefaultSessionArgs(argv: string[]): { dir: string; opts: StartOpts } | null {
  if (argv.length === 0) {
    return { dir: ".", opts: {} };
  }
  const first = argv[0]!;
  if (first === "-h" || first === "--help" || first === "-V" || first === "--version") {
    return null;
  }
  if (SUBCOMMANDS.has(first)) {
    return null;
  }
  let dir = ".";
  const rest: string[] = [];
  if (first.startsWith("-")) {
    rest.push(...argv);
  } else {
    dir = first === "." ? "." : first;
    rest.push(...argv.slice(1));
  }
  const opts: StartOpts = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--headless") opts.headless = true;
    else if (a === "--no-tunnel") opts.noTunnel = true;
    else if (a === "--tunnel") opts.tunnel = true;
    else if (a === "--tunnel-quick") opts.tunnelQuick = true;
    else if (a === "--open") opts.open = true;
    else if (a === "--mode" && rest[i + 1]) opts.mode = rest[++i];
    else if (a === "--host" && rest[i + 1]) opts.host = rest[++i];
    else if (a === "--port" && rest[i + 1]) opts.port = rest[++i];
    else if (a === "--home" && rest[i + 1]) opts.home = rest[++i];
  }
  return { dir, opts };
}

const argv = process.argv.slice(2);
const defaultSession = parseDefaultSessionArgs(argv);
if (defaultSession) {
  await runDefaultSession(defaultSession.dir, defaultSession.opts);
  process.exit(0);
}

const program = createProgram();
await program.parseAsync(process.argv);
