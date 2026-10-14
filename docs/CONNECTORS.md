# Connecting AI chats to editer

editer speaks **MCP over Streamable HTTP** at `/mcp`. Most clients need:

1. A running daemon (`editer .` or `editer start`)
2. A bearer token (`editer token new …`)
3. The MCP URL and `Authorization: Bearer YOUR_TOKEN` in the client’s MCP / connector settings

Print connector hints:

```bash
editer connect --client generic
editer connect --client claude
editer connect --client cursor
```

`editer connect` prints the URL (and JSON for Claude/Cursor). **You must add the bearer token in the client UI**—see below.

## Generic (any MCP chat)

**Local URL:**

```text
http://127.0.0.1:4877/mcp
```

(Use the port from `editer status` or startup logs if you changed it.)

**Tunneled URL:**

```text
https://YOUR_HOSTNAME/mcp
```

From `editer tunnel quick`, named tunnel setup, or the web UI tunnel section. See [TUNNEL.md](TUNNEL.md).

**Authentication:**

```http
Authorization: Bearer YOUR_TOKEN
```

Create and list tokens:

```bash
editer token new my-laptop
editer token list
```

Product UIs vary: look for **MCP**, **Connectors**, **Integrations**, or **Custom MCP server** and paste URL + bearer (or equivalent auth field).

## ChatGPT

1. Start editer on the machine where tools should run:

   ```bash
   editer .
   ```

2. Create a token:

   ```bash
   editer token new chatgpt
   ```

3. Open ChatGPT **Settings → Connectors** (or the current MCP / developer connectors area in your app version).
4. Add a **remote MCP** or **custom connector** with:
   - **Server URL:** your editer MCP URL (local or tunneled)
   - **Authentication:** bearer token `YOUR_TOKEN`

If your ChatGPT build only supports **stdio** MCP, bridge HTTP with [`mcp-remote`](https://www.npmjs.com/package/mcp-remote):

```json
{
  "mcpServers": {
    "editer": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://127.0.0.1:4877/mcp",
        "--header",
        "Authorization: Bearer YOUR_TOKEN"
      ]
    }
  }
}
```

Connector menus change between releases—use whatever MCP entry your ChatGPT client exposes.

## Claude Desktop

```bash
editer connect --client claude
```

Paste the printed `mcpServers` JSON into Claude’s MCP config. For remote access, use the tunneled `https://…/mcp` URL and ensure the client sends:

```http
Authorization: Bearer YOUR_TOKEN
```

Claude Desktop config location depends on your OS; see [Anthropic MCP docs](https://docs.anthropic.com/en/docs/build-with-claude/mcp).

## Cursor

```bash
editer connect --client cursor
```

Add the printed MCP server entry in Cursor’s MCP settings. Include bearer auth if connecting to a remote or tunneled editer instance.

## Cloud Code chat

Configure editer as a **custom remote MCP server** in Cloud Code’s MCP settings (exact menu names depend on your Cloud Code product docs):

1. Run `editer .` on the host that should execute tools.
2. `editer token new cloudcode`
3. Set **MCP URL** to `http://127.0.0.1:4877/mcp` (same machine) or `https://YOUR_HOST/mcp` (via [tunnel](TUNNEL.md)).
4. Set **Authorization** to `Bearer YOUR_TOKEN`.

## Stdio (same machine)

For clients that attach via stdio on the same machine:

```bash
editer stdio
```

Or run the HTTP daemon and use `mcp-remote` as shown above.

## Troubleshooting

- **No tools in the client** — Token mismatch; run `editer token list` and recreate if needed. Confirm the URL ends with `/mcp`.
- **Client only supports stdio** — Use `mcp-remote` or `editer stdio`.
- **Remote laptop / phone** — Use `editer tunnel quick` or a named tunnel; never expose the UI publicly without hardening. See [SAFETY.md](SAFETY.md) and [TUNNEL.md](TUNNEL.md).

More: [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
