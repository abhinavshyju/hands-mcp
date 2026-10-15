# Security policy

## Reporting a vulnerability

**Do not** open a public GitHub issue for security vulnerabilities.

Report them privately via [GitHub Security Advisories](https://github.com/abhinavshyju/hands-mcp/security/advisories/new) for this repository. Include:

- A description of the issue and potential impact
- Steps to reproduce
- Affected versions or commits, if known
- Suggested fix or mitigation, if you have one

We will acknowledge receipt and work with you on disclosure timing.

## Scope

This policy covers the **hands-mcp** repository: the `hands` CLI, local daemon, MCP server, approval UI, and bundled tools.

Out of scope: vulnerabilities in third-party chat clients, Cloudflare, or your own misconfiguration (for example, exposing an unauthenticated daemon on a public URL).

## Documentation

Before deploying or tunneling the daemon, read:

- [docs/SAFETY.md](docs/SAFETY.md) — modes, jail, approvals, checkpoints
- [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md) — threat model and assumptions

Use **bearer** or **oauth** auth before any public tunnel; default **none** is intended for localhost-only use.

## Supported versions

Security fixes are applied on the default branch (`main`). There are no long-term release branches at this time; run from `main` or keep your install updated.
