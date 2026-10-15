# GitHub repository setup

Repository: [abhinavshyju/hands-mcp](https://github.com/abhinavshyju/hands-mcp)

## Checklist for maintainers

1. **Visibility** — Settings → General → set the repository to **Public** when ready for open source.
2. **Description** — Short tagline, for example: _MCP CLI and local daemon — real tools for ChatGPT, Claude, Cursor, and any MCP client._
3. **Topics** — Add relevant topics: `mcp`, `model-context-protocol`, `cli`, `chatgpt`, `claude`, `cursor`, `typescript`.
4. **Default branch** — Use **`main`** (matches [.github/workflows/ci.yml](../.github/workflows/ci.yml)).
5. **Security** — Enable private vulnerability reporting; link contributors to [SECURITY.md](../SECURITY.md).
6. **Community** — [CONTRIBUTING.md](../CONTRIBUTING.md), [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md), and issue/PR templates under `.github/`.

## Renaming from editer-mcp

From a clone whose `origin` is still `editer-mcp`, a maintainer with [GitHub CLI](https://cli.github.com/) logged in can run:

```bash
gh repo rename hands-mcp --yes
gh repo edit --visibility public --description "MCP CLI and local daemon — real tools for ChatGPT, Claude, Cursor, and any MCP client."
git remote set-url origin https://github.com/abhinavshyju/hands-mcp.git
```

GitHub keeps a redirect from `abhinavshyju/editer-mcp` to `hands-mcp`. If you already cloned under the old name, update your remote:

```bash
git remote set-url origin https://github.com/abhinavshyju/hands-mcp.git
```

Your local checkout directory name does not need to match the GitHub repo name.

## CI

Continuous integration runs on push and pull requests to `main` via the **CI** workflow. Contributors should run `pnpm check` before opening a PR (see [CONTRIBUTING.md](../CONTRIBUTING.md)).
