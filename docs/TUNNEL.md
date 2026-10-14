# Cloudflare tunnel

editer supports four tunnel modes (stored in `~/.editer/config.json` under `tunnel.mode`):

| Mode | Use case |
|------|----------|
| `off` | Local only |
| `quick` | Ephemeral `*.trycloudflare.com` URL (no account setup) |
| `token` | `cloudflared tunnel run --token …` (Dashboard-created tunnel) |
| `named` | Local credentials + `config.yml` from `editer tunnel setup` |

## Quick tunnel (trycloudflare)

```bash
editer tunnel quick
# or start a session with:
editer . --tunnel-quick
```

The public MCP URL appears in logs and in the web UI when cloudflared prints the URL.

## Token tunnel

```bash
editer tunnel token <your-token> --hostname editer.example.com
editer tunnel restart
```

## Named tunnel (stable hostname)

Prerequisites:

- A Cloudflare account and a domain on that account
- Permission to create a tunnel and a DNS CNAME

```bash
editer tunnel setup
```

The wizard ensures `cloudflared`, runs login, creates a named tunnel, writes `~/.editer/tunnel/config.yml`, and stores settings in global config.

MCP URL:

```
https://<hostname>/mcp
```

## Live control

Tunnel mode, hostname, and token can be changed without restarting the whole daemon:

```bash
editer tunnel set --mode quick
editer tunnel enable|disable|restart
editer tunnel status --check
```

Or use the **Cloudflare tunnel** section in the web UI (MCP config drawer).

## Hardening

- The editor UI is **loopback-only** unless `exposeUiOverTunnel` is enabled (CLI or UI).
- Put [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) in front of public hostnames when exposing MCP.

## Disable for a single run

```bash
editer start --no-tunnel
editer . --no-tunnel
```
