import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type {
  AuthMode,
  DaemonState,
  GlobalConfigView,
  McpConnectClient,
  McpConnectInfo,
  TunnelMode,
} from "../api.js";
import {
  cloudflareModeFromTunnel,
  tunnelModeForProvider,
  tunnelModeToProvider,
  type CloudflareTunnelMode,
  type TunnelProvider,
} from "../tunnelUi.js";
import { ScrollPane } from "./ScrollPane.js";

function CodeScroll({ className, text }: { className?: string; text: string }) {
  return (
    <ScrollArea className={cn("w-full rounded-sm border border-border", className)}>
      <pre className="wb-code border-0">{text}</pre>
    </ScrollArea>
  );
}

export function ConnectView({
  authMode,
  authHelp,
  mcpClient,
  mcpConnect,
  mcpError,
  mcpCopied,
  globalCfg,
  state,
  tunnelModeUi,
  tunnelHostname,
  tunnelToken,
  tunnelNgrokToken,
  oauthPublicBase,
  oauthUrlLines,
  newTokenName,
  publicMcpUrl,
  onMcpClientChange,
  onReload,
  onCopy,
  onAuthMode,
  onRunHandsCmd,
  onNewTokenNameChange,
  onCreateToken,
  onOauthPublicBaseChange,
  onSaveOauthPublicBase,
  onLoadOAuthUrls,
  onTunnelModeChange,
  onTunnelHostnameChange,
  onTunnelTokenChange,
  onTunnelNgrokTokenChange,
  onExposeUiChange,
  onApplyTunnel,
  onStartTunnel,
  onTunnelAction,
}: {
  authMode: AuthMode;
  authHelp: string;
  mcpClient: McpConnectClient;
  mcpConnect: McpConnectInfo | null;
  mcpError: string | null;
  mcpCopied: boolean;
  globalCfg: GlobalConfigView | null;
  state: DaemonState | null;
  tunnelModeUi: TunnelMode;
  tunnelHostname: string;
  tunnelToken: string;
  tunnelNgrokToken: string;
  oauthPublicBase: string;
  oauthUrlLines: string[] | null;
  newTokenName: string;
  publicMcpUrl: string | null;
  onMcpClientChange: (c: McpConnectClient) => void;
  onReload: () => void;
  onCopy: () => void;
  onAuthMode: (m: AuthMode) => void;
  onRunHandsCmd: (line: string) => void;
  onNewTokenNameChange: (v: string) => void;
  onCreateToken: () => void;
  onOauthPublicBaseChange: (v: string) => void;
  onSaveOauthPublicBase: () => void;
  onLoadOAuthUrls: () => void;
  onTunnelModeChange: (m: TunnelMode) => void;
  onTunnelHostnameChange: (v: string) => void;
  onTunnelTokenChange: (v: string) => void;
  onTunnelNgrokTokenChange: (v: string) => void;
  onExposeUiChange: (v: boolean) => void;
  onApplyTunnel: () => void;
  onStartTunnel: () => void;
  onTunnelAction: (a: "start" | "stop" | "restart" | "quick" | "ngrok") => void;
}) {
  const tunnelProvider = tunnelModeToProvider(tunnelModeUi);
  const cloudflareMode = cloudflareModeFromTunnel(tunnelModeUi);

  function setProvider(provider: TunnelProvider) {
    onTunnelModeChange(tunnelModeForProvider(provider, cloudflareMode, tunnelModeUi));
  }

  function setCloudflareMode(cf: CloudflareTunnelMode) {
    onTunnelModeChange(cf);
  }

  return (
    <ScrollPane>
      <div className="space-y-4 p-3 text-[13px] text-foreground">
        <section>
          <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            MCP client
          </h2>
          <p className="mb-2 text-[12px] text-muted-foreground">{authHelp}</p>
          <div className="mb-2 flex flex-wrap gap-1">
            {(["none", "bearer", "oauth"] as const).map((m) => (
              <Button
                key={m}
                type="button"
                size="sm"
                variant={authMode === m ? "default" : "secondary"}
                onClick={() => void onRunHandsCmd(`/auth-mode ${m}`)}
              >
                /auth-mode {m}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              className="h-8 rounded-sm border border-input bg-background px-2 text-xs"
              value={authMode}
              onChange={(e) => void onAuthMode(e.target.value as AuthMode)}
            >
              <option value="none">auth: none</option>
              <option value="bearer">auth: bearer</option>
              <option value="oauth">auth: oauth</option>
            </select>
            <select
              className="h-8 rounded-sm border border-input bg-background px-2 text-xs"
              value={mcpClient}
              onChange={(e) => onMcpClientChange(e.target.value as McpConnectClient)}
            >
              <option value="cursor">Cursor</option>
              <option value="claude">Claude Desktop</option>
              <option value="generic">URL only</option>
            </select>
            <Button type="button" size="sm" variant="secondary" onClick={() => void onReload()}>
              Reload
            </Button>
            <Button type="button" size="sm" disabled={!mcpConnect} onClick={() => void onCopy()}>
              {mcpCopied ? "Copied" : "Copy config"}
            </Button>
          </div>
          {mcpError ? <p className="mt-2 text-[12px] text-amber-300">{mcpError}</p> : null}
          {mcpConnect ? (
            <p className="mt-2 text-[12px] text-muted-foreground">
              Endpoint <span className="text-foreground">{mcpConnect.url}</span> · Auth{" "}
              <span className="text-foreground">{mcpConnect.authMode ?? authMode}</span>
            </p>
          ) : null}
          {authMode === "bearer" ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <Input
                className="h-8 w-36 text-xs"
                value={newTokenName}
                onChange={(e) => onNewTokenNameChange(e.target.value)}
                placeholder="token name"
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void onCreateToken()}
              >
                /token new …
              </Button>
              <span className="self-center text-[12px] text-muted-foreground">
                {globalCfg?.tokens?.length
                  ? `Active: ${globalCfg.tokens.map((t) => t.name).join(", ")}`
                  : "No tokens yet"}
              </span>
            </div>
          ) : null}
          {authMode === "oauth" ? (
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap gap-2">
                <Input
                  className="h-8 min-w-[12rem] flex-1 text-xs"
                  placeholder="https://your-host.example.com"
                  value={oauthPublicBase}
                  onChange={(e) => onOauthPublicBaseChange(e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void onSaveOauthPublicBase()}
                >
                  Save public URL
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void onLoadOAuthUrls()}
                >
                  /oauth-urls
                </Button>
              </div>
              {oauthUrlLines ? (
                <CodeScroll className="h-32" text={oauthUrlLines.join("\n")} />
              ) : null}
            </div>
          ) : null}
          <CodeScroll
            className="mt-2 h-40"
            text={mcpConnect?.pasteText ?? (mcpError ? "—" : "Loading…")}
          />
        </section>

        <section className="border-t border-border pt-3">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Public tunnel
          </h2>
          <p className="mb-2 text-[12px] text-muted-foreground">
            Choose Cloudflare or ngrok, configure options, then Start.
          </p>
          <p className="mb-2 text-[12px] text-muted-foreground">
            <span className={state?.tunnel.healthy ? "text-emerald-400" : ""}>
              {state?.tunnel.status ?? "—"}
            </span>
            {state?.tunnel.mode ? ` · ${state.tunnel.mode}` : ""}
            {state?.tunnel.lastError ? ` — ${state.tunnel.lastError.slice(0, 80)}` : ""}
          </p>
          {publicMcpUrl ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="mb-2 h-auto p-0 text-xs"
              onClick={() => void navigator.clipboard.writeText(publicMcpUrl)}
            >
              Copy public MCP URL
            </Button>
          ) : null}
          <div className="mb-2 flex flex-wrap gap-1">
            {(
              [
                ["off", "Off"],
                ["cloudflare", "Cloudflare"],
                ["ngrok", "ngrok"],
              ] as const
            ).map(([id, label]) => (
              <Button
                key={id}
                type="button"
                size="sm"
                variant={tunnelProvider === id ? "default" : "secondary"}
                onClick={() => setProvider(id)}
              >
                {label}
              </Button>
            ))}
          </div>
          {tunnelProvider === "cloudflare" ? (
            <div className="mb-2 space-y-2 rounded-sm border border-border p-2">
              <p className="text-[11px] font-medium text-muted-foreground">Cloudflare mode</p>
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    ["quick", "Quick (trycloudflare)"],
                    ["token", "Dashboard token"],
                    ["named", "Named tunnel"],
                  ] as const
                ).map(([id, label]) => (
                  <Button
                    key={id}
                    type="button"
                    size="sm"
                    variant={cloudflareMode === id ? "default" : "secondary"}
                    onClick={() => setCloudflareMode(id)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              {cloudflareMode !== "quick" ? (
                <Input
                  className="h-8 text-xs"
                  placeholder="hostname (e.g. hands.example.com)"
                  value={tunnelHostname}
                  onChange={(e) => onTunnelHostnameChange(e.target.value)}
                />
              ) : null}
              {cloudflareMode === "token" ? (
                <Input
                  className="h-8 text-xs"
                  placeholder={
                    globalCfg?.tunnel.tokenSet
                      ? "Cloudflare tunnel token (set — paste to replace)"
                      : "Cloudflare tunnel token"
                  }
                  value={tunnelToken}
                  onChange={(e) => onTunnelTokenChange(e.target.value)}
                />
              ) : null}
              {cloudflareMode === "named" ? (
                <p className="text-[11px] text-muted-foreground">
                  Run once in a terminal: hands tunnel setup
                </p>
              ) : null}
            </div>
          ) : null}
          {tunnelProvider === "ngrok" ? (
            <div className="mb-2 space-y-2 rounded-sm border border-border p-2">
              <p className="text-[11px] text-muted-foreground">
                Requires ngrok on PATH. Authtoken from ngrok.com or NGROK_AUTHTOKEN.
              </p>
              <Input
                className="h-8 text-xs"
                placeholder={
                  globalCfg?.tunnel.ngrokAuthtokenSet
                    ? "ngrok authtoken (set — paste to replace)"
                    : "ngrok authtoken"
                }
                value={tunnelNgrokToken}
                onChange={(e) => onTunnelNgrokTokenChange(e.target.value)}
              />
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-[12px] text-muted-foreground">
              <input
                type="checkbox"
                checked={globalCfg?.exposeUiOverTunnel ?? false}
                onChange={(e) => onExposeUiChange(e.target.checked)}
              />
              expose UI over tunnel
            </label>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void onApplyTunnel()}
              disabled={tunnelProvider === "off"}
            >
              Save only
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={tunnelProvider === "off"}
              onClick={() => void onStartTunnel()}
            >
              Start tunnel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void onTunnelAction("restart")}
            >
              Restart
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void onTunnelAction("stop")}
            >
              Stop
            </Button>
          </div>
          {state?.tunnel.quickUrl || state?.tunnel.hostname ? (
            <p className="mt-2 break-all text-[12px] text-muted-foreground">
              Public: <span className="text-foreground">{publicMcpUrl ?? "—"}</span>
            </p>
          ) : null}
        </section>
      </div>
    </ScrollPane>
  );
}
