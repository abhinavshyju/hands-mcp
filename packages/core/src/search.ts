import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import ignore from "ignore";
import { DEFAULT_GREP_MATCH_CAP, HANDS_DIRNAME, LEGACY_EDITER_DIRNAME } from "@hands/shared";

function findRg(): string {
  const which = spawnSync("which", ["rg"], { encoding: "utf8" });
  if (which.status === 0) return which.stdout.trim();
  return "rg";
}

export interface GrepHit {
  file: string;
  line: number;
  text: string;
}

export function grepSearch(opts: {
  cwd: string;
  pattern: string;
  glob?: string;
  globExclude?: string;
  caseInsensitive?: boolean;
  context?: number;
  maxMatches?: number;
}): { hits: GrepHit[]; truncated: boolean } {
  const max = opts.maxMatches ?? DEFAULT_GREP_MATCH_CAP;
  const args = ["--json", "-n", "--hidden", "--glob", "!.git", "--glob", "!node_modules"];
  if (opts.caseInsensitive) args.push("-i");
  if (opts.glob) args.push("--glob", opts.glob);
  if (opts.globExclude) args.push("--glob", `!${opts.globExclude}`);
  if (opts.context) args.push("-C", String(opts.context));
  args.push("--", opts.pattern, ".");
  const res = spawnSync(findRg(), args, {
    cwd: opts.cwd,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (res.error || (res.status !== 0 && res.status !== 1)) {
    return fallbackGrep(opts, max);
  }
  const hits: GrepHit[] = [];
  for (const line of (res.stdout || "").split("\n")) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line) as {
        type?: string;
        data?: { path?: { text?: string }; line_number?: number; lines?: { text?: string } };
      };
      if (obj.type !== "match") continue;
      hits.push({
        file: obj.data?.path?.text ?? "",
        line: obj.data?.line_number ?? 0,
        text: (obj.data?.lines?.text ?? "").replace(/\n$/, ""),
      });
      if (hits.length >= max) return { hits, truncated: true };
    } catch {
      // ignore
    }
  }
  return { hits, truncated: false };
}

function fallbackGrep(
  opts: {
    cwd: string;
    pattern: string;
    glob?: string;
    caseInsensitive?: boolean;
    maxMatches?: number;
  },
  max: number,
): { hits: GrepHit[]; truncated: boolean } {
  const files = fg.sync(opts.glob ?? "**/*", {
    cwd: opts.cwd,
    ignore: [
      "**/node_modules/**",
      "**/.git/**",
      `**/${HANDS_DIRNAME}/**`,
      `**/${LEGACY_EDITER_DIRNAME}/**`,
    ],
    onlyFiles: true,
    absolute: false,
  });
  const re = new RegExp(opts.pattern, opts.caseInsensitive ? "i" : undefined);
  const hits: GrepHit[] = [];
  for (const file of files) {
    const abs = path.join(opts.cwd, file);
    let text: string;
    try {
      const buf = fs.readFileSync(abs);
      if (buf.includes(0)) continue;
      text = buf.toString("utf8");
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (re.test(line)) {
        hits.push({ file, line: i + 1, text: line });
        if (hits.length >= max) return { hits, truncated: true };
      }
    }
  }
  return { hits, truncated: false };
}

export function globSearch(cwd: string, pattern: string, max = 500): string[] {
  return fg
    .sync(pattern, {
      cwd,
      ignore: ["**/node_modules/**", "**/.git/**"],
      onlyFiles: true,
      absolute: false,
    })
    .slice(0, max);
}

export function loadGitignore(cwd: string): (p: string) => boolean {
  const ig = ignore();
  const gi = path.join(cwd, ".gitignore");
  if (fs.existsSync(gi)) ig.add(fs.readFileSync(gi, "utf8"));
  ig.add([".git", "node_modules", HANDS_DIRNAME, LEGACY_EDITER_DIRNAME]);
  return (p: string) => ig.ignores(p);
}
