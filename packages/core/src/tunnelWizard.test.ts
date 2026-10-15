import { describe, expect, it } from "vitest";
import { parseTunnelCreateOutput, resolveCredentialsFile } from "./tunnelWizard.js";

describe("tunnelWizard", () => {
  it("parses cloudflared tunnel create output", () => {
    const out = `
Tunnel credentials written to /home/u/.cloudflared/abc-123-def.json
Created tunnel hands-laptop with id abc-123-def-4567-8901-234567890abc
`;
    const parsed = parseTunnelCreateOutput(out);
    expect(parsed.name).toBe("hands-laptop");
    expect(parsed.id).toBe("abc-123-def-4567-8901-234567890abc");
    expect(parsed.credentialsFile).toContain("abc-123-def.json");
  });

  it("parses id-only output", () => {
    const parsed = parseTunnelCreateOutput(
      "some log with id abc12345-6789-4123-8123-123456789abc end",
    );
    expect(parsed.id).toBe("abc12345-6789-4123-8123-123456789abc");
  });

  it("resolveCredentialsFile prefers parsed path", () => {
    expect(resolveCredentialsFile("/tmp", { parsedPath: "/etc/nonexistent.json" })).toBeUndefined();
  });
});
