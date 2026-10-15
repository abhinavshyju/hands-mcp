import { describe, expect, it } from "vitest";
import { createProgram } from "../program.js";
import { completeArgv } from "./complete.js";

describe("CLI completion", () => {
  const root = createProgram();

  it("suggests top-level subcommands", async () => {
    const out = await completeArgv(root, ["hands", ""], 1);
    expect(out).toContain("tunnel");
    expect(out).toContain("workspace");
    expect(out).toContain("config");
  });

  it("suggests tunnel subcommands", async () => {
    const out = await completeArgv(root, ["hands", "tunnel", "s"], 2);
    expect(out.some((s) => s.startsWith("s"))).toBe(true);
    expect(out).toContain("setup");
    expect(out).toContain("status");
    expect(out).toContain("start");
    expect(out).toContain("stop");
  });

  it("suggests tunnel set modes", async () => {
    const out = await completeArgv(root, ["hands", "tunnel", "set", "--mode", ""], 4);
    expect(out).toEqual(expect.arrayContaining(["off", "quick", "token", "named"]));
  });

  it("suggests connect clients", async () => {
    const out = await completeArgv(root, ["hands", "connect", "--client", ""], 3);
    expect(out).toEqual(expect.arrayContaining(["cursor", "claude", "generic"]));
  });

  it("suggests default session flags", async () => {
    const out = await completeArgv(root, ["hands", ".", "--t"], 2);
    expect(out.some((s) => s.startsWith("--tunnel"))).toBe(true);
  });
});
