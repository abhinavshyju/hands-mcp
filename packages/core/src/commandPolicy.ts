import { PolicyDeniedError } from "@editer/shared";

const DEFAULT_DENY = [
  /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+\/|-[a-zA-Z]*rf[a-zA-Z]*\s+\/|--no-preserve-root)/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /\b:\(\)\s*\{\s*:\s*\|\s*:\s*;\s*\}\s*;/,
  /\bcurl\b[^|;]*\|\s*(ba)?sh\b/,
  /\bwget\b[^|;]*\|\s*(ba)?sh\b/,
  /\bchmod\s+(-R\s+)?777\b/,
  /\bchown\s+-R\s+.*\s+\//,
  /\bshutdown\b/,
  /\breboot\b/,
  /\bmkfs\./,
  /\b>\s*\/dev\/sd/,
];

export function assertCommandAllowed(
  command: string,
  opts: { extraDeny?: string[]; allowlist?: string[] } = {},
): void {
  if (opts.allowlist && opts.allowlist.length > 0) {
    const ok = opts.allowlist.some((a) => command === a || command.startsWith(`${a} `));
    if (!ok) throw new PolicyDeniedError(`Command not on allowlist: ${command}`);
    return;
  }
  for (const re of DEFAULT_DENY) {
    if (re.test(command)) {
      throw new PolicyDeniedError(`Command matches destructive denylist: ${command}`);
    }
  }
  for (const extra of opts.extraDeny ?? []) {
    if (command.includes(extra) || new RegExp(extra).test(command)) {
      throw new PolicyDeniedError(`Command blocked by workspace denylist: ${command}`);
    }
  }
}
