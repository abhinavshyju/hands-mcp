# editer-mcp

Bundled as a git submodule of **MCP IDE** (`/home/abhinav/mcp-ide`). The daemon is the hands; MCP IDE is a Code-OSS workbench that supervises it. Headless `editer start` still works without the IDE.

A local coding-agent **MCP** daemon. Any MCP-capable chat client connects (optionally through a Cloudflare named tunnel) and gets Cursor-style tools — read, search, edit, run, git, background processes — executed on this machine. The chatbot is the brain; editer is the hands. There is no LLM inside the daemon.

Ships with a browser **observe-and-approve** editor UI (file tree, Monaco, diffs, approvals, audit log, terminal, checkpoints) and a **headless** mode.

## Five-minute quickstart

Install once from this repo (puts `editer` on your PATH so it works in any folder, including ones without a `package.json`):

```bash
cd /path/to/editer-mcp
pnpm install
pnpm run install:global
```

Then from **any** directory:

```bash
editer init
editer workspace add .
editer start --no-tunnel
```

If the shell says `command not found`, add `~/.local/bin` to PATH:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Inside this repo you can still run `pnpm editer -- …`, but that only works where this package.json exists. Use the installed `editer` binary everywhere else.

Open `http://127.0.0.1:4877` for the UI.

Print connector config:

```bash
pnpm editer -- connect --client claude
```

For a stable public URL:

```bash
pnpm editer -- tunnel setup
pnpm editer -- start
```

See [docs/TUNNEL.md](docs/TUNNEL.md), [docs/CONNECTORS.md](docs/CONNECTORS.md), [docs/TOOLS.md](docs/TOOLS.md), [docs/SAFETY.md](docs/SAFETY.md), [docs/PLUGINS.md](docs/PLUGINS.md).

## Layout

```
packages/shared   zod schemas
packages/core     jail, edits, checkpoints, search, processes, approvals
packages/tools    MCP tool implementations + plugin loader
packages/server   Fastify + MCP Streamable HTTP + control API
packages/cli      `editer` binary
apps/ui           React SPA
```

## Development

```bash
pnpm check    # lint, typecheck, test
pnpm test
```
