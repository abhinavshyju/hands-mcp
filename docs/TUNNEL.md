# Cloudflare named tunnel

editer-mcp publishes MCP at a stable hostname using a **named** Cloudflare tunnel (not a quick `trycloudflare.com` URL).

## Prerequisites

- A Cloudflare account and a domain on that account
- Permission to create a tunnel and a DNS CNAME

## Setup

```bash
pnpm editer -- tunnel setup
```

The wizard:

1. Ensures a `cloudflared` binary (`PATH` or download into `~/.editer/bin`)
2. Runs `cloudflared tunnel login`
3. Creates a named tunnel
4. Asks for a hostname
5. Writes `~/.editer/tunnel/config.yml`
6. Routes DNS
7. Stores tunnel settings in `~/.editer/config.json`

After that, `editer start` supervises `cloudflared` as a child process and reconnects with backoff if it drops.

MCP URL:

```
https://<hostname>/mcp
Authorization: Bearer <token>
```

## Hardening

- Unauthenticated requests are rejected (401).
- The editor UI is **loopback-only** unless `exposeUiOverTunnel` is set true in `~/.editer/config.json`.
- Put [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) in front of the hostname so identity is enforced before our bearer token.

## Disable for a single run

```bash
editer start --no-tunnel
```
