# Contributing to hands-mcp

Thanks for helping improve **hands** — the MCP CLI and local daemon that gives AI chats real tools on your machine.

## Before you start

- Read the [README](README.md) for install and run instructions.
- For security-sensitive behavior, see [docs/SAFETY.md](docs/SAFETY.md) and [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md).
- Agents and humans editing code should follow [AGENTS.md](AGENTS.md) and [`.cursor/rules/engineering-standards.mdc`](.cursor/rules/engineering-standards.mdc).

## Development setup

```bash
git clone https://github.com/abhinavshyju/hands-mcp.git
cd hands-mcp
pnpm install
```

Run the CLI from the repo:

```bash
pnpm hands -- .
# or: pnpm --filter @hands/cli start
```

## Checks before a pull request

CI runs the same gate as local development:

```bash
pnpm check   # lint, format check, typecheck, test
```

Optional while iterating:

```bash
pnpm format      # Prettier write
pnpm lint:fix
pnpm test:watch
pnpm build
```

## Code organization

| Package         | Owns                                             |
| --------------- | ------------------------------------------------ |
| `@hands/shared` | Schemas, constants, pure helpers                 |
| `@hands/core`   | Domain logic, config, jail/policy — no CLI or UI |
| `@hands/tools`  | MCP tool implementations                         |
| `@hands/server` | HTTP, MCP, auth wiring                           |
| `@hands/cli`    | Thin commands: parse args → delegate             |
| `@hands/ui`     | Workbench UI (`apps/ui`)                         |

Keep command files thin. Put shared logic in `core` or `shared`, not duplicated across CLI commands.

## Pull requests

1. Fork the repo and create a branch from `main`.
2. Make focused changes; avoid unrelated refactors.
3. Add or adjust tests when behavior changes.
4. Run `pnpm check` and ensure it passes.
5. Open a PR with a clear summary and test plan (the PR template will prompt you).

If your change affects safety modes, approvals, auth, or the path jail, call that out explicitly in the PR description.

## Questions

Open a [GitHub issue](https://github.com/abhinavshyju/hands-mcp/issues) for bugs, features, or discussion. For security vulnerabilities, see [SECURITY.md](SECURITY.md).
