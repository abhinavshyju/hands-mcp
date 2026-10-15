# Connecting AI chats to Hands

hands speaks **MCP over Streamable HTTP** at `/mcp`. Configure HTTP auth in `~/.hands/config.json` under `auth.mode`:

| Mode     | When to use                                                                                     |
| -------- | ----------------------------------------------------------------------------------------------- |
| `none`   | Local dev (default). Loopback UI/API stay open when `auth.loopbackBypass` is true.              |
| `bearer` | Tunneled or shared hosts. Requires `Authorization: Bearer …` on `/mcp` and remote `/api`.       |
| `oauth`  | OAuth-only clients (e.g. some connector UIs). Uses MCP protected-resource metadata + OAuth 2.1. |

```bash
hands auth mode none|bearer|oauth
hands auth show
hands auth oauth-urls   # when mode is oauth
```

In the **web UI** (MCP config drawer) or the **`hands>`** interactive console, the same actions work as slash commands:

```text
/auth mode bearer          # alias: /auth-mode bearer
/token new my-client
/auth oauth-urls           # alias: /oauth-urls
/auth show
/tunnel quick
/tunnel ngrok
/tunnel setup --hostname hands.example.com
/help tunnel
/help                      # full catalog
```

Most setups need:

1. A running daemon (`hands .` or `hands start`)
2. The right auth mode for your exposure (use **bearer** or **oauth** before a public tunnel)
3. The MCP URL (and bearer header or OAuth discovery, depending on mode)

Print connector hints:

```bash
hands connect --client generic
hands connect --client claude
hands connect --client cursor
```

`hands connect` prints the URL (and JSON for Claude/Cursor). **You must add the bearer token in the client UI**—see below.

## Generic (any MCP chat)

**Local URL:**

```text
http://127.0.0.1:4877/mcp
```

(Use the port from `hands status` or startup logs if you changed it.)

**Tunneled URL:**

```text
https://YOUR_HOSTNAME/mcp
```

From `hands tunnel quick`, named tunnel setup, or the web UI tunnel section. See [TUNNEL.md](TUNNEL.md).

**Authentication (when `auth.mode` is `bearer`):**

```http
Authorization: Bearer YOUR_TOKEN
```

Create and list tokens:

```bash
hands token new my-laptop
hands token list
```

Product UIs vary: look for **MCP**, **Connectors**, **Integrations**, or **Custom MCP server** and paste URL + bearer (or equivalent auth field).

## ChatGPT

1. Start Hands on the machine where tools should run:

   ```bash
   hands .
   ```

2. Create a token:

   ```bash
   hands token new chatgpt
   ```

3. Open ChatGPT **Settings → Connectors** (or the current MCP / developer connectors area in your app version).
4. Add a **remote MCP** or **custom connector** with:
   - **Server URL:** your Hands MCP URL (local or tunneled)
   - **Authentication:** bearer token `YOUR_TOKEN`

If your ChatGPT build only supports **stdio** MCP, bridge HTTP with [`mcp-remote`](https://www.npmjs.com/package/mcp-remote):

```json
{
  "mcpServers": {
    "hands": {
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
hands connect --client claude
```

Paste the printed `mcpServers` JSON into Claude’s MCP config. For remote access, use the tunneled `https://…/mcp` URL and ensure the client sends:

```http
Authorization: Bearer YOUR_TOKEN
```

Claude Desktop config location depends on your OS; see [Anthropic MCP docs](https://docs.anthropic.com/en/docs/build-with-claude/mcp).

## Cursor

```bash
hands connect --client cursor
```

Add the printed MCP server entry in Cursor’s MCP settings. Include bearer auth if connecting to a remote or tunneled Hands instance.

## Cloud Code chat

Configure Hands as a **custom remote MCP server** in Cloud Code’s MCP settings (exact menu names depend on your Cloud Code product docs):

1. Run `hands .` on the host that should execute tools.
2. `hands token new cloudcode`
3. Set **MCP URL** to `http://127.0.0.1:4877/mcp` (same machine) or `https://YOUR_HOST/mcp` (via [tunnel](TUNNEL.md)).
4. Set **Authorization** to `Bearer YOUR_TOKEN`.

## OAuth (`auth.mode: oauth`)

For clients that only speak OAuth (no static bearer):

1. Set a **public HTTPS base** (tunnel hostname or `auth.oauth.publicBaseUrl`).
2. `hands auth mode oauth`
3. `hands auth oauth-urls` — copy protected-resource metadata and issuer URLs.
4. Point the client at `https://YOUR_HOST/mcp`; it discovers auth via [RFC 9728](https://www.rfc-editor.org/rfc/rfc9728) metadata.

Embedded authorization server (default when `auth.oauth.externalIssuer` is unset) supports authorization code + PKCE and dynamic client registration (RFC 7591). For an external IdP (Keycloak, etc.), set `auth.oauth.externalIssuer` and Hands validates JWT access tokens only.

## Stdio (same machine)

For clients that attach via stdio on the same machine:

```bash
hands stdio
```

Or run the HTTP daemon and use `mcp-remote` as shown above.

## Troubleshooting

- **No tools in the client** — Token mismatch; run `hands token list` and recreate if needed. Confirm the URL ends with `/mcp`.
- **Client only supports stdio** — Use `mcp-remote` or `hands stdio`.
- **Remote laptop / phone** — Use `hands tunnel quick` or a named tunnel; never expose the UI publicly without hardening. See [SAFETY.md](SAFETY.md) and [TUNNEL.md](TUNNEL.md).

More: [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
