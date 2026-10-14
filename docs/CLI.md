# editer CLI

Command-Code style control for the editer MCP daemon.

## One-command start

From any project folder:

```bash
editer .
# or
editer
```

This will:

1. Ensure `~/.editer` exists
2. Write `.editer/config.json` in the project if missing
3. Register the folder as the active workspace
4. Start the MCP server in the foreground
5. Open the interactive console (`y`/`n`/`d`/`a`, `/mode`, `/status`, `/open`, `/quit`)

Flags: `--mode`, `--headless`, `--no-tunnel`, `--tunnel`, `--tunnel-quick`, `--open`, `--host`, `--port`, `--home`.

Quitting the console (`/quit`, `q`, or Ctrl+C) stops the MCP server, Cloudflare tunnel, and any background processes started by editer.

## Init (without starting server)

```bash
editer init [dir] [--mode review|auto|readonly] [--template node|typescript|python]
```

## Mode

```bash
editer mode                    # show effective mode + policy
editer mode set auto           # workspace scope (clears project mode override)
editer mode set review --project
editer auto                    # alias for mode set auto
editer readonly
```

## Review & approvals

Subcommands auto-start a background daemon for the active workspace if needed.

```bash
editer review
editer approvals list
editer approvals approve <id>
editer approvals approve --all
editer approvals reject <id>
```

## Workspace

```bash
editer workspace add <path>
editer workspace list
editer workspace use <id|name>
editer workspace mode <id> <mode>
editer workspace init
editer workspace remove <id>
```

## Config

```bash
editer config show [--global|--project|--effective]
editer config get port
editer config set port 4877
editer config unset tunnel.hostname
editer config path [--project]
editer config edit [--project]
```

## Daemon

```bash
editer start [--headless] [--ensure-workspace <path>]
editer stop
editer status
editer logs [--follow] [--limit 50] [--tool write_file]
```

In the interactive console (`editer .`), recent activity prints on start and new lines stream as `[log] …`. Use `/logs`, `/logs 50`, `/logs follow`, `/logs off`.
```

## Cloudflare tunnel

```bash
editer tunnel status [--check]
editer tunnel quick
editer tunnel token <token> [--hostname host.example.com]
editer tunnel set --mode quick|token|named|off [--hostname h]
editer tunnel enable|disable|restart
editer tunnel install
editer tunnel setup          # interactive named tunnel
```

## MCP clients

```bash
editer connect --client cursor|claude|generic
editer stdio
```
