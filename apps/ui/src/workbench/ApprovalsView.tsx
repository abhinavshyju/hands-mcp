import { Button } from "@/components/ui/button";
import type { Approval } from "../api.js";
import { ScrollPane } from "./ScrollPane.js";

export function ApprovalsView({
  pending,
  onDecide,
  onApproveAll,
  onShowDiff,
}: {
  pending: Approval[];
  onDecide: (id: string, approved: boolean) => void;
  onApproveAll: () => void;
  onShowDiff: (text: string) => void;
}) {
  if (pending.length === 0) {
    return (
      <p className="px-3 py-4 text-[13px] text-muted-foreground">
        No pending approvals. Tool calls in review mode appear here.
      </p>
    );
  }

  return (
    <ScrollPane className="h-[min(100%,32rem)]">
      <div className="flex flex-col gap-2 p-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Pending ({pending.length})
          </span>
          <Button type="button" size="sm" onClick={() => void onApproveAll()}>
            Approve all
          </Button>
        </div>
        {pending.map((req) => (
          <article
            key={req.id}
            className="rounded-sm border border-border bg-background p-2 text-[13px]"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-muted-foreground">{req.tool}</span>{" "}
                <span className="text-foreground">{req.summary}</span>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button type="button" size="sm" onClick={() => void onDecide(req.id, true)}>
                  Approve
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => void onDecide(req.id, false)}
                >
                  Reject
                </Button>
                {(req.diff ?? req.preview) ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onShowDiff(req.diff ?? req.preview ?? "")}
                  >
                    Diff
                  </Button>
                ) : null}
              </div>
            </div>
            {req.command ? (
              <pre className="wb-code mt-2 max-h-32 overflow-auto">{req.command}</pre>
            ) : null}
          </article>
        ))}
      </div>
    </ScrollPane>
  );
}
