# Threat model

hands-mcp is a local daemon that executes filesystem and shell operations on behalf of a remote MCP client. A tunneled endpoint is therefore a remote-code-execution surface. This document records the review done for v0.1.

## Assets

- Files in registered workspace roots
- The user's git repository state (branches, index, stash)
- Secrets on disk (`.env`, SSH keys, cloud credentials)
- Client bearer tokens stored in `~/.hands/config.json`
- Long-running child processes started by the daemon

## Trust boundaries

1. MCP client (untrusted) → HTTPS named tunnel → Fastify `/mcp`
2. Browser UI (loopback by default) → `/api` and `/ws`
3. Child processes spawned in the workspace
4. Cloudflare edge (authenticated by configured `auth.mode`: bearer, OAuth JWT, or none — **use bearer/oauth before tunnel**)

## Controls

| Finding                                      | Severity | Status                                                                                                                                                                    |
| -------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Path traversal and symlink escape            | High     | Mitigated: `resolvePath` realpaths both sides and rejects anything outside the workspace. Covered by jail tests.                                                          |
| Reading `.env` / keys                        | High     | Mitigated: default read denylist plus homedir `.ssh` / `.aws` / `.gnupg` blocks.                                                                                          |
| Writes to `.git` or `node_modules`           | Medium   | Mitigated: write denylist.                                                                                                                                                |
| Destructive shell (`rm -rf /`, `curl \| sh`) | High     | Mitigated: command denylist applies even in `auto` mode.                                                                                                                  |
| Approval bypass with no UI attached          | High     | Mitigated: mutating tools that require `approve` fail closed if no surface is registered.                                                                                 |
| Token leakage into child env                 | Medium   | Mitigated: `EDITER_*` token/secret keys stripped from spawn env.                                                                                                          |
| Token leakage into audit logs                | Medium   | Mitigated: redaction of sensitive keys and bearer-like strings.                                                                                                           |
| Shadow git mutating the user repo            | High     | Mitigated: isolated `GIT_DIR` / `GIT_WORK_TREE` / `GIT_INDEX_FILE`. Tested.                                                                                               |
| Public UI exposure                           | High     | Mitigated: UI is loopback-only unless `exposeUiOverTunnel` is true. Remote `/mcp` and `/api` require auth when `auth.mode` is `bearer` or `oauth`.                        |
| Rate abuse                                   | Medium   | Mitigated: Fastify rate limit keyed by bearer token / OAuth subject when present, else IP.                                                                                |
| Open MCP on tunnel with `auth.mode: none`    | Critical | Operator: set `hands auth mode bearer` or `oauth` before public exposure.                                                                                                 |
| OAuth DCR on embedded AS                     | Medium   | `auth.oauth.allowDcr` enables RFC 7591; anyone who can reach the issuer may register clients — restrict with tunnel Access or disable DCR and use pre-registered clients. |
| Plugin crash taking down the daemon          | Medium   | Mitigated: plugin load errors are isolated and emitted as events.                                                                                                         |
| Concurrent edits corrupting a file           | Medium   | Mitigated: per-process tool lock (global) plus per-file locks in `FileLockManager`.                                                                                       |

## Accepted risks

- Bearer tokens are stored in plaintext in `~/.hands/config.json` (local trusted machine). File mode is not yet locked to 0600 on all platforms — accepted for v0.1, tighten in a follow-up.
- Named Cloudflare tunnels still terminate TLS at Cloudflare; anyone with the URL **and** a token can drive the daemon. Users should put Cloudflare Access in front for extra identity.
- `run_command` uses `shell: true`, so argument injection is possible once a command is approved. Approval previews the full string.
- Embedded OAuth uses development-style consent UI (`devInteractions`) until a custom login/consent flow ships.
- Semantic search remains out of scope for v0.1.

## Operator checklist

- Keep workspace roots as specific as possible.
- Prefer `review` mode until you trust a client.
- Set `hands auth mode bearer` (or `oauth`) on any tunneled host.
- Rotate tokens with `hands token revoke` / `hands token new`.
- Put Cloudflare Access in front of the hostname for any long-lived tunnel.
- Do not set `exposeUiOverTunnel` unless the UI is also behind Access.
