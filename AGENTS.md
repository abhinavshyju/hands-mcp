# Agent guide (hands-mcp)

**hands-mcp** is a pnpm monorepo: MCP CLI and daemon (`hands`) plus a local approval UI. Packages live under `packages/` (`shared`, `core`, `tools`, `server`, `cli`); the workbench is `apps/ui` (`@hands/ui`).

## Commands

Use scripts in root [`package.json`](package.json):

- `pnpm format` — Prettier write
- `pnpm format:check` — Prettier check (included in `pnpm check`)
- `pnpm lint` / `pnpm lint:fix` — ESLint
- `pnpm typecheck` — TypeScript
- `pnpm test` — Vitest
- `pnpm check` — lint + format check + typecheck + test (CI)

## Code changes

Follow [`.cursor/rules/engineering-standards.mdc`](.cursor/rules/engineering-standards.mdc) for scope, package boundaries, and style.

**MCP clients** (ChatGPT, Claude, etc.): call the `get_coding_guidance` tool or read MCP resource `hands://guidance/coding-standards` before editing. Bundled text lives in [`packages/shared/src/codingGuidance.ts`](packages/shared/src/codingGuidance.ts); workspace `AGENTS.md` and `.cursor/rules/*.mdc` are merged in when present.
