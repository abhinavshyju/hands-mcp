# MCP IDE integration

[MCP IDE](https://github.com/microsoft/vscode) in this product is a Code-OSS fork that embeds **hands-mcp** as a git submodule and starts the daemon from the Electron main process.

## Submodule layout

In the IDE repo:

```text
hands-mcp/           # git submodule → this repository
scripts/build-editer.mjs
resources/editer/    # copy of built CLI for packaged builds
src/vs/platform/mcpEdit/
src/vs/workbench/contrib/mcpEdit/
```

Bootstrap:

```bash
git submodule update --init
node scripts/build-editer.mjs
```

## Spawn contract

The IDE runs:

```bash
node hands-mcp/packages/cli/dist/index.js start \
  --headless --no-tunnel --host 127.0.0.1 --port 4877 \
  [--ensure-workspace /path/to/folder]
```

Environment:

| Variable                      | Purpose                                      |
| ----------------------------- | -------------------------------------------- |
| `EDITER_CONTROL_SURFACE=http` | Approvals via `POST /api/approvals`, not TTY |
| `EDITER_AUTO_WORKSPACE`       | Same as `--ensure-workspace` when spawning   |

If `GET http://127.0.0.1:4877/healthz` succeeds, the IDE attaches and does not spawn a second process.

## Control API (IDE / extension authors)

| Endpoint                                        | Use                                                         |
| ----------------------------------------------- | ----------------------------------------------------------- |
| `GET /healthz`                                  | Readiness                                                   |
| `GET /api/state`                                | Mode, workspace, tool count                                 |
| `GET/POST /api/workspaces`                      | Register and activate roots                                 |
| `GET /api/approvals`, `POST /api/approvals/:id` | Approval queue                                              |
| `GET /ws`                                       | Audit / approval events                                     |
| `POST /mcp`                                     | Streamable HTTP MCP (IDE registers as **MCP Edit (local)**) |

Loopback `/api` and `/ws` skip HTTP auth when `auth.loopbackBypass` is true (default). Remote or tunneled MCP should use `auth.mode` `bearer` or `oauth`.

## Standalone use

You can still run `hands start` without MCP IDE; open `http://127.0.0.1:4877` for the browser UI.

The fork also ships `docs/MCP-IDE.md` at its repository root with build and desktop install steps.
