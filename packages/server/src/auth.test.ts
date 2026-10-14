import { describe, expect, it } from "vitest";
import { AuthError } from "@editer/shared";
import { EditerRuntime } from "@editer/core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("bearer tokens via runtime", () => {
  it("rejects missing/wrong and accepts valid; identity is available", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "editer-auth-"));
    const rt = new EditerRuntime({ home });
    const t = rt.tokens.create("inspector");
    expect(() => rt.tokens.authenticate(undefined)).toThrow(AuthError);
    expect(() => rt.tokens.authenticate("nope")).toThrow(AuthError);
    const got = rt.tokens.authenticate(t.token);
    expect(got.name).toBe("inspector");
    rt.audit.record({
      type: "tool.finished",
      tool: "get_config",
      clientId: got.id,
      clientName: got.name,
    });
    const events = rt.audit.query({ limit: 10 });
    expect(events[0]?.clientName).toBe("inspector");
  });
});
