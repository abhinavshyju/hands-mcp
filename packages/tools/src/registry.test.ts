import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { HandsError } from "@hands/shared";
import { HandsRuntime } from "@hands/core";
import { ToolRegistry } from "./registry.js";

describe("tool registry", () => {
  it("turns a thrown error into a tool error without crashing", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "editer-reg-"));
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "editer-ws-"));
    const runtime = new HandsRuntime({ home, noTunnel: true });
    runtime.workspaces.add(root, "t");
    const registry = new ToolRegistry();
    registry.register({
      name: "boom",
      description: "throws",
      group: "meta",
      mutating: false,
      schema: z.object({}),
      handler: () => {
        throw new Error("kaboom");
      },
    });
    await expect(registry.invoke("boom", { runtime }, {})).rejects.toBeInstanceOf(HandsError);
  });
});
