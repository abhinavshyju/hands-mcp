import type { JSX } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ActivityId } from "./types.js";
import { IconApprovals, IconConnect, IconExplorer, IconSettings } from "./icons.js";
import { cn } from "@/lib/utils";

const ITEMS: { id: ActivityId; label: string; Icon: () => JSX.Element }[] = [
  { id: "explorer", label: "Explorer", Icon: IconExplorer },
  { id: "approvals", label: "Approvals", Icon: IconApprovals },
  { id: "connect", label: "Connect MCP", Icon: IconConnect },
  { id: "settings", label: "Settings", Icon: IconSettings },
];

export function ActivityBar({
  active,
  pendingCount,
  onSelect,
}: {
  active: ActivityId;
  pendingCount: number;
  onSelect: (id: ActivityId) => void;
}) {
  return (
    <nav
      className="flex h-full w-[var(--wb-activity-width)] shrink-0 flex-col items-center border-r border-border bg-[var(--wb-activity)] py-1"
      aria-label="Primary sidebar"
    >
      {ITEMS.map(({ id, label, Icon }) => {
        const isActive = active === id;
        return (
          <Button
            key={id}
            type="button"
            variant="ghost"
            size="icon"
            aria-label={label}
            aria-current={isActive ? "page" : undefined}
            title={label}
            className={cn(
              "relative mb-1 h-12 w-12 rounded-none text-muted-foreground hover:bg-accent hover:text-foreground",
              isActive &&
                "text-foreground before:absolute before:left-0 before:top-2 before:h-8 before:w-0.5 before:bg-white",
            )}
            onClick={() => onSelect(id)}
          >
            <Icon />
            {id === "approvals" && pendingCount > 0 ? (
              <Badge
                variant="warning"
                className="absolute right-0.5 top-0.5 h-4 min-w-4 justify-center px-1 text-[10px]"
              >
                {pendingCount > 9 ? "9+" : pendingCount}
              </Badge>
            ) : null}
          </Button>
        );
      })}
    </nav>
  );
}
