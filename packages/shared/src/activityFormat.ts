import type { AuditEvent } from "./schemas.js";

export interface ActivityDescription {
  time: string;
  verb: string;
  detail: string;
  cwd?: string;
  duration?: string;
  failed: boolean;
  error?: string;
  background?: boolean;
  /** Extra context for verbose mode */
  meta?: string;
}

const TOOL_VERBS: Record<string, string> = {
  run_command: "Run",
  start_process: "Start",
  write_file: "Write",
  create_file: "Write",
  str_replace: "Edit",
  multi_edit: "Edit",
  apply_patch: "Edit",
  delete_path: "Delete",
  move_path: "Move",
  git_commit: "Commit",
  restore_checkpoint: "Restore",
};

function formatLocalTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const s = d.getSeconds().toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function formatDurationMs(ms: number | undefined): string | undefined {
  if (ms === undefined) return undefined;
  if (ms >= 1000) {
    const sec = ms / 1000;
    return sec >= 10 ? `${Math.round(sec)}s` : `${sec.toFixed(1)}s`;
  }
  return `${ms}ms`;
}

/** Split `cd <dir> && <rest>` when the cd target has no unquoted `&&`. */
export function peelCwdFromCommand(command: string): { cwd?: string; command: string } {
  const trimmed = command.trim();
  const cdMatch = /^cd\s+((?:[^\s'"]+|'[^']*'|"[^"]*")+)\s+&&\s+([\s\S]*)$/u.exec(trimmed);
  if (!cdMatch) return { command: trimmed };
  let cwd = cdMatch[1]!;
  if ((cwd.startsWith("'") && cwd.endsWith("'")) || (cwd.startsWith('"') && cwd.endsWith('"'))) {
    cwd = cwd.slice(1, -1);
  }
  return { cwd, command: cdMatch[2]!.trim() };
}

/** Collapse heredocs and long inline scripts to a one-line summary. */
export function summarizeCommand(command: string): string {
  const trimmed = command.trim();
  if (!trimmed) return "(empty)";

  const catRedirect = /^cat\s+>\s+(\S+)\s*<<[\s\S]*$/u.exec(trimmed);
  if (catRedirect) {
    return `write ${catRedirect[1]}`;
  }

  const pythonHeredoc = /^python3?\s+(?:--input-type=\S+\s+)?<<[\s\S]*$/u.exec(trimmed);
  if (pythonHeredoc) {
    return "python script";
  }

  const nodeHeredoc = /^node\s+(?:--input-type=\S+\s+)?<<[\s\S]*$/u.exec(trimmed);
  if (nodeHeredoc) {
    return "node script";
  }

  const firstLine = trimmed.split("\n")[0] ?? trimmed;
  return firstLine.replace(/\s+/g, " ").trim();
}

function argsRecord(e: AuditEvent): Record<string, unknown> | undefined {
  if (e.args && typeof e.args === "object" && !Array.isArray(e.args)) {
    return e.args as Record<string, unknown>;
  }
  return undefined;
}

function verbForEvent(e: AuditEvent): string {
  if (e.tool && TOOL_VERBS[e.tool]) return TOOL_VERBS[e.tool]!;
  if (e.tool) return e.tool.replace(/_/g, " ");
  return e.type.replace(/\./g, " ");
}

function detailFromArgs(e: AuditEvent): { detail: string; cwd?: string; background?: boolean } {
  const args = argsRecord(e);
  if (!args) return { detail: "" };

  if (typeof args.path === "string") {
    return { detail: args.path };
  }
  if (typeof args.from === "string" && typeof args.to === "string") {
    return { detail: `${args.from} → ${args.to}` };
  }
  if (typeof args.message === "string") {
    return { detail: args.message };
  }
  if (typeof args.id === "string") {
    return { detail: args.id.slice(0, 12) };
  }
  if (typeof args.command === "string") {
    const peeled = peelCwdFromCommand(args.command);
    const summary = summarizeCommand(peeled.command);
    const background = e.tool === "start_process";
    return { detail: summary, cwd: peeled.cwd, background };
  }
  return { detail: "" };
}

export function describeActivity(e: AuditEvent, opts?: { verbose?: boolean }): ActivityDescription {
  const failed = e.type === "tool.error" || Boolean(e.error);
  const { detail, cwd, background } = detailFromArgs(e);
  let verb = verbForEvent(e);
  if (failed) verb = `✗ ${verb}`;

  const metaParts: string[] = [];
  if (opts?.verbose) {
    metaParts.push(e.type);
    if (e.clientName) metaParts.push(e.clientName);
    if (e.tool && !TOOL_VERBS[e.tool]) metaParts.push(e.tool);
  }

  let error: string | undefined;
  if (failed) {
    error = e.error ?? "failed";
    if (!detail && e.tool) {
      return {
        time: formatLocalTime(e.ts),
        verb,
        detail: e.tool,
        cwd,
        duration: formatDurationMs(e.durationMs),
        failed: true,
        error,
        background,
        meta: metaParts.length ? metaParts.join(" · ") : undefined,
      };
    }
  }

  return {
    time: formatLocalTime(e.ts),
    verb,
    detail: detail || (e.tool ?? e.type),
    cwd,
    duration: formatDurationMs(e.durationMs),
    failed,
    error,
    background,
    meta: metaParts.length ? metaParts.join(" · ") : undefined,
  };
}

const VERB_COL = 8;
const TIME_COL = 10;

function padVerb(verb: string): string {
  return verb.padEnd(VERB_COL);
}

/** Wrap `text` to fit within `width`, with optional first-line prefix already consumed. */
export function wrapActivityText(text: string, width: number, indent: string): string[] {
  if (width < 20) width = 80;
  const maxLine = Math.max(20, width - indent.length);
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    if (next.length <= maxLine) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = w.length > maxLine ? `${w.slice(0, maxLine - 1)}…` : w;
    }
  }
  if (current) lines.push(current);
  return lines.map((line, i) => (i === 0 ? line : `${indent}${line}`));
}

/** Format one audit event as human-readable CLI lines. */
export function formatActivityLines(
  e: AuditEvent,
  opts?: { verbose?: boolean; terminalWidth?: number },
): string[] {
  const d = describeActivity(e, { verbose: opts?.verbose });
  const width = opts?.terminalWidth ?? 80;
  const indent = " ".repeat(TIME_COL + 1 + VERB_COL);

  const headPrefix = `${d.time}  ${padVerb(d.verb)}`;
  const detailLines = wrapActivityText(d.detail, width, indent);
  const lines: string[] = [];
  lines.push(`${headPrefix}${detailLines[0] ?? ""}`);
  for (let i = 1; i < detailLines.length; i++) {
    lines.push(detailLines[i]!);
  }

  const secondary: string[] = [];
  if (d.cwd) secondary.push(`cwd ${d.cwd}`);
  if (d.background) secondary.push("(bg)");
  if (d.duration) secondary.push(`(${d.duration})`);
  if (d.meta) secondary.push(d.meta);

  if (secondary.length > 0) {
    const secText = secondary.join("  ");
    const secLines = wrapActivityText(secText, width, indent);
    for (const sl of secLines) {
      lines.push(sl.startsWith(indent) ? sl : `${indent}${sl}`);
    }
  }

  if (d.error) {
    const errLines = wrapActivityText(`error: ${d.error}`, width, indent);
    for (const el of errLines) {
      lines.push(el.startsWith(indent) ? el : `${indent}${el}`);
    }
  }

  return lines;
}

/** Single-line summary for tight displays (optional). */
export function formatActivityOneLine(e: AuditEvent): string {
  const d = describeActivity(e);
  const parts = [`${d.time}`, d.verb, d.detail];
  if (d.duration) parts.push(`(${d.duration})`);
  return parts.join("  ");
}
