import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { ActivityId } from "./types.js";
import { IconSidebar } from "./icons.js";
import { ScrollPane } from "./ScrollPane.js";

const TITLES: Record<ActivityId, string> = {
  explorer: "Explorer",
  approvals: "Approvals",
  connect: "Connect",
  settings: "Settings",
};

export function Sidebar({
  activity,
  visible,
  mobile,
  onClose,
  onToggle,
  children,
}: {
  activity: ActivityId;
  visible: boolean;
  mobile: boolean;
  onClose: () => void;
  onToggle: () => void;
  children: ReactNode;
}) {
  if (mobile) {
    if (!visible) return null;
    return (
      <>
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/50"
          aria-label="Close sidebar"
          onClick={onClose}
        />
        <aside
          className="fixed inset-y-0 left-[var(--wb-activity-width)] z-40 flex h-full w-[min(100vw-3rem,320px)] flex-col border-r border-border bg-[var(--wb-sidebar)] shadow-xl transition-transform duration-[var(--wb-transition)]"
          aria-label={TITLES[activity]}
        >
          <SidebarHeader title={TITLES[activity]} onToggle={onToggle} onClose={onClose} showClose />
          <ScrollPane className="flex-1">{children}</ScrollPane>
        </aside>
      </>
    );
  }

  if (!visible) return null;

  return (
    <aside
      className="flex h-full min-h-0 min-w-[180px] flex-col border-r border-border bg-[var(--wb-sidebar)]"
      aria-label={TITLES[activity]}
    >
      <SidebarHeader title={TITLES[activity]} onToggle={onToggle} />
      <ScrollPane className="flex-1">{children}</ScrollPane>
    </aside>
  );
}

function SidebarHeader({
  title,
  onToggle,
  onClose,
  showClose,
}: {
  title: string;
  onToggle: () => void;
  onClose?: () => void;
  showClose?: boolean;
}) {
  return (
    <div className="flex h-[var(--wb-sidebar-header)] shrink-0 items-center justify-between border-b border-border px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      <span>{title}</span>
      <div className="flex gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Toggle sidebar"
          title="Toggle sidebar (Ctrl+B)"
          onClick={onToggle}
        >
          <IconSidebar />
        </Button>
        {showClose && onClose ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Close sidebar"
            onClick={onClose}
          >
            ×
          </Button>
        ) : null}
      </div>
    </div>
  );
}
