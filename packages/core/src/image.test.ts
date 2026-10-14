import { describe, expect, it } from "vitest";
import { EditerError } from "@editer/shared";
import { samplingImageSource } from "./image.js";

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("samplingImageSource", () => {
  it("throws SAMPLING_UNAVAILABLE when the client has no sampling", async () => {
    const src = samplingImageSource(undefined);
    await expect(src.generate("a cat")).rejects.toMatchObject({
      code: "SAMPLING_UNAVAILABLE",
    });
    const src2 = samplingImageSource({
      available: () => false,
      createMessage: async () => ({ content: { type: "image", data: PNG, mimeType: "image/png" } }),
    });
    await expect(src2.generate("a cat")).rejects.toBeInstanceOf(EditerError);
    await expect(src2.generate("a cat")).rejects.toMatchObject({ code: "SAMPLING_UNAVAILABLE" });
  });

  it("throws SAMPLING_NOT_IMAGE when the model returns text", async () => {
    const src = samplingImageSource({
      available: () => true,
      createMessage: async () => ({ content: { type: "text", text: "I cannot draw" } }),
    });
    await expect(src.generate("a cat")).rejects.toMatchObject({ code: "SAMPLING_NOT_IMAGE" });
  });

  it("returns bytes from image content", async () => {
    const src = samplingImageSource({
      available: () => true,
      createMessage: async () => ({
        content: { type: "image", data: PNG, mimeType: "image/png" },
      }),
    });
    const img = await src.generate("dot");
    expect(img.mimeType).toBe("image/png");
    expect(img.bytes.equals(Buffer.from(PNG, "base64"))).toBe(true);
  });
});
