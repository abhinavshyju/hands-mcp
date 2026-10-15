# hands CLI

Command-Code style control for the Hands MCP daemon.

## One-command start

From any project folder:

```bash
hands .
# or
hands
```

This will:

1. Ensure `~/.hands` exists
2. Write `.hands/config.json` in the project if missing
3. Register the folder as the active workspace
4. Start the MCP server in the foreground
5. Open the interactive console (`y`/`n`/`d`/`a`, `/mode`, `/status`, `/open`, `/clear`, `/quit`)

Flags: `--mode`, `--headless`, `--no-tunnel`, `--tunnel`, `--tunnel-quick`, `--open`, `--host`, `--port`, `--home`.

Quitting the console (`/quit`, `q`, or Ctrl+C) stops the MCP server, Cloudflare tunnel, and any background processes started by Hands.

## Init (without starting server)

```bash
hands init [dir] [--mode review|auto|readonly] [--template node|typescript|python]
```

## Mode

```bash
hands mode                    # show effective mode + policy
hands mode set auto           # workspace scope (clears project mode override)
hands mode set review --project
hands auto                    # alias for mode set auto
hands readonly
```

## Review & approvals

Subcommands auto-start a background daemon for the active workspace if needed.

```bash
hands review
hands approvals list
hands approvals approve <id>
hands approvals approve --all
hands approvals reject <id>
```

## Workspace

```bash
hands workspace add <path>
hands workspace list
hands workspace use <id|name>
hands workspace mode <id> <mode>
hands workspace init
hands workspace remove <id>
```

## Config

```bash
hands config show [--global|--project|--effective]
hands config get port
hands config set port 4877
hands config unset tunnel.hostname
hands config path [--project]
hands config edit [--project]
```

## Daemon

```bash
hands start [--headless] [--ensure-workspace <path>]
hands stop
hands status
hands logs [--follow] [--limit 50] [--tool write_file]
```

In the interactive console (`hands .`), recent activity prints on start in a readable feed (local time, action, command or path, duration), scoped to the **active workspace**. New lines stream automatically. Use `/logs`, `/logs 50`, `/logs all` (verbose metadata), `/logs follow`, `/logs off`. Quitting the interactive session clears audit log files under `~/.hands/logs`. `hands logs` uses the same workspace-scoped format; add `--verbose`, `--main`, or `--legacy` for variants.

## Shell completion

Tab-complete subcommands and common flag values (modes, tunnel modes, MCP clients, workspace ids):

```bash
# bash / zsh
eval "$(hands completion bash)"

# fish
hands completion fish > ~/.config/fish/completions/hands.fish

hands completion install    # print setup for all shells
```

The interactive console (`hands .`) and web UI status bar share the same `/` command catalog (Tab completion in the console; type `/` in the UI for suggestions). Slash tokens match `hands` subcommands (e.g. `/auth mode oauth`, `/workspace list`).

## Cloudflare tunnel

```bash
hands tunnel status [--check]
hands tunnel quick
hands tunnel token <token> [--hostname host.example.com]
hands tunnel set --mode quick|token|named|off [--hostname h]
hands tunnel enable|disable|restart|start|stop
hands tunnel install
hands tunnel login
hands tunnel create [--name <n>]
hands tunnel route dns <hostname> [--name <tunnel>]
hands tunnel list
hands tunnel setup [--hostname h] [--name n] [--skip-login]
```

## MCP clients

```bash
hands connect --client cursor|claude|generic
hands stdio
```
