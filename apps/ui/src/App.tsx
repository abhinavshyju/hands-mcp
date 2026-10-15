import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import {
  api,
  type Approval,
  type AuditEvent,
  type AuthMode,
  type Checkpoint,
  type DaemonState,
  type GlobalConfigView,
  type McpConnectClient,
  type McpConnectInfo,
  type BrowserSessionInfo,
  type Proc,
  type TunnelMode,
  type ModeSource,
} from "./api.js";
import { runHandsCommand } from "./handsCommands.js";
import { Workbench } from "./workbench/Workbench.js";
import type { ActivityId, BottomPanelTab, EditorTabId } from "./workbench/types.js";

interface Workspace {
  id: string;
  name: string;
  root: string;
  mode: string;
}

function auditApiPath(workspaceId?: string | null): string {
  if (workspaceId) {
    return `/api/audit?workspaceId=${encodeURIComponent(workspaceId)}`;
  }
  return "/api/audit";
}

export function App() {
  const [state, setState] = useState<DaemonState | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<{ path: string; contents: string } | null>(null);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [procs, setProcs] = useState<Proc[]>([]);
  const [browserSessions, setBrowserSessions] = useState<BrowserSessionInfo[]>([]);
  const [filter, setFilter] = useState("");
  const [diffText, setDiffText] = useState<string>("");
  const [editorTab, setEditorTab] = useState<EditorTabId>("file");
  const [activity, setActivity] = useState<ActivityId>("explorer");
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [panelVisible, setPanelVisible] = useState(true);
  const [panelTab, setPanelTab] = useState<BottomPanelTab>("terminal");
  const [newRoot, setNewRoot] = useState("");
  const [mcpClient, setMcpClient] = useState<McpConnectClient>("cursor");
  const [mcpConnect, setMcpConnect] = useState<McpConnectInfo | null>(null);
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [mcpCopied, setMcpCopied] = useState(false);
  const [modeScope, setModeScope] = useState<"workspace" | "project">("workspace");
  const [globalCfg, setGlobalCfg] = useState<GlobalConfigView | null>(null);
  const [tunnelToken, setTunnelToken] = useState("");
  const [tunnelNgrokToken, setTunnelNgrokToken] = useState("");
  const [tunnelHostname, setTunnelHostname] = useState("");
  const [tunnelModeUi, setTunnelModeUi] = useState<TunnelMode>("off");
  const [oauthPublicBase, setOauthPublicBase] = useState("");
  const [handsCmd, setHandsCmd] = useState("");
  const [handsCmdOut, setHandsCmdOut] = useState<string[] | null>(null);
  const [newTokenName, setNewTokenName] = useState("my-client");
  const [oauthUrlLines, setOauthUrlLines] = useState<string[] | null>(null);
  const termRef = useRef<HTMLDivElement | null>(null);
  const term = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await api<DaemonState>("/api/state");
      setState(next);
      setWorkspaces(await api<Workspace[]>("/api/workspaces"));
      setApprovals(await api<Approval[]>("/api/approvals"));
      setAudit(await api<AuditEvent[]>(auditApiPath(next.workspace?.id)));
      setProcs(await api<Proc[]>("/api/processes"));
      setBrowserSessions(await api<BrowserSessionInfo[]>("/api/browser/sessions").catch(() => []));
      if (next.workspace) {
        setCheckpoints(await api<Checkpoint[]>("/api/checkpoints"));
      } else {
        setCheckpoints([]);
      }
      setGlobalCfg(await api<GlobalConfigView>("/api/config/global").catch(() => null));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const loadMcpConnect = useCallback(async (client: McpConnectClient) => {
    try {
      setMcpConnect(await api<McpConnectInfo>(`/api/mcp/connect?client=${client}`));
      setMcpError(null);
    } catch (err) {
      setMcpConnect(null);
      setMcpError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (activity !== "connect") return;
    void loadMcpConnect(mcpClient);
    if (state?.tunnel.mode) setTunnelModeUi(state.tunnel.mode);
    else if (globalCfg?.tunnel.mode) setTunnelModeUi(globalCfg.tunnel.mode);
    setTunnelHostname(state?.tunnel.hostname ?? globalCfg?.tunnel.hostname ?? "");
    setOauthPublicBase(globalCfg?.auth?.oauth?.publicBaseUrl ?? "");
  }, [activity, mcpClient, loadMcpConnect, state?.tunnel, globalCfg]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        setSidebarVisible((v) => !v);
      }
      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        setPanelVisible((v) => !v);
        window.setTimeout(() => fit.current?.fit(), 150);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const authMode = globalCfg?.auth?.mode ?? "none";
  const authHelp =
    authMode === "bearer"
      ? "Remote clients need Authorization: Bearer … (hands token new <name>)."
      : authMode === "oauth"
        ? "Clients discover OAuth via protected resource metadata (HTTPS public URL required)."
        : "No auth on HTTP routes (default for local dev). Use bearer or oauth before exposing a tunnel.";

  async function setAuthMode(mode: AuthMode) {
    await api("/api/config/global", {
      method: "POST",
      body: JSON.stringify({ auth: { ...globalCfg?.auth, mode } }),
    });
    await refresh();
    if (activity === "connect") void loadMcpConnect(mcpClient);
  }

  async function runHandsCmdLine(line?: string) {
    const raw = (line ?? handsCmd).trim();
    if (!raw) return;
    const res = await runHandsCommand(raw);
    setHandsCmdOut(res.ok ? res.lines : [`Error: ${res.error}`]);
    if (!line) setHandsCmd("");
    await refresh();
    if (activity === "connect") void loadMcpConnect(mcpClient);
  }

  async function createBearerToken() {
    const name = newTokenName.trim();
    if (!name) return;
    await runHandsCmdLine(`/token new ${name}`);
  }

  async function loadOAuthUrls() {
    const res = await runHandsCommand("/oauth-urls");
    if (res.ok) setOauthUrlLines(res.lines);
    else setOauthUrlLines([`Error: ${res.error}`]);
  }

  async function saveOauthPublicBase() {
    await api("/api/config/global", {
      method: "POST",
      body: JSON.stringify({
        auth: {
          ...globalCfg?.auth,
          oauth: { ...globalCfg?.auth?.oauth, publicBaseUrl: oauthPublicBase.trim() || undefined },
        },
      }),
    });
    await refresh();
  }

  useEffect(() => {
    if (!termRef.current || term.current) return;
    const t = new Terminal({
      theme: { background: "#1e1e1e", foreground: "#cccccc", cursor: "#cccccc" },
      fontSize: 12,
      fontFamily: "ui-monospace, Cascadia Code, monospace",
      convertEol: true,
      disableStdin: true,
    });
    const addon = new FitAddon();
    t.loadAddon(addon);
    t.open(termRef.current);
    addon.fit();
    term.current = t;
    fit.current = addon;
    const onResize = () => addon.fit();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (panelTab === "terminal" && panelVisible) {
      window.setTimeout(() => fit.current?.fit(), 100);
    }
  }, [panelTab, panelVisible, sidebarVisible]);

  useEffect(() => {
    let closed = false;
    let ws: WebSocket | undefined;
    const timer = window.setTimeout(() => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onopen = () => {
        if (!closed) setConnected(true);
      };
      ws.onclose = () => {
        if (!closed) setConnected(false);
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data as string) as { type: string; payload: unknown };
        if (msg.type === "replay") return;
        if (msg.type === "approval.requested") {
          setApprovals((a) => [msg.payload as Approval, ...a]);
        }
        if (msg.type.startsWith("approval."))
          void api<Approval[]>("/api/approvals").then(setApprovals);
        if (msg.type === "tool.finished") {
          void api<DaemonState>("/api/state").then((st) =>
            api<AuditEvent[]>(auditApiPath(st.workspace?.id)).then(setAudit),
          );
          void api<Checkpoint[]>("/api/checkpoints")
            .then(setCheckpoints)
            .catch(() => undefined);
        }
        if (msg.type === "process.output") {
          const p = msg.payload as { text?: string };
          term.current?.write((p.text ?? "").replace(/\n/g, "\r\n"));
        }
        if (msg.type === "tunnel.status") void api<DaemonState>("/api/state").then(setState);
        if (msg.type === "process.started" || msg.type === "process.exited") {
          void api<Proc[]>("/api/processes").then(setProcs);
        }
        if (msg.type.startsWith("browser.session.")) {
          void api<BrowserSessionInfo[]>("/api/browser/sessions")
            .then(setBrowserSessions)
            .catch(() => undefined);
        }
      };
    }, 50);
    return () => {
      closed = true;
      window.clearTimeout(timer);
      ws?.close();
    };
  }, []);

  async function openFile(path: string) {
    const f = await api<{ path: string; contents: string }>(
      `/api/file?path=${encodeURIComponent(path)}`,
    );
    setFile(f);
    setDiffText("");
    setEditorTab("file");
    setTouched((s) => new Set(s).add(path));
  }

  async function decide(id: string, approved: boolean) {
    await api(`/api/approvals/${id}`, {
      method: "POST",
      body: JSON.stringify({ approved, reason: approved ? "ui" : "ui-reject" }),
    });
    setApprovals(await api<Approval[]>("/api/approvals"));
  }

  async function restore(id: string) {
    if (!confirm("Restore this checkpoint?")) return;
    await api(`/api/checkpoints/${id}/restore`, { method: "POST", body: "{}" });
    setCheckpoints(await api<Checkpoint[]>("/api/checkpoints"));
    await refresh();
  }

  async function addWorkspace() {
    const root = newRoot.trim() || prompt("Workspace path");
    if (!root) return;
    await api("/api/workspaces", { method: "POST", body: JSON.stringify({ root }) });
    setNewRoot("");
    await refresh();
  }

  async function activate(id: string) {
    await api(`/api/workspaces/${id}/activate`, { method: "POST", body: "{}" });
    await refresh();
  }

  async function setMode(mode: string) {
    await api("/api/mode", { method: "POST", body: JSON.stringify({ mode, scope: modeScope }) });
    await refresh();
  }

  async function setWorkspaceMode(id: string, mode: string) {
    await api(`/api/workspaces/${id}/mode`, { method: "POST", body: JSON.stringify({ mode }) });
    await refresh();
  }

  async function removeWorkspace(id: string) {
    await api(`/api/workspaces/${id}`, { method: "DELETE" });
    await refresh();
  }

  async function approveAll() {
    await api("/api/approvals/decide-all", {
      method: "POST",
      body: JSON.stringify({ approved: true, reason: "ui-all" }),
    });
    setApprovals(await api<Approval[]>("/api/approvals"));
  }

  async function applyTunnelConfig() {
    await api("/api/config/tunnel", {
      method: "POST",
      body: JSON.stringify({
        mode: tunnelModeUi,
        hostname: tunnelHostname || undefined,
        token: tunnelToken || undefined,
        ngrokAuthtoken: tunnelNgrokToken || undefined,
        enabled: tunnelModeUi !== "off",
      }),
    });
    setTunnelToken("");
    setTunnelNgrokToken("");
    await refresh();
  }

  async function startSelectedTunnel() {
    await applyTunnelConfig();
    if (tunnelModeUi === "off") return;
    if (tunnelModeUi === "quick") {
      await api("/api/tunnel/quick", { method: "POST", body: "{}" });
    } else {
      await api("/api/tunnel/restart", { method: "POST", body: "{}" });
    }
    await refresh();
  }

  async function tunnelAction(action: "start" | "stop" | "restart" | "quick" | "ngrok") {
    if (action === "ngrok") {
      setTunnelModeUi("ngrok");
      await api("/api/config/tunnel", {
        method: "POST",
        body: JSON.stringify({
          mode: "ngrok",
          enabled: true,
          ngrokAuthtoken: tunnelNgrokToken || undefined,
        }),
      });
      setTunnelNgrokToken("");
      await api("/api/tunnel/restart", { method: "POST", body: "{}" });
    } else if (action === "quick") {
      setTunnelModeUi("quick");
      await api("/api/tunnel/quick", { method: "POST", body: "{}" });
    } else {
      await api(`/api/tunnel/${action}`, { method: "POST", body: "{}" });
    }
    await refresh();
  }

  async function copyMcpConfig() {
    if (!mcpConnect?.pasteText) return;
    await navigator.clipboard.writeText(mcpConnect.pasteText);
    setMcpCopied(true);
    window.setTimeout(() => setMcpCopied(false), 2000);
  }

  async function checkpointDiff(id: string) {
    const d = await api<{ diff: string }>(`/api/checkpoints/${id}/diff`);
    setDiffText(d.diff);
    setEditorTab("diff");
  }

  async function closeBrowserSession(name: string) {
    await api(`/api/browser/sessions/${encodeURIComponent(name)}/close`, { method: "POST" });
    setBrowserSessions(await api<BrowserSessionInfo[]>("/api/browser/sessions"));
  }

  const filteredAudit = useMemo(
    () => audit.filter((e) => JSON.stringify(e).toLowerCase().includes(filter.toLowerCase())),
    [audit, filter],
  );
  const modeSource = (state?.modeSource ?? "default") as ModeSource;
  const publicMcpUrl = state?.tunnel.quickUrl
    ? `${state.tunnel.quickUrl}/mcp`
    : state?.tunnel.hostname
      ? `https://${state.tunnel.hostname}/mcp`
      : null;

  function selectActivity(id: ActivityId) {
    setActivity((prev) => {
      if (prev === id) setSidebarVisible((v) => !v);
      else setSidebarVisible(true);
      return id;
    });
  }

  function showDiff(text: string) {
    setDiffText(text);
    setEditorTab("diff");
  }

  return (
    <Workbench
      state={state}
      workspaces={workspaces}
      connected={connected}
      error={error}
      file={file}
      touched={touched}
      approvals={approvals}
      filteredAudit={filteredAudit}
      checkpoints={checkpoints}
      procs={procs}
      browserSessions={browserSessions}
      filter={filter}
      diffText={diffText}
      editorTab={editorTab}
      activity={activity}
      sidebarVisible={sidebarVisible}
      panelVisible={panelVisible}
      panelTab={panelTab}
      handsCmd={handsCmd}
      handsCmdOut={handsCmdOut}
      globalCfg={globalCfg}
      mcpClient={mcpClient}
      mcpConnect={mcpConnect}
      mcpError={mcpError}
      mcpCopied={mcpCopied}
      modeScope={modeScope}
      modeSource={modeSource}
      newRoot={newRoot}
      tunnelModeUi={tunnelModeUi}
      tunnelHostname={tunnelHostname}
      tunnelToken={tunnelToken}
      tunnelNgrokToken={tunnelNgrokToken}
      oauthPublicBase={oauthPublicBase}
      oauthUrlLines={oauthUrlLines}
      newTokenName={newTokenName}
      publicMcpUrl={publicMcpUrl}
      authMode={authMode}
      authHelp={authHelp}
      termRef={termRef}
      onActivityChange={selectActivity}
      onSidebarToggle={() => setSidebarVisible((v) => !v)}
      onPanelToggle={() => setPanelVisible((v) => !v)}
      onPanelTabChange={setPanelTab}
      onEditorTabChange={setEditorTab}
      onCloseDiff={() => {
        setDiffText("");
        setEditorTab("file");
      }}
      onOpenFile={(path) => void openFile(path)}
      onFilterChange={setFilter}
      onShowDiff={showDiff}
      onDecide={(id, approved) => void decide(id, approved)}
      onApproveAll={() => void approveAll()}
      onRestoreCheckpoint={(id) => void restore(id)}
      onCheckpointDiff={(id) => void checkpointDiff(id)}
      onStopProcess={(id) => void api(`/api/processes/${id}/stop`, { method: "POST" })}
      onCloseBrowserSession={(name) => void closeBrowserSession(name)}
      onHandsCmdChange={setHandsCmd}
      onHandsCmdSubmit={() => void runHandsCmdLine()}
      onDismissHandsOut={() => setHandsCmdOut(null)}
      onRefresh={() => void refresh()}
      onMcpClientChange={setMcpClient}
      onReloadMcp={() => void loadMcpConnect(mcpClient)}
      onCopyMcp={() => void copyMcpConfig()}
      onAuthMode={(m) => void setAuthMode(m)}
      onRunHandsCmd={(line) => void runHandsCmdLine(line)}
      onNewTokenNameChange={setNewTokenName}
      onCreateToken={() => void createBearerToken()}
      onOauthPublicBaseChange={setOauthPublicBase}
      onSaveOauthPublicBase={() => void saveOauthPublicBase()}
      onLoadOAuthUrls={() => void loadOAuthUrls()}
      onTunnelModeChange={setTunnelModeUi}
      onTunnelHostnameChange={setTunnelHostname}
      onTunnelTokenChange={setTunnelToken}
      onTunnelNgrokTokenChange={setTunnelNgrokToken}
      onStartTunnel={() => void startSelectedTunnel()}
      onExposeUiChange={(v) =>
        void api("/api/config/tunnel", {
          method: "POST",
          body: JSON.stringify({ exposeUiOverTunnel: v }),
        }).then(() => refresh())
      }
      onApplyTunnel={() => void applyTunnelConfig()}
      onTunnelAction={(a) => void tunnelAction(a)}
      onNewRootChange={setNewRoot}
      onAddWorkspace={() => void addWorkspace()}
      onActivate={(id) => void activate(id)}
      onSetMode={(mode) => void setMode(mode)}
      onModeScopeChange={setModeScope}
      onWorkspaceMode={(id, mode) => void setWorkspaceMode(id, mode)}
      onRemoveWorkspace={(id) => void removeWorkspace(id)}
      onMobileSidebarClose={() => setSidebarVisible(false)}
      onMobilePanelClose={() => setPanelVisible(false)}
    />
  );
}
