# Public tunnels

hands supports five tunnel modes (stored in `~/.hands/config.json` under `tunnel.mode`):

| Mode    | Use case                                                      |
| ------- | ------------------------------------------------------------- |
| `off`   | Local only                                                    |
| `quick` | Ephemeral `*.trycloudflare.com` URL (no account setup)        |
| `token` | `cloudflared tunnel run --token …` (Dashboard-created tunnel) |
| `named` | Local credentials + `config.yml` from `hands tunnel setup`    |
| `ngrok` | [ngrok](https://ngrok.com/) HTTP tunnel (`ngrok http <port>`) |

## Interactive console & web UI

Same as CLI, from the `hands>` prompt or the **status bar** command box in the web UI (type `/` for the command menu):

```text
/tunnel status
/tunnel quick
/tunnel ngrok
/tunnel off
/tunnel restart
/tunnel set ngrok
/tunnel install
/tunnel login
/tunnel create [--name]
/tunnel list
/tunnel route dns <hostname>
/tunnel config
/tunnel setup --hostname hands.example.com [--name] [--skip-login]
/help tunnel
```

CLI equivalents: `hands tunnel quick`, `hands tunnel setup`, etc.

## ngrok

Install [ngrok](https://ngrok.com/download) and set an authtoken (`NGROK_AUTHTOKEN` or config):

```bash
export NGROK_AUTHTOKEN=your_token
hands tunnel ngrok
# or: /tunnel ngrok in the console / web UI
```

The public HTTPS URL is printed in ngrok logs and saved to `tunnel.quickUrl` / shown in the UI when detected.

Optional: persist token in config (not returned by the API after save):

```bash
hands config set tunnel.ngrokAuthtoken '"YOUR_NGROK_TOKEN"'
```

## Quick tunnel (trycloudflare)

```bash
hands tunnel quick
# or start a session with:
hands . --tunnel-quick
```

The public MCP URL appears in logs and in the web UI when cloudflared prints the URL.

## Token tunnel

```bash
hands tunnel token <your-token> --hostname editer.example.com
hands tunnel restart
```

## Named tunnel (stable hostname)

Prerequisites:

- A Cloudflare account and a domain on that account
- Permission to create a tunnel and a DNS CNAME

**One-shot wizard:**

```bash
hands tunnel setup
# non-interactive hostname:
hands tunnel setup --hostname hands.example.com --name hands-laptop
```

**Step by step:**

```bash
hands tunnel install
hands tunnel login
hands tunnel create --name hands-laptop
hands tunnel route dns hands.example.com --name hands-laptop
# then persist config (or re-run setup with --skip-login)
hands tunnel setup --hostname hands.example.com --name hands-laptop --skip-login
```

The wizard ensures `cloudflared`, runs login (unless `--skip-login`), creates a named tunnel, writes `~/.hands/tunnel/config.yml`, and stores settings in global config.

**Lifecycle (via daemon):**

```bash
hands tunnel start
hands tunnel stop
hands tunnel list    # Cloudflare account tunnels
```

MCP URL:

```
https://<hostname>/mcp
```

## Live control

Tunnel mode, hostname, and token can be changed without restarting the whole daemon:

```bash
hands tunnel set --mode quick
hands tunnel enable|disable|restart|start|stop
hands tunnel status --check
```

Or use the **Cloudflare tunnel** section in the web UI (MCP config drawer).

## Hardening

- Set **`hands auth mode bearer`** (or `oauth`) before exposing `/mcp` on a public hostname. Default `auth.mode` is `none` for local dev only.
- The editor UI is **loopback-only** unless `exposeUiOverTunnel` is enabled (CLI or UI). Loopback requests can bypass HTTP auth when `auth.loopbackBypass` is true (default).
- For OAuth mode, set `auth.oauth.publicBaseUrl` to your `https://hostname` (or rely on `tunnel.hostname`).
- Put [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) in front of public hostnames when exposing MCP.

## Disable for a single run

```bash
hands start --no-tunnel
hands . --no-tunnel
```
