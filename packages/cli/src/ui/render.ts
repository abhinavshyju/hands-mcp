import { colorEnabled, padEndVisible, styles, visibleWidth } from "./theme.js";

export type BadgeTone = "default" | "ok" | "warn" | "err" | "accent";

export function terminalColumns(): number {
  if (typeof process.stdout.columns === "number" && process.stdout.columns > 0) {
    return process.stdout.columns;
  }
  return 80;
}

function clampWidth(maxInner: number): number {
  const cols = terminalColumns();
  return Math.max(40, Math.min(maxInner, cols - 2));
}

export function writeln(line = ""): void {
  console.log(line);
}

export function writeWarn(message: string): void {
  console.warn(styles.warn(message));
}

export function writeErr(message: string): void {
  console.error(styles.err(message));
}

export function success(message: string): void {
  writeln(styles.ok(message));
}

export function info(message: string): void {
  writeln(message);
}

export function hint(message: string): void {
  writeln(styles.dim(message));
}

export function bullet(label: string, detail?: string): void {
  if (detail) writeln(`  ${styles.muted("•")} ${styles.bold(label)}  ${styles.dim(detail)}`);
  else writeln(`  ${styles.muted("•")} ${label}`);
}

export function rule(label?: string): void {
  const cols = terminalColumns();
  if (!label) {
    writeln(styles.border("─".repeat(Math.min(cols - 1, 72))));
    return;
  }
  const prefix = `── ${label} `;
  const vis = visibleWidth(prefix);
  const rest = Math.max(0, Math.min(cols - 1, 72) - vis);
  writeln(styles.border(prefix + "─".repeat(rest)));
}

export function badgeString(text: string, tone: BadgeTone = "default"): string {
  const inner = ` ${text} `;
  switch (tone) {
    case "ok":
      return styles.inverse(styles.ok(inner));
    case "warn":
      return styles.inverse(styles.warn(inner));
    case "err":
      return styles.inverse(styles.err(inner));
    case "accent":
      return styles.inverse(styles.accent(inner));
    default:
      return styles.inverse(styles.badge(inner));
  }
}

export function modeBadge(mode: string): string {
  const tone: BadgeTone =
    mode === "auto"
      ? "ok"
      : mode === "readonly"
        ? "warn"
        : mode === "review"
          ? "accent"
          : "default";
  return badgeString(mode, tone);
}

export interface KvPair {
  key: string;
  value: string;
  valueStyle?: (s: string) => string;
}

export function kv(pairs: KvPair[]): string[] {
  const keyWidth = Math.max(...pairs.map((p) => p.key.length), 4);
  return pairs.map((p) => {
    const keyPart = padEndVisible(styles.muted(`${p.key}:`), keyWidth + 1);
    const val = p.valueStyle ? p.valueStyle(p.value) : p.value;
    return `  ${keyPart} ${val}`;
  });
}

export function printKv(pairs: KvPair[]): void {
  for (const line of kv(pairs)) writeln(line);
}

export interface BannerOpts {
  name: string;
  version: string;
  subtitle?: string;
  lines?: KvPair[];
}

export function banner(opts: BannerOpts): string[] {
  const title = `${opts.name} ${opts.version}`;
  const inner = clampWidth(68);
  const top = `╭${"─".repeat(inner)}╮`;
  const bottom = `╰${"─".repeat(inner)}╯`;
  const out: string[] = [];
  out.push(styles.border(top));
  out.push(
    styles.border("│") +
      padEndVisible(` ${styles.bold(styles.accent(title))}`, inner) +
      styles.border("│"),
  );
  if (opts.subtitle) {
    out.push(
      styles.border("│") +
        padEndVisible(` ${styles.dim(opts.subtitle)}`, inner) +
        styles.border("│"),
    );
  }
  if (opts.lines && opts.lines.length > 0) {
    out.push(styles.border(`├${"─".repeat(inner)}┤`));
    for (const line of kv(opts.lines)) {
      const trimmed = line.trimStart();
      out.push(styles.border("│") + padEndVisible(` ${trimmed}`, inner) + styles.border("│"));
    }
  }
  out.push(styles.border(bottom));
  return out;
}

export function printBanner(opts: BannerOpts): void {
  for (const line of banner(opts)) writeln(line);
}

export function box(title: string, bodyLines: string[]): string[] {
  const inner = clampWidth(66);
  const titleLine = ` ${styles.bold(title)} `;
  const out: string[] = [];
  out.push(
    styles.border(`╭─${titleLine}${"─".repeat(Math.max(0, inner - visibleWidth(titleLine) - 1))}╮`),
  );
  for (const raw of bodyLines) {
    const wrapped = wrapBoxLine(raw, inner - 2);
    for (const w of wrapped) {
      out.push(styles.border("│") + padEndVisible(` ${w}`, inner) + styles.border("│"));
    }
  }
  out.push(styles.border(`╰${"─".repeat(inner)}╯`));
  return out;
}

function wrapBoxLine(text: string, maxVisible: number): string[] {
  const plain = text;
  if (visibleWidth(plain) <= maxVisible) return [plain];
  const lines: string[] = [];
  let rest = plain;
  while (visibleWidth(rest) > maxVisible) {
    let cut = maxVisible;
    while (cut > 0 && visibleWidth(rest.slice(0, cut)) > maxVisible) cut--;
    if (cut <= 0) cut = maxVisible;
    lines.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest.length > 0) lines.push(rest);
  return lines.length > 0 ? lines : [""];
}

export function printBox(title: string, bodyLines: string[]): void {
  for (const line of box(title, bodyLines)) writeln(line);
}

/** Pretty JSON for humans; raw JSON when color disabled (pipe-friendly). */
export function jsonBlock(value: unknown): string {
  const json = JSON.stringify(value, null, 2);
  if (!colorEnabled()) return json;
  return json
    .split("\n")
    .map((line) => {
      const keyMatch = /^(\s*)"([^"]+)":\s*(.*)$/.exec(line);
      if (keyMatch) {
        const indent = keyMatch[1] ?? "";
        const key = keyMatch[2] ?? "";
        const rest = keyMatch[3] ?? "";
        return `${indent}${styles.accent(`"${key}"`)}: ${styles.dim(rest)}`;
      }
      if (/^\s*"/.test(line)) return styles.dim(line);
      return line;
    })
    .join("\n");
}

export function printJson(value: unknown): void {
  writeln(jsonBlock(value));
}

export function helpSection(title: string, rows: Array<{ cmd: string; detail?: string }>): void {
  writeln("");
  writeln(styles.bold(title));
  for (const row of rows) {
    const cmd = row.cmd.padEnd(28);
    writeln(`  ${styles.accent(cmd)} ${styles.dim(row.detail ?? "")}`);
  }
}
