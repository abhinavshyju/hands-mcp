import { Button } from "@/components/ui/button";
import type { DaemonState, ModeSource } from "../api.js";
import { SlashCommandInput } from "./SlashCommandInput.js";

export function StatusBar({
  connected,
  state,
  modeSource,
  pendingCount,
  handsCmd,
  onHandsCmdChange,
  onHandsCmdSubmit,
  onPendingClick,
  warnTone,
}: {
  connected: boolean;
  state: DaemonState | null;
  modeSource: ModeSource;
  pendingCount: number;
  handsCmd: string;
  onHandsCmdChange: (v: string) => void;
  onHandsCmdSubmit: () => void;
  onPendingClick: () => void;
  warnTone: boolean;
}) {
  const bg = !connected
    ? "var(--wb-status-error)"
    : warnTone
      ? "var(--wb-status-warn)"
      : "var(--wb-status)";

  return (
    <footer
      className="flex h-[var(--wb-status-height)] shrink-0 items-center gap-2 px-2 text-[12px] text-white"
      style={{ background: bg }}
      role="status"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-5 shrink-0 px-1 text-white hover:bg-white/10 hover:text-white"
        onClick={onPendingClick}
        title="Show approvals"
      >
        {connected ? "Live" : "Offline"}
      </Button>
      <span className="hidden truncate sm:inline" title={state?.workspace?.root}>
        {state?.workspace?.name ?? "No workspace"}
      </span>
      <span className="hidden md:inline">Mode: {state?.mode ?? "—"}</span>
      <span className="hidden lg:inline opacity-80">({modeSource})</span>
      <span className="hidden md:inline">
        Tunnel: {state?.tunnel.status ?? "—"}
        {state?.tunnel.healthy ? "" : " !"}
      </span>
      <span className="hidden sm:inline">{state?.toolCount ?? 0} tools</span>
      {pendingCount > 0 ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-5 shrink-0 px-1 font-semibold text-white underline decoration-white/50 hover:text-white"
          onClick={onPendingClick}
        >
          {pendingCount} pending
        </Button>
      ) : null}
      <div className="ml-auto flex min-w-0 max-w-md flex-1 justify-end">
        <SlashCommandInput
          value={handsCmd}
          onChange={onHandsCmdChange}
          onSubmit={onHandsCmdSubmit}
        />
      </div>
    </footer>
  );
}
