import type { ReactNode } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

/** Full-height scroll region for sidebar and panel lists. */
export function ScrollPane({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <ScrollArea className={cn("min-h-0 flex-1", className)}>
      <div className="pr-2">{children}</div>
    </ScrollArea>
  );
}
