import type { Command } from "commander";
import type { HandsRuntime } from "@hands/core";
import { DaemonClient } from "@hands/core";
import { DEFAULT_SESSION_FLAGS, SUBCOMMANDS } from "../subcommands.js";
import { CONFIG_KEYS, OPTION_VALUES } from "./values.js";
import {
  getOptionFlags,
  getSubcommandNames,
  parseCompletionContext,
  pathKey,
  resolveCommand,
} from "./walk.js";

export function normalizeCompletionWords(
  words: string[],
  cword: number,
): { words: string[]; cword: number } {
  if (words[0] === "hands") {
    return { words: words.slice(1), cword: Math.max(0, cword - 1) };
  }
  return { words, cword };
}

function filterPrefix(candidates: string[], partial: string): string[] {
  if (!partial) return [...new Set(candidates)].sort();
  const p = partial.toLowerCase();
  return [...new Set(candidates)].filter((c) => c.toLowerCase().startsWith(p)).sort();
}

function lookupOptionValues(path: string[], option: string): string[] | undefined {
  const key = pathKey(path);
  return OPTION_VALUES[key]?.[option] ?? OPTION_VALUES[""]?.[option];
}

function lookupPositionalValues(path: string[], positionalIndex: number): string[] | undefined {
  const key = pathKey(path);
  const args = OPTION_VALUES[key];
  if (!args) return undefined;
  if (positionalIndex === 0 && args["<mode>"]) return args["<mode>"];
  if (positionalIndex === 0 && args["<id>"]) return args["<id>"];
  return undefined;
}

async function dynamicValues(
  path: string[],
  ctx: { valueForOption?: string; positionalIndex: number },
  rt: HandsRuntime | undefined,
): Promise<string[]> {
  if (!rt) return [];

  const key = pathKey(path);

  if (ctx.valueForOption === "--workspace") {
    return rt.workspaces.list().flatMap((w) => [w.id, w.name]);
  }

  if (key === "workspace use" || key === "workspace remove" || key === "workspace mode") {
    if (ctx.positionalIndex === 0 && !ctx.valueForOption) {
      return rt.workspaces.list().flatMap((w) => [w.id, w.name]);
    }
  }

  if (key === "config get" || key === "config unset") {
    if (ctx.positionalIndex === 0 && !ctx.valueForOption) {
      return CONFIG_KEYS;
    }
  }

  if (key === "approvals approve" || key === "approvals reject") {
    if (ctx.positionalIndex === 0 && !ctx.valueForOption) {
      try {
        const client = DaemonClient.fromPaths(rt.paths);
        if (await client.isRunning()) {
          const pending = await client.approvals();
          return pending.filter((a) => a.status === "pending").map((a) => a.id);
        }
      } catch {
        // ignore
      }
    }
  }

  if (key === "token revoke" && ctx.positionalIndex === 0) {
    return rt.tokens.list().map((t) => t.id);
  }

  return [];
}

function completeDefaultSession(words: string[], cword: number): string[] {
  const current = words[cword] ?? "";
  if (cword === 0) {
    return filterPrefix([...SUBCOMMANDS, ".", ".."], current);
  }
  return filterPrefix(DEFAULT_SESSION_FLAGS, current);
}

export async function completeArgv(
  root: Command,
  words: string[],
  cword: number,
  rt?: HandsRuntime,
): Promise<string[]> {
  const normalized = normalizeCompletionWords(words, cword);
  words = normalized.words;
  cword = normalized.cword;

  if (words.length === 0) {
    return [...SUBCOMMANDS].sort();
  }

  const first = words[0]!;
  if (!SUBCOMMANDS.has(first)) {
    return completeDefaultSession(words, cword);
  }

  const parsed = parseCompletionContext(root, words, cword);
  if (!parsed) return [];

  const { command, path, positionalIndex, valueForOption, current } = parsed;

  if (valueForOption) {
    const staticVals = lookupOptionValues(path, valueForOption) ?? [];
    const dynamic = await dynamicValues(path, { valueForOption, positionalIndex }, rt);
    return filterPrefix([...staticVals, ...dynamic], current);
  }

  if (current.startsWith("-")) {
    return filterPrefix(getOptionFlags(command), current);
  }

  const subs = getSubcommandNames(command);
  if (subs.length > 0) {
    return filterPrefix(subs, current);
  }

  const staticPos = lookupPositionalValues(path, positionalIndex) ?? [];
  const dynamic = await dynamicValues(path, { positionalIndex }, rt);
  const combined = [...staticPos, ...dynamic];
  if (combined.length > 0) {
    return filterPrefix(combined, current);
  }

  return [];
}

export function topLevelSubcommands(root: Command): string[] {
  return getSubcommandNames(root);
}

export { resolveCommand, pathKey };
