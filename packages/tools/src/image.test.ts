import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HandsError } from "@hands/shared";
import { HandsRuntime } from "@hands/core";
import { imageTools } from "./image.js";
import { ToolRegistry } from "./registry.js";

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function setup() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "editer-img-home-"));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "editer-img-ws-"));
  const runtime = new HandsRuntime({ home, noTunnel: true });
  const ws = runtime.workspaces.add(root, "t");
  runtime.workspaces.setMode(ws.id, "auto");
  const registry = new ToolRegistry();
  for (const t of imageTools) registry.register(t);
  return { runtime, registry, root };
}

describe("generate_image", () => {
  it("writes a file from a stub sampler and creates a checkpoint", async () => {
    const { runtime, registry, root } = setup();
    const result = (await registry.invoke(
      "generate_image",
      {
        runtime,
        sampling: {
          available: () => true,
          createMessage: async () => ({
            content: { type: "image", data: PNG, mimeType: "image/png" },
          }),
        },
      },
      { prompt: "a red dot", path: "dot.png" },
    )) as { path: string; _media: unknown[] };
    expect(fs.existsSync(path.join(root, "dot.png"))).toBe(true);
    expect(result.path).toBe("dot.png");
    expect(result._media.length).toBe(1);
  });

  it("fails distinctly without sampling capability", async () => {
    const { runtime, registry } = setup();
    await expect(
      registry.invoke("generate_image", { runtime }, { prompt: "x", path: "x.png" }),
    ).rejects.toMatchObject({ code: "SAMPLING_UNAVAILABLE" } as Partial<HandsError>);
  });
});
