import { useEffect, useRef, type RefObject } from "react";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import { Button } from "@/components/ui/button";
import { ActivityBar } from "./ActivityBar.js";
import { Sidebar } from "./Sidebar.js";
import { EditorPane } from "./EditorPane.js";
import { BottomPanel } from "./BottomPanel.js";
import { StatusBar } from "./StatusBar.js";
import { FileTree } from "./FileTree.js";
import { ApprovalsView } from "./ApprovalsView.js";
import { ConnectView } from "./ConnectView.js";
import { SettingsView } from "./SettingsView.js";
import type { ActivityId, BottomPanelTab, EditorTabId } from "./types.js";
import { useMediaQuery } from "./useMediaQuery.js";
import type {
  Approval,
  AuditEvent,
  AuthMode,
  BrowserSessionInfo,
  Checkpoint,
  DaemonState,
  GlobalConfigView,
  McpConnectClient,
  McpConnectInfo,
  ModeSource,
  Proc,
  TunnelMode,
} from "../api.js";

interface Workspace {
  id: string;
  name: string;
  root: string;
  mode: string;
}

export interface WorkbenchProps {
  state: DaemonState | null;
  workspaces: Workspace[];
  connected: boolean;
  error: string | null;
  file: { path: string; contents: string } | null;
  touched: Set<string>;
  approvals: Approval[];
  filteredAudit: AuditEvent[];
  checkpoints: Checkpoint[];
  procs: Proc[];
  browserSessions: BrowserSessionInfo[];
  filter: string;
  diffText: string;
  editorTab: EditorTabId;
  activity: ActivityId;
  sidebarVisible: boolean;
  panelVisible: boolean;
  panelTab: BottomPanelTab;
  handsCmd: string;
  handsCmdOut: string[] | null;
  globalCfg: GlobalConfigView | null;
  mcpClient: McpConnectClient;
  mcpConnect: McpConnectInfo | null;
  mcpError: string | null;
  mcpCopied: boolean;
  modeScope: "workspace" | "project";
  modeSource: ModeSource;
  newRoot: string;
  tunnelModeUi: TunnelMode;
  tunnelHostname: string;
  tunnelToken: string;
  tunnelNgrokToken: string;
  oauthPublicBase: string;
  oauthUrlLines: string[] | null;
  newTokenName: string;
  publicMcpUrl: string | null;
  authMode: AuthMode;
  authHelp: string;
  termRef: RefObject<HTMLDivElement | null>;
  onActivityChange: (a: ActivityId) => void;
  onSidebarToggle: () => void;
  onPanelToggle: () => void;
  onPanelTabChange: (t: BottomPanelTab) => void;
  onEditorTabChange: (t: EditorTabId) => void;
  onCloseDiff: () => void;
  onOpenFile: (path: string) => void;
  onFilterChange: (v: string) => void;
  onShowDiff: (text: string) => void;
  onDecide: (id: string, approved: boolean) => void;
  onApproveAll: () => void;
  onRestoreCheckpoint: (id: string) => void;
  onCheckpointDiff: (id: string) => void;
  onStopProcess: (id: string) => void;
  onCloseBrowserSession: (name: string) => void;
  onHandsCmdChange: (v: string) => void;
  onHandsCmdSubmit: () => void;
  onDismissHandsOut: () => void;
  onRefresh: () => void;
  onMcpClientChange: (c: McpConnectClient) => void;
  onReloadMcp: () => void;
  onCopyMcp: () => void;
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
  onNewRootChange: (v: string) => void;
  onAddWorkspace: () => void;
  onActivate: (id: string) => void;
  onSetMode: (mode: string) => void;
  onModeScopeChange: (s: "workspace" | "project") => void;
  onWorkspaceMode: (id: string, mode: string) => void;
  onRemoveWorkspace: (id: string) => void;
  onMobileSidebarClose: () => void;
  onMobilePanelClose: () => void;
}

