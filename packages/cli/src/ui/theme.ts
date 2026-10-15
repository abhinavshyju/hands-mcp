import { stripVTControlCharacters } from "node:util";

let colorOverride: boolean | undefined;

/** Test hook: force color on/off regardless of env. */
export function setColorEnabledForTests(enabled: boolean | undefined): void {
  colorOverride = enabled;
}

function envColorEnabled(): boolean {
  if (colorOverride !== undefined) return colorOverride;
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "") return false;
  if (process.env.FORCE_COLOR !== undefined && process.env.FORCE_COLOR !== "0") return true;
  if (process.env.TERM === "dumb") return false;
  return Boolean(process.stdout.isTTY);
}

export function colorEnabled(): boolean {
  return envColorEnabled();
}

type StyleFn = (s: string) => string;

function wrap(open: string, close: string): StyleFn {
  return (s: string) => (colorEnabled() ? `${open}${s}${close}` : s);
}

export const styles = {
  reset: wrap("\x1b[0m", "\x1b[0m"),
  bold: wrap("\x1b[1m", "\x1b[22m"),
  dim: wrap("\x1b[2m", "\x1b[22m"),
  /** Workbench accent ~ #0e639c */
  accent: wrap("\x1b[38;5;32m", "\x1b[39m"),
  /** Muted ~ #858585 */
  muted: wrap("\x1b[38;5;243m", "\x1b[39m"),
  ok: wrap("\x1b[38;5;78m", "\x1b[39m"),
  warn: wrap("\x1b[38;5;173m", "\x1b[39m"),
  err: wrap("\x1b[38;5;167m", "\x1b[39m"),
  /** Badge ~ #d7ba7d */
  badge: wrap("\x1b[38;5;179m", "\x1b[39m"),
  /** Status bar ~ #007acc */
  status: wrap("\x1b[38;5;39m", "\x1b[39m"),
  inverse: wrap("\x1b[7m", "\x1b[27m"),
  border: wrap("\x1b[38;5;240m", "\x1b[39m"),
};

export function visibleWidth(s: string): number {
  return stripVTControlCharacters(s).length;
}

export function padEndVisible(s: string, width: number): string {
  const pad = Math.max(0, width - visibleWidth(s));
  return s + " ".repeat(pad);
}
