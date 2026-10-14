import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import {
  api,
  type Approval,
  type AuditEvent,
  type Checkpoint,
  type DaemonState,
  type McpConnectClient,
  type McpConnectInfo,
  type BrowserSessionInfo,
  type Proc,
  type TreeEntry,
} from "./api.js";

interface Workspace {
  id: string;
  name: string;
  root: string;
  mode: string;
}

export function App() {
  const [state, setState] = useState<DaemonState | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tree, setTree] = useState<TreeEntry[]>([]);
  const [treePath, setTreePath] = useState(".");
  const [file, setFile] = useState<{ path: string; contents: string } | null>(null);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [procs, setProcs] = useState<Proc[]>([]);
  const [browserSessions, setBrowserSessions] = useState<BrowserSessionInfo[]>([]);
  const [filter, setFilter] = useState("");
  const [diffText, setDiffText] = useState<string>("");
  const [newRoot, setNewRoot] = useState("");
  const [showMcp, setShowMcp] = useState(false);
  const [mcpClient, setMcpClient] = useState<McpConnectClient>("cursor");
  const [mcpConnect, setMcpConnect] = useState<McpConnectInfo | null>(null);
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [mcpCopied, setMcpCopied] = useState(false);
  const termRef = useRef<HTMLDivElement | null>(null);
  const term = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await api<DaemonState>("/api/state");
      setState(next);
      setWorkspaces(await api<Workspace[]>("/api/workspaces"));
      setApprovals(await api<Approval[]>("/api/approvals"));
      setAudit(await api<AuditEvent[]>("/api/audit"));
      setProcs(await api<Proc[]>("/api/processes"));
      setBrowserSessions(await api<BrowserSessionInfo[]>("/api/browser/sessions").catch(() => []));
      if (next.workspace) {
        const t = await api<{ entries: TreeEntry[] }>("/api/tree?path=.");
        setTree(t.entries);
        setTreePath(".");
        setCheckpoints(await api<Checkpoint[]>("/api/checkpoints"));
      } else {
        setTree([]);
        setCheckpoints([]);
      }
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
    if (!showMcp) return;
    void loadMcpConnect(mcpClient);
  }, [showMcp, mcpClient, loadMcpConnect]);

  useEffect(() => {
    if (!termRef.current || term.current) return;
    const t = new Terminal({
      theme: { background: "#09090b", foreground: "#e4e4e7" },
      fontSize: 12,
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
        if (msg.type.startsWith("approval.")) void api<Approval[]>("/api/approvals").then(setApprovals);
        if (msg.type === "tool.finished") {
          void api<AuditEvent[]>("/api/audit").then(setAudit);
          void api<Checkpoint[]>("/api/checkpoints").then(setCheckpoints).catch(() => undefined);
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

  async function openFile(name: string, isDir: boolean) {
    const next = treePath === "." ? name : `${treePath}/${name}`;
    if (isDir) {
      setTreePath(next);
      setTree((await api<{ entries: TreeEntry[] }>(`/api/tree?path=${encodeURIComponent(next)}`)).entries);
      return;
    }
    const f = await api<{ path: string; contents: string }>(`/api/file?path=${encodeURIComponent(next)}`);
    setFile(f);
    setDiffText("");
    setTouched((s) => new Set(s).add(next));
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
    await api("/api/mode", { method: "POST", body: JSON.stringify({ mode }) });
    await refresh();
  }

  async function copyMcpConfig() {
    if (!mcpConnect?.pasteText) return;
    await navigator.clipboard.writeText(mcpConnect.pasteText);
    setMcpCopied(true);
    window.setTimeout(() => setMcpCopied(false), 2000);
  }

  const filteredAudit = useMemo(
    () => audit.filter((e) => JSON.stringify(e).toLowerCase().includes(filter.toLowerCase())),
    [audit, filter],
  );
  const pending = approvals.filter((a) => a.status === "pending");

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="z-20 flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800 px-4 py-2 text-sm">
        <div className="flex items-center gap-3">
          <strong>editer</strong>
          <span className={connected ? "text-emerald-400" : "text-red-400"}>
            {connected ? "live" : "offline"}
          </span>
          <select
            className="max-w-64 bg-zinc-900 px-2 py-1"
            value={state?.workspace?.id ?? ""}
            onChange={(e) => {
              if (e.target.value) void activate(e.target.value);
            }}
          >
            <option value="">{state?.workspace?.name ?? "no workspace"}</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} — {w.root}
              </option>
            ))}
          </select>
          <input
            className="w-56 bg-zinc-900 px-2 py-1"
            placeholder="add workspace path"
            value={newRoot}
            onChange={(e) => setNewRoot(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addWorkspace();
            }}
          />
          <button className="rounded bg-zinc-800 px-2 py-1" onClick={() => void addWorkspace()}>
            Add
          </button>
        </div>
        <div className="flex items-center gap-3 text-zinc-400">
          <select
            className="bg-zinc-900 px-2 py-1"
            value={state?.mode ?? "review"}
            onChange={(e) => void setMode(e.target.value)}
          >
            <option value="readonly">readonly — no changes</option>
            <option value="review">review — approve shell</option>
            <option value="auto">auto — no approvals</option>
          </select>
          <span>
            tunnel {state?.tunnel.status ?? "—"}
            {state?.tunnel.hostname ? ` ${state.tunnel.hostname}` : ""}
          </span>
          <span>{state?.toolCount ?? 0} tools</span>
          <button
            className="rounded bg-zinc-800 px-2 py-1 text-zinc-200"
            onClick={() => setShowMcp((v) => !v)}
          >
            MCP config
          </button>
          <button className="rounded bg-zinc-800 px-2 py-1 text-zinc-200" onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
      </header>

      {showMcp ? (
        <div className="z-20 shrink-0 border-b border-zinc-800 bg-zinc-950/80 px-4 py-3 text-sm">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-medium text-zinc-200">Connect an MCP client</div>
              <div className="text-xs text-zinc-500">
                Paste into Claude Desktop, Cursor, or any HTTP MCP client (no auth required for now).
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="bg-zinc-900 px-2 py-1"
                value={mcpClient}
                onChange={(e) => setMcpClient(e.target.value as McpConnectClient)}
              >
                <option value="cursor">Cursor</option>
                <option value="claude">Claude Desktop</option>
                <option value="generic">URL only</option>
              </select>
              <button
                type="button"
                className="rounded bg-zinc-800 px-2 py-1"
                onClick={() => void loadMcpConnect(mcpClient)}
              >
                Reload
              </button>
              <button
                type="button"
                className="rounded bg-sky-800 px-2 py-1 disabled:opacity-40"
                disabled={!mcpConnect}
                onClick={() => void copyMcpConfig()}
              >
                {mcpCopied ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                className="rounded bg-zinc-800 px-2 py-1 text-zinc-400"
                onClick={() => setShowMcp(false)}
              >
                Close
              </button>
            </div>
          </div>
          {mcpError ? (
            <div className="mb-2 text-amber-200">{mcpError}</div>
          ) : null}
          {mcpConnect ? (
            <div className="text-xs text-zinc-500">
              Endpoint <span className="text-zinc-300">{mcpConnect.url}</span>
            </div>
          ) : null}
          <pre className="mt-2 max-h-48 overflow-auto rounded border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-200">
            {mcpConnect?.pasteText ?? (mcpError ? "—" : "Loading…")}
          </pre>
        </div>
      ) : null}

      {error ? (
        <div className="z-20 shrink-0 border-b border-red-800 bg-red-950/60 px-4 py-2 text-sm text-red-200">
          {error}{" "}
          <button className="underline" onClick={() => void refresh()}>
            retry
          </button>
        </div>
      ) : null}

      {pending[0] ? (
        <div className="z-20 shrink-0 border-b border-amber-700 bg-amber-950/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-amber-200">Approval needed ({pending.length})</div>
              <div className="text-sm">{pending[0].summary}</div>
            </div>
            <div className="flex gap-2">
              <button
                className="rounded bg-emerald-700 px-3 py-1"
                onClick={() => void decide(pending[0]!.id, true)}
              >
                Approve
              </button>
              <button
                className="rounded bg-red-800 px-3 py-1"
                onClick={() => void decide(pending[0]!.id, false)}
              >
                Reject
              </button>
            </div>
          </div>
          {pending[0].command ? (
            <pre className="overflow-auto text-xs text-zinc-300">{pending[0].command}</pre>
          ) : null}
          {pending[0].preview ? (
            <pre className="max-h-40 overflow-auto text-xs text-zinc-400">{pending[0].preview}</pre>
          ) : null}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-12 overflow-hidden">
        <aside className="z-10 col-span-2 overflow-auto border-r border-zinc-800 p-2 text-sm">
          <button
            className="mb-2 text-zinc-300 hover:underline"
            onClick={() => {
              void (async () => {
                setTreePath(".");
                setTree((await api<{ entries: TreeEntry[] }>("/api/tree?path=.")).entries);
              })();
            }}
          >
            {treePath}
          </button>
          {tree.length === 0 ? (
            <div className="text-zinc-500">
              {state?.workspace
                ? "empty directory"
                : "Add a workspace path in the header, then click Add."}
            </div>
          ) : null}
          {tree.map((e) => (
            <button
              key={e.name}
              type="button"
              className="block w-full truncate py-0.5 text-left hover:bg-zinc-800"
              onClick={() => void openFile(e.name, e.isDirectory)}
            >
              {e.isDirectory ? "▸ " : "  "}
              {e.name}
              {touched.has(treePath === "." ? e.name : `${treePath}/${e.name}`) ? " ·" : ""}
            </button>
          ))}
        </aside>
        <main className="relative z-0 col-span-6 min-h-0 overflow-hidden border-r border-zinc-800">
          {diffText ? (
            <DiffEditor
              original={diffText}
              modified={file?.contents ?? ""}
              theme="vs-dark"
              options={{ readOnly: true, renderSideBySide: true }}
              height="100%"
            />
          ) : (
            <Editor
              value={file?.contents ?? "// open a file from the tree"}
              path={file?.path ?? "untitled"}
              theme="vs-dark"
              options={{ readOnly: true }}
              height="100%"
            />
          )}
        </main>
        <section className="z-10 col-span-4 flex min-h-0 flex-col overflow-hidden">
          <div className="border-b border-zinc-800 p-2 text-xs">
            <input
              className="w-full bg-zinc-900 px-2 py-1"
              placeholder="filter activity"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2 text-xs">
            {filteredAudit.length === 0 ? (
              <div className="text-zinc-500">No activity yet. Connect an MCP client and make a tool call.</div>
            ) : null}
            {filteredAudit.map((e) => (
              <div key={e.id} className="mb-2 border-b border-zinc-900 pb-2">
                <div className="text-zinc-400">
                  {new Date(e.ts).toLocaleTimeString()} {e.clientName} {e.type} {e.tool}{" "}
                  {e.durationMs ? `${e.durationMs}ms` : ""}
                </div>
                {e.error ? <div className="text-red-400">{e.error}</div> : null}
                {mediaPaths(e.result).map((p) => (
                  <img
                    key={p}
                    src={`/api/media?path=${encodeURIComponent(p)}`}
                    alt={p}
                    className="mt-1 max-h-40 max-w-full rounded border border-zinc-800"
                  />
                ))}
                <button
                  type="button"
                  className="text-sky-400"
                  onClick={() => {
                    const r = e.result as { diff?: string } | undefined;
                    setDiffText(r?.diff ?? JSON.stringify(e.args, null, 2));
                  }}
                >
                  expand
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid h-48 shrink-0 grid-cols-12 overflow-hidden border-t border-zinc-800">
        <div className="relative col-span-8 min-h-0 overflow-hidden" ref={termRef} />
        <div className="z-10 col-span-4 overflow-auto p-2 text-xs">
          <div className="mb-1 text-zinc-400">checkpoints</div>
          {checkpoints.map((c) => (
            <div key={c.id} className="mb-1 flex items-center justify-between">
              <span>
                {new Date(c.ts).toLocaleTimeString()} {c.tool} ({c.files.length})
              </span>
              <span className="flex gap-2">
                <button
                  type="button"
                  className="text-sky-400"
                  onClick={() =>
                    void api<{ diff: string }>(`/api/checkpoints/${c.id}/diff`).then((d) =>
                      setDiffText(d.diff),
                    )
                  }
                >
                  diff
                </button>
                <button type="button" className="text-amber-400" onClick={() => void restore(c.id)}>
                  restore
                </button>
              </span>
            </div>
          ))}
          <div className="mt-2 text-zinc-400">browser</div>
          {browserSessions.length === 0 ? <div className="text-zinc-600">no sessions</div> : null}
          {browserSessions.map((s) => (
            <div key={s.name} className="flex justify-between gap-2">
              <span className="truncate">
                {s.name} {s.url} {s.consoleErrors ? `(${s.consoleErrors} err)` : ""}
              </span>
              <button
                type="button"
                className="text-red-400"
                onClick={() =>
                  void api(`/api/browser/sessions/${encodeURIComponent(s.name)}/close`, {
                    method: "POST",
                  }).then(() =>
                    api<BrowserSessionInfo[]>("/api/browser/sessions").then(setBrowserSessions),
                  )
                }
              >
                close
              </button>
            </div>
          ))}
          <div className="mt-2 text-zinc-400">processes</div>
          {procs.map((p) => (
            <div key={p.id} className="flex justify-between">
              <span>
                {p.status} {p.command}
                {p.detectedPort ? ` :${p.detectedPort}` : ""}
              </span>
              <button
                type="button"
                className="text-red-400"
                onClick={() => void api(`/api/processes/${p.id}/stop`, { method: "POST" })}
              >
                stop
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function mediaPaths(result: unknown): string[] {
  if (!result || typeof result !== "object") return [];
  const rec = result as { path?: unknown; _media?: unknown };
  const out: string[] = [];
  if (Array.isArray(rec._media)) {
    for (const item of rec._media) {
      if (item && typeof item === "object" && typeof (item as { path?: unknown }).path === "string") {
        out.push((item as { path: string }).path);
      }
    }
  }
  if (typeof rec.path === "string" && rec.path.includes("media") && !out.includes(rec.path)) {
    out.push(rec.path);
  }
  return out;
}
