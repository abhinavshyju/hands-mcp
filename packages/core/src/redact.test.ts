import { describe, expect, it } from "vitest";
import { redactValue } from "./redact.js";

describe("redact", () => {
  it("redacts token-like fields and bearer strings", () => {
    const out = redactValue({
      token: "secret-value",
      nested: { api_key: "abc" },
      cmd: "Authorization Bearer sk-abcdefghijklmnop",
    }) as Record<string, unknown>;
    expect(out.token).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).api_key).toBe("[redacted]");
    expect(String(out.cmd)).toContain("[redacted]");
  });
});
