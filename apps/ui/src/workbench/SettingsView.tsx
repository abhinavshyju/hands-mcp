import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import type { DaemonState, ModeSource } from "../api.js";

interface Workspace {
  id: string;
  name: string;
  root: string;
  mode: string;
}

export function SettingsView({
  state,
  workspaces,
  modeScope,
  modeSource,
  newRoot,
  onNewRootChange,
  onAddWorkspace,
  onActivate,
  onSetMode,
  onModeScopeChange,
  onWorkspaceMode,
  onRemoveWorkspace,
  onRefresh,
}: {
  state: DaemonState | null;
  workspaces: Workspace[];
  modeScope: "workspace" | "project";
  modeSource: ModeSource;
  newRoot: string;
  onNewRootChange: (v: string) => void;
  onAddWorkspace: () => void;
  onActivate: (id: string) => void;
  onSetMode: (mode: string) => void;
  onModeScopeChange: (s: "workspace" | "project") => void;
  onWorkspaceMode: (id: string, mode: string) => void;
  onRemoveWorkspace: (id: string) => void;
  onRefresh: () => void;
}) {
  const [openFolder, setOpenFolder] = useState(false);
  const [manageProjects, setManageProjects] = useState(false);

  const active = state?.workspace;
  const activeRecord = active ? workspaces.find((w) => w.id === active.id) : null;
  const recent = workspaces.filter((w) => w.id !== active?.id);

  async function openProjectPath() {
    await onAddWorkspace();
    setOpenFolder(false);
  }

  return (
    <div className="space-y-4 p-3 text-[13px]">
      <section>
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Execution mode
        </h2>
        <div className="flex flex-wrap gap-2">
          <select
            className="h-8 rounded-sm border border-input bg-background px-2 text-xs"
            value={modeScope}
            onChange={(e) => onModeScopeChange(e.target.value as "workspace" | "project")}
          >
            <option value="workspace">scope: workspace</option>
            <option value="project">scope: project file</option>
          </select>
          <select
            className="h-8 rounded-sm border border-input bg-background px-2 text-xs"
            value={state?.mode ?? "review"}
            onChange={(e) => void onSetMode(e.target.value)}
          >
            <option value="readonly">readonly</option>
            <option value="review">review</option>
            <option value="auto">auto</option>
          </select>
          <span className="self-center text-[12px] text-muted-foreground">from {modeSource}</span>
        </div>
        {state?.mode === "auto" ? (
          <p className="mt-2 text-[12px] text-amber-300/90">
            Auto mode — mutating tools run without approval. Switch to review for guarded exec.
          </p>
        ) : null}
      </section>

      <Separator />

      <section>
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Project
        </h2>

        {active ? (
          <div className="rounded-sm border border-border bg-background/50 p-3">
            <p className="font-medium text-foreground">{active.name}</p>
            <p className="mt-0.5 break-all text-[11px] text-muted-foreground" title={active.root}>
              {active.root}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Workspace mode</span>
              <select
                className="h-8 rounded-sm border border-input bg-background px-2 text-xs"
                value={activeRecord?.mode ?? active.mode}
                onChange={(e) => void onWorkspaceMode(active.id, e.target.value)}
              >
                <option value="readonly">readonly</option>
                <option value="review">review</option>
                <option value="auto">auto</option>
              </select>
            </div>
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground">
            No folder open. Open a project folder to use the explorer.
          </p>
        )}

        <div className="mt-3 flex flex-col gap-2">
          {!openFolder ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="w-full justify-start"
              onClick={() => setOpenFolder(true)}
            >
              Open folder…
            </Button>
          ) : (
            <div className="space-y-2 rounded-sm border border-border p-2">
              <p className="text-[11px] text-muted-foreground">Path on this machine</p>
              <Input
                className="h-8 text-xs"
                placeholder="/path/to/project"
                value={newRoot}
                autoFocus
                onChange={(e) => onNewRootChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void openProjectPath();
                  if (e.key === "Escape") setOpenFolder(false);
                }}
              />
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={() => void openProjectPath()}>
                  Open
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setOpenFolder(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {recent.length > 0 ? (
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground" htmlFor="switch-project">
                Switch project
              </label>
              <select
                id="switch-project"
                className="h-8 w-full rounded-sm border border-input bg-background px-2 text-xs"
                value=""
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) void onActivate(id);
                  e.target.value = "";
                }}
              >
                <option value="">Choose a recent project…</option>
                {recent.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 justify-start px-2 text-xs text-muted-foreground"
            onClick={() => setManageProjects((v) => !v)}
          >
            {manageProjects ? "Hide registered folders" : "Manage registered folders…"}
          </Button>

          {manageProjects ? (
            <ul className="space-y-2 rounded-sm border border-border p-2 text-[12px]">
              {workspaces.length === 0 ? (
                <li className="text-muted-foreground">None registered</li>
              ) : null}
              {workspaces.map((w) => (
                <li
                  key={w.id}
                  className="flex items-start justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{w.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground" title={w.root}>
                      {w.root}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="shrink-0"
                    disabled={w.id === active?.id}
                    title={w.id === active?.id ? "Switch project before removing" : undefined}
                    onClick={() => void onRemoveWorkspace(w.id)}
                  >
                    Remove
                  </Button>
                </li>
              ))}
              <li>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-1 w-full"
                  onClick={() => void onRefresh()}
                >
                  Refresh list
                </Button>
              </li>
            </ul>
          ) : null}
        </div>
      </section>
    </div>
  );
}
