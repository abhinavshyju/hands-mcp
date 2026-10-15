/**
 * Readline prompt styling.
 *
 * Node readline strips VT sequences when measuring cursor position, so a
 * colored single-line prompt is safe. A true multi-line bordered input box is
 * not supported — readline only tracks one input line.
 */
import { modeBadge, terminalColumns } from "./render.js";
import { styles, visibleWidth } from "./theme.js";

export function promptString(mode?: string): string {
  const badge = mode ? modeBadge(mode) : "";
  const cols = terminalColumns();
  if (badge && cols > 40) {
    const prefix = styles.border("╰─ ") + styles.accent("❯ ");
    const pad = Math.max(0, cols - visibleWidthForPrompt(prefix, badge) - 1);
    return `${prefix}${" ".repeat(Math.min(pad, 8))}${badge} `;
  }
  return styles.border("╰─ ") + styles.accent("❯ ");
}

function visibleWidthForPrompt(prefix: string, badge: string): number {
  return visibleWidth(prefix) + visibleWidth(badge);
}

export interface StatusLineOpts {
  mode: string;
  url?: string;
  pending?: number;
}

export function formatStatusLine(opts: StatusLineOpts): string {
  const parts: string[] = [modeBadge(opts.mode)];
  if (opts.url) parts.push(styles.dim(opts.url));
  if (opts.pending !== undefined && opts.pending > 0) {
    parts.push(styles.warn(`${opts.pending} pending`));
  }
  return styles.border("─".repeat(8)) + " " + parts.join(styles.dim(" · "));
}

export function printStatusLine(opts: StatusLineOpts): void {
  console.log(formatStatusLine(opts));
}
