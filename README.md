# editer-mcp

[![CI](https://github.com/abhinavshyju/editer-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/abhinavshyju/editer-mcp/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-10.19-F69220?logo=pnpm&logoColor=white)

**`editer`** is an MCP CLI and local daemon that gives **ChatGPT, Claude, Cursor, Cloud Code**, and any **MCP-capable chat** real tools on your machine: read, search, edit, run commands, git, browser automation, and human-in-the-loop approvals.

The chat app is the brain. **editer** is the hands. There is no LLM inside the daemon—it exposes [Model Context Protocol](https://modelcontextprotocol.io/) over HTTP at `/mcp`.

## Works with

- **ChatGPT** — remote MCP / connector settings (URL + bearer token)
- **Claude** — Desktop and apps with MCP support
- **Cursor** — MCP server config
- **Cloud Code chat** — custom MCP URL + bearer in your product’s MCP settings
- **Any MCP client** — `editer connect --client generic`

Step-by-step for each client: [docs/CONNECTORS.md](docs/CONNECTORS.md).

## How it works

```mermaid
flowchart LR
  subgraph chats [AI_chats]
    ChatGPT[ChatGPT]
    Claude[Claude]
    Cursor[Cursor]
    Other[Any_MCP_client]
  end
  subgraph editer [editer_on_your_machine]
    MCP["HTTP /mcp"]
    UI["Approval UI :4877"]
    Tools[Host_tools]
  end
  Tunnel[Cloudflare_tunnel_optional]
  chats -->|Bearer_token| Tunnel
  Tunnel --> MCP
  chats -->|localhost| MCP
  MCP --> Tools
  UI --> Tools
```

## Requirements

- **Node.js** 20+
- **pnpm** 10.x
- Optional: [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) for public URLs ([docs/TUNNEL.md](docs/TUNNEL.md))
- Optional: Chromium for browser tools (`npx playwright install chromium`)

## Install

```bash
git clone https://github.com/abhinavshyju/editer-mcp.git
cd editer-mcp
pnpm install
pnpm run install:global
```

Add `~/.local/bin` to your PATH if needed:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

## Run

From any project directory:

```bash
editer .
```

This creates `~/.editer`, writes `.editer/config.json` in the project if missing, registers the workspace, starts the MCP server, and opens the interactive approval console.

Open the **observe-and-approve** UI at [http://127.0.0.1:4877](http://127.0.0.1:4877) (file tree, Monaco, diffs, audit log, terminal, checkpoints).

Headless or step-by-step:

```bash
editer init
editer workspace add .
editer start --no-tunnel
editer review    # approvals in another terminal
```

Inside this repo you can use `pnpm editer -- …`; elsewhere use the global `editer` binary.

## Connect your chat (~60 seconds)

1. **Start the daemon** (if not already running):

   ```bash
   editer .
   ```

2. **Create an API token** (first time):

   ```bash
   editer token new my-laptop
   ```

   Save the printed token.

3. **Print the MCP URL**:

   ```bash
   editer connect --client generic
   # or: editer connect --client claude
   # or: editer connect --client cursor
   ```

4. In your chat product’s **MCP / Connectors** settings, add:
   - **URL:** `http://127.0.0.1:4877/mcp` (or your tunneled `https://…/mcp`)
   - **Header:** `Authorization: Bearer YOUR_TOKEN`

For a temporary public URL (no Cloudflare account):

```bash
editer tunnel quick
# or: editer . --tunnel-quick
```

Full recipes: [docs/CONNECTORS.md](docs/CONNECTORS.md). Stable hostname: [docs/TUNNEL.md](docs/TUNNEL.md).

## Why editer

- **Safety modes** — `readonly`, `review` (approve edits/shell), `auto` (still jailed and denylisted)
- **Path jail** — workspace-only paths; blocks secrets and sensitive dotfiles
- **Shadow-git checkpoints** — restore file snapshots without touching your repo `HEAD`
- **Rich tools** — read/search/edit, processes, git, quality helpers, Playwright browser tools
- **Custom plugins** — drop tools in `~/.editer/tools/` ([docs/PLUGINS.md](docs/PLUGINS.md))

Details: [docs/SAFETY.md](docs/SAFETY.md), [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md).

## Tools

See [docs/TOOLS.md](docs/TOOLS.md) for the full tool reference.

## Documentation

| Doc | Topic |
| --- | --- |
| [docs/CLI.md](docs/CLI.md) | All `editer` commands |
| [docs/CONNECTORS.md](docs/CONNECTORS.md) | ChatGPT, Claude, Cursor, Cloud Code, generic MCP |
| [docs/TUNNEL.md](docs/TUNNEL.md) | Cloudflare quick, token, and named tunnels |
| [docs/TOOLS.md](docs/TOOLS.md) | MCP tool catalog |
| [docs/SAFETY.md](docs/SAFETY.md) | Modes, jail, approvals, checkpoints |
| [docs/PLUGINS.md](docs/PLUGINS.md) | Custom tools |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues |
| [docs/GITHUB.md](docs/GITHUB.md) | Default branch and repo settings |
| [docs/MCP-IDE.md](docs/MCP-IDE.md) | MCP IDE fork integration |
| [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md) | Security notes |

## Repository layout

```
packages/shared   zod schemas
packages/core     jail, edits, checkpoints, search, processes, approvals, tunnel
packages/tools    MCP tool implementations + plugin loader
packages/server   Fastify + MCP Streamable HTTP + control API
packages/cli      editer binary
apps/ui           React approval UI
```

## Development

```bash
pnpm check    # lint, typecheck, test
pnpm test
pnpm build
```

CI runs on push/PR to `main` via [.github/workflows/ci.yml](.github/workflows/ci.yml).

Contributions welcome—please run `pnpm check` before opening a PR.

## License

License: **TBD** (a LICENSE file will be added in a follow-up).

## Related

[editer-mcp](https://github.com/abhinavshyju/editer-mcp) can be embedded as a git submodule in **MCP IDE** (a Code-OSS workbench that supervises the daemon). See [docs/MCP-IDE.md](docs/MCP-IDE.md).
