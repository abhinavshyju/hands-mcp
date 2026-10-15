import type { Command, Option } from "commander";

export interface ParsedCompletionContext {
  command: Command;
  path: string[];
  /** Index of positional argument being completed (0-based among positionals only). */
  positionalIndex: number;
  /** If completing the value for this long option name (e.g. `--mode`). */
  valueForOption?: string;
  current: string;
}

function optionExpectsValue(opt: Option): boolean {
  return opt.required || opt.optional || Boolean(opt.argChoices?.length);
}

export function getSubcommandNames(cmd: Command): string[] {
  return cmd.commands.map((c) => c.name()).filter(Boolean);
}

export function getOptionFlags(cmd: Command): string[] {
  const flags: string[] = [];
  for (const opt of cmd.options) {
    if (opt.long) flags.push(opt.long);
    if (opt.short) flags.push(opt.short);
  }
  return flags;
}

export function resolveCommand(root: Command, path: string[]): Command | undefined {
  let cmd = root;
  for (const segment of path) {
    const next = cmd.commands.find((c) => c.name() === segment);
    if (!next) return undefined;
    cmd = next;
  }
  return cmd;
}

export function parseCompletionContext(
  root: Command,
  words: string[],
  cword: number,
): ParsedCompletionContext | undefined {
  let cmd = root;
  const path: string[] = [];
  let positionalIndex = 0;
  let pendingValueFor: string | undefined;
  let i = 0;

  while (i < cword) {
    const w = words[i]!;
    if (pendingValueFor) {
      pendingValueFor = undefined;
      i++;
      continue;
    }
    if (w.startsWith("-")) {
      const opt = cmd.options.find((o) => o.long === w || o.short === w);
      if (opt && optionExpectsValue(opt)) {
        pendingValueFor = opt.long ?? w;
      }
      i++;
      continue;
    }
    const sub = cmd.commands.find((c) => c.name() === w);
    if (sub) {
      path.push(w);
      cmd = sub;
      positionalIndex = 0;
      i++;
      continue;
    }
    positionalIndex++;
    i++;
  }

  const current = words[cword] ?? "";

  if (pendingValueFor) {
    return {
      command: cmd,
      path,
      positionalIndex,
      valueForOption: pendingValueFor,
      current,
    };
  }

  if (i > 0 && cword > 0) {
    const prev = words[cword - 1];
    if (prev?.startsWith("-")) {
      const opt = cmd.options.find((o) => o.long === prev || o.short === prev);
      if (opt && optionExpectsValue(opt)) {
        return {
          command: cmd,
          path,
          positionalIndex,
          valueForOption: opt.long ?? prev,
          current,
        };
      }
    }
  }

  return {
    command: cmd,
    path,
    positionalIndex,
    current,
  };
}

export function pathKey(path: string[]): string {
  return path.join(" ");
}
