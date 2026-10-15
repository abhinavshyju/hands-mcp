import type { AuditEvent } from "@hands/shared";
import { describeActivity, wrapActivityText } from "@hands/shared";
import { padEndVisible, styles } from "./theme.js";

const VERB_COL = 8;
const TIME_COL = 10;

function padVerbVisible(verb: string): string {
  const styled = verb.startsWith("✗") ? styles.err(verb) : styles.accent(verb);
  return padEndVisible(styled, VERB_COL);
}

/** Colorized activity lines (CLI-only; shared stays plain). */
export function formatColoredActivityLines(
  e: AuditEvent,
  opts?: { verbose?: boolean; terminalWidth?: number },
): string[] {
  const d = describeActivity(e, { verbose: opts?.verbose });
  const width = opts?.terminalWidth ?? 80;
  const indent = " ".repeat(TIME_COL + 1 + VERB_COL);

  const timePart = styles.dim(d.time);
  const verbPart = padVerbVisible(d.verb);
  const headPrefix = `${timePart}  ${verbPart}`;

  const detailLines = wrapActivityText(d.detail, width, indent);
  const lines: string[] = [];
  lines.push(`${headPrefix}${detailLines[0] ?? ""}`);
  for (let i = 1; i < detailLines.length; i++) {
    lines.push(detailLines[i]!);
  }

  const secondary: string[] = [];
  if (d.cwd) secondary.push(styles.dim(`cwd ${d.cwd}`));
  if (d.background) secondary.push(styles.dim("(bg)"));
  if (d.duration) secondary.push(styles.dim(`(${d.duration})`));
  if (d.meta) secondary.push(styles.muted(d.meta));

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
      const full = el.startsWith(indent) ? el : `${indent}${el}`;
      lines.push(styles.err(full));
    }
  }

  return lines;
}
