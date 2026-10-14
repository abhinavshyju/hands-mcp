import os from "node:os";
import { describe, expect, it } from "vitest";
import { runCommand } from "./exec.js";

describe("runCommand", () => {
  it("kills a forever command at timeout", async () => {
    const result = await runCommand({
      command: "sleep 30",
      cwd: os.tmpdir(),
      timeoutMs: 400,
    });
    expect(result.timedOut).toBe(true);
  });
});