function sidebarContent(props: WorkbenchProps) {
  const pending = props.approvals.filter((a) => a.status === "pending");
  switch (props.activity) {
    case "explorer":
      return (
        <FileTree
          workspaceReady={Boolean(props.state?.workspace)}
          workspaceKey={props.state?.workspace?.id ?? ""}
          activeFilePath={props.file?.path ?? null}
          touched={props.touched}
          onOpenFile={props.onOpenFile}
        />
      );
    case "approvals":
      return (
        <ApprovalsView
          pending={pending}
          onDecide={props.onDecide}
          onApproveAll={props.onApproveAll}
          onShowDiff={props.onShowDiff}
        />
      );
    case "connect":
      return (
        <ConnectView
          authMode={props.authMode}
          authHelp={props.authHelp}
          mcpClient={props.mcpClient}
          mcpConnect={props.mcpConnect}
          mcpError={props.mcpError}
          mcpCopied={props.mcpCopied}
          globalCfg={props.globalCfg}
          state={props.state}
          tunnelModeUi={props.tunnelModeUi}
          tunnelHostname={props.tunnelHostname}
          tunnelToken={props.tunnelToken}
          tunnelNgrokToken={props.tunnelNgrokToken}
          oauthPublicBase={props.oauthPublicBase}
          oauthUrlLines={props.oauthUrlLines}
          newTokenName={props.newTokenName}
          publicMcpUrl={props.publicMcpUrl}
          onMcpClientChange={props.onMcpClientChange}
          onReload={props.onReloadMcp}
          onCopy={props.onCopyMcp}
          onAuthMode={props.onAuthMode}
          onRunHandsCmd={props.onRunHandsCmd}
          onNewTokenNameChange={props.onNewTokenNameChange}
          onCreateToken={props.onCreateToken}
          onOauthPublicBaseChange={props.onOauthPublicBaseChange}
          onSaveOauthPublicBase={props.onSaveOauthPublicBase}
          onLoadOAuthUrls={props.onLoadOAuthUrls}
          onTunnelModeChange={props.onTunnelModeChange}
          onTunnelHostnameChange={props.onTunnelHostnameChange}
          onTunnelTokenChange={props.onTunnelTokenChange}
          onTunnelNgrokTokenChange={props.onTunnelNgrokTokenChange}
          onExposeUiChange={props.onExposeUiChange}
          onApplyTunnel={props.onApplyTunnel}
          onStartTunnel={props.onStartTunnel}
          onTunnelAction={props.onTunnelAction}
        />
      );
    case "settings":
      return (
        <SettingsView
          state={props.state}
          workspaces={props.workspaces}
          modeScope={props.modeScope}
          modeSource={props.modeSource}
          newRoot={props.newRoot}
          onNewRootChange={props.onNewRootChange}
          onAddWorkspace={props.onAddWorkspace}
          onActivate={props.onActivate}
          onSetMode={props.onSetMode}
          onModeScopeChange={props.onModeScopeChange}
          onWorkspaceMode={props.onWorkspaceMode}
          onRemoveWorkspace={props.onRemoveWorkspace}
          onRefresh={props.onRefresh}
        />
      );
  }
}

