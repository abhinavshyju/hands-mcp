import type { Command } from "commander";
import { completeArgv } from "../completion/complete.js";
import {
  bashCompletionScript,
  fishCompletionScript,
  zshCompletionScript,
} from "../completion/scripts.js";
import { runtimeFromOpts } from "../runtime-opts.js";
import type { createProgram } from "../program.js";

type ProgramFactory = typeof createProgram;

function parseCompleteArgv(): { words: string[]; cword: number } {
  const argv = process.argv;
  const start = argv.indexOf("__complete") + 1;
  let cword = 0;
  const words: string[] = [];
  for (let i = start; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--cword" && argv[i + 1]) {
      cword = Number(argv[++i]);
      continue;
    }
    if (a === "--") {
      words.push(...argv.slice(i + 1));
      break;
    }
  }
  return { words, cword };
}

export function registerCompletion(program: Command, createProgramFn: ProgramFactory): void {
  const completion = program
    .command("completion")
    .description("Shell tab completion scripts and suggestions");

  completion
    .command("bash")
    .description("Print bash completion script")
    .action(() => {
      process.stdout.write(bashCompletionScript("hands"));
    });

  completion
    .command("zsh")
    .description("Print zsh completion script")
    .action(() => {
      process.stdout.write(zshCompletionScript("hands"));
    });

  completion
    .command("fish")
    .description("Print fish completion script")
    .action(() => {
      process.stdout.write(fishCompletionScript("hands"));
    });

  completion
    .command("install")
    .description("Print setup instructions for shell completion")
    .option("--write", "Append bash eval line to ~/.bashrc (explicit opt-in)")
    .action(async (opts: { write?: boolean }) => {
      process.stdout.write(`# Add to ~/.bashrc or ~/.zshrc:
eval "$(hands completion bash)"

# Zsh (with zfunc):
mkdir -p ~/.zfunc
hands completion zsh > ~/.zfunc/_hands
# then add to .zshrc: fpath=(~/.zfunc $fpath); autoload -Uz compinit; compinit

# Fish:
hands completion fish > ~/.config/fish/completions/hands.fish
`);
      if (opts.write) {
        const fs = await import("node:fs");
        const os = await import("node:os");
        const path = await import("node:path");
        const bashrc = path.join(os.homedir(), ".bashrc");
        const line = '\neval "$(hands completion bash)"\n';
        fs.appendFileSync(bashrc, line, "utf8");
        const { success } = await import("../ui/render.js");
        success(`Appended bash completion to ${bashrc}`);
      }
    });

  program
    .command("__complete")
    .description("Internal: completion candidates")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async () => {
      const { words, cword } = parseCompleteArgv();
      const root = createProgramFn();
      let rt;
      try {
        rt = runtimeFromOpts({});
      } catch {
        rt = undefined;
      }
      const suggestions = await completeArgv(root, words, cword, rt);
      for (const s of suggestions) {
        console.log(s);
      }
    });
}
