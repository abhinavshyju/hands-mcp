import Editor, { DiffEditor } from "@monaco-editor/react";
import { Button } from "@/components/ui/button";
import type { EditorTabId } from "./types.js";
import { IconClose } from "./icons.js";
import { breadcrumbFromPath } from "./FileTree.js";
import { cn } from "@/lib/utils";

export function EditorPane({
  file,
  diffText,
  activeTab,
  onSelectTab,
  onCloseDiff,
}: {
  file: { path: string; contents: string } | null;
  diffText: string;
  activeTab: EditorTabId;
  onSelectTab: (tab: EditorTabId) => void;
  onCloseDiff: () => void;
}) {
  const showDiff = Boolean(diffText);
  const tabs: { id: EditorTabId; label: string; closable?: boolean }[] = [];
  if (file) tabs.push({ id: "file", label: file.path.split("/").pop() ?? file.path });
  if (showDiff) tabs.push({ id: "diff", label: "Diff", closable: true });

  const effectiveTab =
    activeTab === "diff" && showDiff ? "diff" : file ? "file" : showDiff ? "diff" : "file";

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--wb-editor)]">
      <div
        className="flex h-[var(--wb-tab-height)] shrink-0 items-end gap-px border-b border-border bg-muted/30 px-1"
        role="tablist"
        aria-label="Editor tabs"
      >
        {tabs.length === 0 ? (
          <span className="px-3 pb-2 text-[12px] text-muted-foreground">No editors open</span>
        ) : (
          tabs.map((t) => {
            const active = effectiveTab === t.id;
            return (
              <div
                key={t.id}
                role="tab"
                aria-selected={active}
                className={cn(
                  "group flex max-w-[200px] items-center gap-1 border border-b-0 border-border px-3 pb-2 pt-1.5 text-[13px]",
                  active
                    ? "bg-background text-foreground"
                    : "bg-muted/50 text-muted-foreground hover:bg-accent",
                )}
              >
                <button
                  type="button"
                  className="min-w-0 truncate"
                  onClick={() => onSelectTab(t.id)}
                >
                  {t.label}
                </button>
                {t.closable ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100"
                    aria-label="Close diff"
                    onClick={onCloseDiff}
                  >
                    <IconClose />
                  </Button>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      <div className="flex shrink-0 items-center border-b border-border px-3 py-1 text-[12px] text-muted-foreground">
        {breadcrumbFromPath(file?.path ?? null)}
      </div>
      <div className="relative min-h-0 flex-1">
        {effectiveTab === "diff" && showDiff ? (
          <DiffEditor
            original={diffText}
            modified={file?.contents ?? ""}
            theme="vs-dark"
            options={{ readOnly: true, renderSideBySide: true, automaticLayout: true }}
            height="100%"
          />
        ) : file ? (
          <Editor
            value={file.contents}
            path={file.path}
            theme="vs-dark"
            options={{ readOnly: true, automaticLayout: true, minimap: { enabled: true } }}
            height="100%"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <p className="text-[13px]">Open a file from the Explorer</p>
            <p className="text-[12px] opacity-80">Hands · MCP IDE workbench</p>
          </div>
        )}
      </div>
    </div>
  );
}