export function Workbench(props: WorkbenchProps) {
  const mobile = !useMediaQuery("(min-width: 768px)");
  const pendingCount = props.approvals.filter((a) => a.status === "pending").length;
  const warnTone = props.state?.mode === "auto" || pendingCount > 0;
  const layoutRef = useRef<{ fitTerminal?: () => void }>({});
  const { defaultLayout: hLayout, onLayoutChanged: onHLayoutChanged } = useDefaultLayout({
    id: "hands-wb-h",
    panelIds: ["sidebar", "center"],
  });
  const { defaultLayout: vLayout, onLayoutChanged: onVLayoutChanged } = useDefaultLayout({
    id: "hands-wb-v",
    panelIds: ["editor", "panel"],
  });

  useEffect(() => {
    layoutRef.current.fitTerminal = () => {
      window.dispatchEvent(new Event("resize"));
    };
  }, []);

  const fitTerminal = () => layoutRef.current.fitTerminal?.();

  const handleActivity = (id: ActivityId) => {
    props.onActivityChange(id);
  };

  const editorBlock = (
    <EditorPane
      file={props.file}
      diffText={props.diffText}
      activeTab={props.editorTab}
      onSelectTab={props.onEditorTabChange}
      onCloseDiff={props.onCloseDiff}
    />
  );

  return (
    <div className="wb-root flex h-full min-h-0 flex-col overflow-hidden bg-[var(--wb-bg)] font-[var(--wb-font-ui)] text-[var(--wb-text)]">
      <div className="flex h-9 shrink-0 items-center border-b border-[var(--wb-border)] bg-[var(--wb-titlebar)] px-3 text-[12px]">
        <span className="font-semibold tracking-tight">Hands</span>
        <span className="ml-3 text-[var(--wb-muted)]">MCP IDE</span>
        {mobile && !props.panelVisible ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="ml-auto h-7 text-[11px]"
            onClick={props.onPanelToggle}
          >
            Panel
          </Button>
        ) : null}
      </div>

      {props.handsCmdOut ? (
        <div className="shrink-0 border-b border-[var(--wb-border)] bg-[var(--wb-sidebar)] px-3 py-2 font-[var(--wb-font-mono)] text-[11px]">
          {props.handsCmdOut.map((ln) => (
            <div key={ln}>{ln}</div>
          ))}
          <Button
            type="button"
            variant="link"
            size="sm"
            className="mt-1 h-auto p-0"
            onClick={props.onDismissHandsOut}
          >
            Dismiss
          </Button>
        </div>
      ) : null}

      {props.error ? (
        <div className="shrink-0 border-b border-red-900 bg-red-950/80 px-3 py-2 text-[13px] text-red-200">
          {props.error}{" "}
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0 text-red-100 underline"
            onClick={() => void props.onRefresh()}
          >
            Retry
          </Button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ActivityBar
          active={props.activity}
          pendingCount={pendingCount}
          onSelect={handleActivity}
        />

        {mobile ? (
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <Sidebar
              activity={props.activity}
              visible={props.sidebarVisible}
              mobile
              onClose={props.onMobileSidebarClose}
              onToggle={props.onSidebarToggle}
            >
              {sidebarContent(props)}
            </Sidebar>
            <div className="min-h-0 flex-1">{editorBlock}</div>
            <BottomPanel
              visible={props.panelVisible}
              mobile
              activeTab={props.panelTab}
              onTabChange={props.onPanelTabChange}
              onToggle={props.onPanelToggle}
              onClose={props.onMobilePanelClose}
              termRef={props.termRef}
              filter={props.filter}
              onFilterChange={props.onFilterChange}
              filteredAudit={props.filteredAudit}
              onShowDiff={props.onShowDiff}
              checkpoints={props.checkpoints}
              onCheckpointDiff={props.onCheckpointDiff}
              onRestoreCheckpoint={props.onRestoreCheckpoint}
              procs={props.procs}
              onStopProcess={props.onStopProcess}
              browserSessions={props.browserSessions}
              onCloseBrowserSession={props.onCloseBrowserSession}
            />
          </div>
        ) : (
          <Group
            id="hands-wb-h"
            orientation="horizontal"
            className="min-h-0 min-w-0 flex-1"
            defaultLayout={hLayout}
            onLayoutChanged={(layout, meta) => {
              onHLayoutChanged(layout, meta);
              fitTerminal();
            }}
          >
            {props.sidebarVisible ? (
              <>
                <Panel id="sidebar" defaultSize="18" minSize="12" maxSize="40">
                  <Sidebar
                    activity={props.activity}
                    visible
                    mobile={false}
                    onClose={props.onMobileSidebarClose}
                    onToggle={props.onSidebarToggle}
                  >
                    {sidebarContent(props)}
                  </Sidebar>
                </Panel>
                <Separator className="w-1" />
              </>
            ) : null}
            <Panel id="center" minSize="30" defaultSize={props.sidebarVisible ? undefined : "100"}>
              <Group
                id="hands-wb-v"
                orientation="vertical"
                className="h-full"
                defaultLayout={vLayout}
                onLayoutChanged={(layout, meta) => {
                  onVLayoutChanged(layout, meta);
                  fitTerminal();
                }}
              >
                <Panel id="editor" minSize="20" defaultSize={props.panelVisible ? "65" : "100"}>
                  {editorBlock}
                </Panel>
                {props.panelVisible ? (
                  <>
                    <Separator className="h-1" />
                    <Panel id="panel" defaultSize="35" minSize="15">
                      <BottomPanel
                        visible
                        mobile={false}
                        activeTab={props.panelTab}
                        onTabChange={props.onPanelTabChange}
                        onToggle={props.onPanelToggle}
                        onClose={props.onMobilePanelClose}
                        termRef={props.termRef}
                        filter={props.filter}
                        onFilterChange={props.onFilterChange}
                        filteredAudit={props.filteredAudit}
                        onShowDiff={props.onShowDiff}
                        checkpoints={props.checkpoints}
                        onCheckpointDiff={props.onCheckpointDiff}
                        onRestoreCheckpoint={props.onRestoreCheckpoint}
                        procs={props.procs}
                        onStopProcess={props.onStopProcess}
                        browserSessions={props.browserSessions}
                        onCloseBrowserSession={props.onCloseBrowserSession}
                      />
                    </Panel>
                  </>
                ) : null}
              </Group>
            </Panel>
          </Group>
        )}
      </div>

      <StatusBar
        connected={props.connected}
        state={props.state}
        modeSource={props.modeSource}
        pendingCount={pendingCount}
        handsCmd={props.handsCmd}
        onHandsCmdChange={props.onHandsCmdChange}
        onHandsCmdSubmit={props.onHandsCmdSubmit}
        onPendingClick={() => {
          props.onActivityChange("approvals");
          if (!props.sidebarVisible) props.onSidebarToggle();
        }}
        warnTone={warnTone}
      />
    </div>
  );
}
