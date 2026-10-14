# Connecting chat clients

```bash
editer connect --client claude
editer connect --client cursor
editer connect --client generic
```

This prints JSON (or a URL + bearer token) for the first active token.

## Claude Desktop

Paste the printed `mcpServers` object into Claude's MCP config. Use the tunneled `https://…/mcp` URL and the `Authorization` header.

Clients that only speak stdio can bridge with [`mcp-remote`](https://www.npmjs.com/package/mcp-remote):

```json
{
  "mcpServers": {
    "editer": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://YOUR_HOST/mcp", "--header", "Authorization: Bearer TOKEN"]
    }
  }
}
```

Same-machine stdio is also available: `node packages/cli/dist/index.js` does not start stdio by default; run the daemon and point HTTP clients at `/mcp`, or import `serveStdio` from `@editer/server` for an in-process stdio helper.
