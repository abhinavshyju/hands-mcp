import { SENSITIVE_KEY_PATTERN } from "@editer/shared";

const TOKENISH = /\b(?:sk-|ghp_|github_pat_|Bearer\s+)[A-Za-z0-9._\-/=+]{8,}\b/g;

export function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(TOKENISH, "[redacted]");
  }
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY_PATTERN.test(k) ? "[redacted]" : redactValue(v);
    }
    return out;
  }
  return value;
}

export function redactText(text: string): string {
  return text.replace(TOKENISH, "[redacted]");
}
