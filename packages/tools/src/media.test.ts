import { describe, expect, it } from "vitest";
import { mediaFromBuffer, splitToolResult, stripMediaForAudit, withMedia } from "./media.js";

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("media split", () => {
  it("emits image blocks under the cap", () => {
    const { item } = mediaFromBuffer("image/png", tinyPng, "shot.png");
    const result = withMedia({ path: "shot.png" }, [item]);
    const { summary, images } = splitToolResult(result);
    expect(images).toEqual([{ mimeType: "image/png", data: tinyPng.toString("base64") }]);
    expect(summary).toMatchObject({ path: "shot.png" });
  });

  it("omits oversized inline payloads", () => {
    const huge = Buffer.alloc(2 * 1024 * 1024, 1);
    const { item, inline } = mediaFromBuffer("image/png", huge, "big.png", 100);
    expect(inline).toBe(false);
    const { images, summary } = splitToolResult(withMedia({ path: "big.png" }, [item]), 100);
    expect(images).toEqual([]);
    expect(JSON.stringify(summary)).toContain("inline image omitted");
  });

  it("strips base64 from audit copies", () => {
    const { item } = mediaFromBuffer("image/png", tinyPng, "shot.png");
    const audited = stripMediaForAudit(withMedia({ path: "shot.png" }, [item])) as {
      _media: Array<{ base64?: string; path?: string; omitted?: boolean }>;
    };
    expect(audited._media[0]?.base64).toBeUndefined();
    expect(audited._media[0]?.path).toBe("shot.png");
    expect(audited._media[0]?.omitted).toBe(true);
  });
});
