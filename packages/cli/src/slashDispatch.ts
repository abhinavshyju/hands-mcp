import {
  blockedInSessionMessage,
  catalogEntryForTokens,
  cliOnlyHint,
  resolveSlashLine,
} from "@hands/shared";
import { createProgram } from "./program.js";

const BLOCKED_IN_SESSION = new Set(["start", "stop", "review"]);

export async function dispatchSlashToCli(
  line: string,
  home?: string,
): Promise<{ handled: boolean; output?: string[]; error?: string }> {
  const tokens = resolveSlashLine(line);
  if (tokens.length === 0) return { handled: false };

  const entry = catalogEntryForTokens(tokens);
  if (entry?.kind === "local") {
    return { handled: true, output: [cliOnlyHint(tokens)] };
  }
  if (entry?.kind === "blockedInSession" || BLOCKED_IN_SESSION.has(tokens[0]!)) {
    return { handled: true, error: blockedInSessionMessage(tokens) };
  }

  const argv = ["node", "hands", ...tokens];
  if (home) argv.push("--home", home);

  const program = createProgram();
  program.exitOverride();

  const lines: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };

  try {
    await program.parseAsync(argv);
    return { handled: true, output: lines };
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (e.code === "commander.help" || e.code === "commander.version") {
      return { handled: true, output: lines.length ? lines : [e.message ?? ""] };
    }
    return { handled: true, error: e.message ?? String(err), output: lines };
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
}
