import type { RefObject } from "react";
import { describeActivity } from "@hands/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AuditEvent, BrowserSessionInfo, Checkpoint, Proc } from "../api.js";
import { mediaPaths } from "./mediaPaths.js";
import type { BottomPanelTab } from "./types.js";
import { IconClose, IconPanel } from "./icons.js";

export function BottomPanel({
  visible,
  mobile,
  activeTab,
  onTabChange,
  onToggle,
  onClose,
  termRef,
  filter,
  onFilterChange,
  filteredAudit,
  onShowDiff,
  checkpoints,
  onCheckpointDiff,
  onRestoreCheckpoint,
  procs,
  onStopProcess,
  browserSessions,
  onCloseBrowserSession,
}: {
  visible: boolean;
  mobile: boolean;
  activeTab: BottomPanelTab;
  onTabChange: (t: BottomPanelTab) => void;
  onToggle: () => void;
  onClose: () => void;
  termRef: RefObject<HTMLDivElement | null>;
  filter: string;
  onFilterChange: (v: string) => void;
  filteredAudit: AuditEvent[];
  onShowDiff: (text: string) => void;
  checkpoints: Checkpoint[];
  onCheckpointDiff: (id: string) => void;
  onRestoreCheckpoint: (id: string) => void;
  procs: Proc[];
  onStopProcess: (id: string) => void;
  browserSessions: BrowserSessionInfo[];
  onCloseBrowserSession: (name: string) => void;
}) {
  if (mobile && !visible) return null;
  if (!visible && !mobile) return null;

  return (
    <div
      className={`flex min-h-0 flex-col bg-[var(--wb-sidebar)] ${mobile ? "fixed inset-x-0 bottom-[var(--wb-status-height)] top-12 z-40 border-t border-border shadow-xl" : "h-full"}`}
    >
      <Tabs
        value={activeTab}
        onValueChange={(v) => onTabChange(v as BottomPanelTab)}
        className="flex h-full min-h-0 flex-col"
      >
        <div className="flex shrink-0 items-center border-b border-border pr-1">
          <TabsList className="h-[var(--wb-tab-height)] flex-1 justify-start rounded-none bg-transparent">
            <TabsTrigger value="terminal">Terminal</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="checkpoints">Checkpoints</TabsTrigger>
            <TabsTrigger value="processes">Processes</TabsTrigger>
            <TabsTrigger value="browser">Browser</TabsTrigger>
          </TabsList>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label="Toggle panel"
            title="Toggle panel (Ctrl+J)"
            onClick={onToggle}
          >
            <IconPanel />
          </Button>
          {mobile ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label="Close panel"
              onClick={onClose}
            >
              <IconClose />
            </Button>
          ) : null}
        </div>

        <TabsContent
          value="terminal"
          forceMount
          className="relative mt-0 min-h-0 flex-1 data-[state=inactive]:hidden"
        >
          <div className="absolute inset-0 p-1" ref={termRef} />
        </TabsContent>

        <TabsContent
          value="activity"
          className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
        >
          <div className="shrink-0 border-b border-border p-2">
            <Input
              className="h-8 text-xs"
              placeholder="Filter activity"
              value={filter}
              onChange={(e) => onFilterChange(e.target.value)}
            />
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-2 text-xs">
              {filteredAudit.length === 0 ? (
                <p className="text-muted-foreground">
                  No activity yet. Connect an MCP client and make a tool call.
                </p>
              ) : null}
              {filteredAudit.map((e) => {
                const act = describeActivity(e);
                return (
                  <div key={e.id} className="mb-2 border-b border-border pb-2">
                    <div className="break-words">
                      <span className="text-muted-foreground">{act.time}</span>{" "}
                      <span className={act.failed ? "text-red-300" : "text-foreground"}>
                        {act.verb}
                      </span>{" "}
                      <span>{act.detail}</span>
                      {act.duration ? (
                        <span className="text-muted-foreground"> ({act.duration})</span>
                      ) : null}
                    </div>
                    {act.error ? <div className="text-red-400">{act.error}</div> : null}
                    {mediaPaths(e.result).map((p) => (
                      <img
                        key={p}
                        src={`/api/media?path=${encodeURIComponent(p)}`}
                        alt={p}
                        className="mt-1 max-h-40 max-w-full border border-border"
                      />
                    ))}
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="mt-1 h-auto p-0"
                      onClick={() => {
                        const r = e.result as { diff?: string } | undefined;
                        onShowDiff(r?.diff ?? JSON.stringify(e.args, null, 2));
                      }}
                    >
                      Expand
                    </Button>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent
          value="checkpoints"
          className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden"
        >
          <ScrollArea className="h-full">
            <ul className="p-2 text-xs">
              {checkpoints.map((c) => (
                <li
                  key={c.id}
                  className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-1"
                >
                  <span>
                    {new Date(c.ts).toLocaleTimeString()} {c.tool} ({c.files.length})
                  </span>
                  <span className="flex gap-2">
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() => onCheckpointDiff(c.id)}
                    >
                      Diff
                    </Button>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-amber-300"
                      onClick={() => void onRestoreCheckpoint(c.id)}
                    >
                      Restore
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="processes" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
          <ScrollArea className="h-full">
            <ul className="p-2 text-xs">
              {procs.length === 0 ? <li className="text-muted-foreground">No processes</li> : null}
              {procs.map((p) => (
                <li key={p.id} className="mb-1 flex justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {p.status} {p.command}
                    {p.detectedPort ? ` :${p.detectedPort}` : ""}
                  </span>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto shrink-0 p-0 text-red-300"
                    onClick={() => void onStopProcess(p.id)}
                  >
                    Stop
                  </Button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="browser" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
          <ScrollArea className="h-full">
            <ul className="p-2 text-xs">
              {browserSessions.length === 0 ? (
                <li className="text-muted-foreground">No browser sessions</li>
              ) : null}
              {browserSessions.map((s) => (
                <li key={s.name} className="mb-1 flex justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {s.name} {s.url} {s.consoleErrors ? `(${s.consoleErrors} err)` : ""}
                  </span>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto shrink-0 p-0 text-red-300"
                    onClick={() => void onCloseBrowserSession(s.name)}
                  >
                    Close
                  </Button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
