import type { Command } from "commander";
import { describe, expect, it } from "vitest";
import { SLASH_CATALOG } from "@hands/shared";
import { createProgram } from "./program.js";

function walkCommandPaths(cmd: Command, prefix: string[] = []): string[][] {
  const paths: string[][] = [];
  for (const sub of cmd.commands) {
    const name = sub.name();
    if (!name || name.startsWith("_")) continue;
    const next = [...prefix, name];
    if (sub.commands.length === 0) {
      paths.push(next);
    } else {
      paths.push(...walkCommandPaths(sub, next));
    }
  }
  return paths;
}

/** Commander paths that should appear as slash commands (excluding hidden/internal). */
function expectedSlashPaths(): string[][] {
  const root = createProgram();
  const all = walkCommandPaths(root);
  const skip = new Set(["__complete", "help"]);
  return all.filter((p) => !skip.has(p[0]!));
}

function catalogPaths(): Set<string> {
  const set = new Set<string>();
  for (const e of SLASH_CATALOG) {
    if (e.picker === false && e.id.includes("__complete")) continue;
    set.add(e.tokens.join(" "));
    if (e.aliases) {
      for (const a of e.aliases) set.add(a.join(" "));
    }
  }
  return set;
}

describe("slash catalog vs Commander", () => {
  it("covers every CLI subcommand path", () => {
    const cat = catalogPaths();
    const missing: string[] = [];
    for (const path of expectedSlashPaths()) {
      const key = path.join(" ");
      const covered = cat.has(key) || SLASH_CATALOG.some((e) => e.tokens.join(" ") === key);
      if (!covered) missing.push(key);
    }
    expect(missing, `missing slash entries: ${missing.join(", ")}`).toEqual([]);
  });
});
