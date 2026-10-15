import { DEFAULT_INLINE_MEDIA_BYTES } from "@hands/shared";

export interface MediaItem {
  mimeType: string;
  base64: string;
  path?: string;
  omittedReason?: string;
}

export const MEDIA_KEY = "_media";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mediaFromBuffer(
  mimeType: string,
  bytes: Buffer,
  path?: string,
  cap = DEFAULT_INLINE_MEDIA_BYTES,
): { item: MediaItem; inline: boolean } {
  const inline = bytes.byteLength <= cap;
  return {
    inline,
    item: {
      mimeType,
      path,
      base64: inline ? bytes.toString("base64") : "",
      omittedReason: inline
        ? undefined
        : `inline image omitted (payload ${bytes.byteLength} bytes exceeds ${cap} byte cap); use the saved path`,
    },
  };
}

export function withMedia(
  summary: Record<string, unknown>,
  items: MediaItem[],
): Record<string, unknown> {
  return { ...summary, [MEDIA_KEY]: items.filter((i) => i.base64.length > 0 || i.path) };
}

export function splitToolResult(
  result: unknown,
  cap = DEFAULT_INLINE_MEDIA_BYTES,
): {
  summary: unknown;
  images: Array<{ mimeType: string; data: string }>;
} {
  if (!isRecord(result) || !Array.isArray(result[MEDIA_KEY])) {
    return { summary: result, images: [] };
  }
  const media = result[MEDIA_KEY] as unknown[];
  const images: Array<{ mimeType: string; data: string }> = [];
  const rest: unknown[] = [];
  for (const raw of media) {
    if (!isRecord(raw) || typeof raw.mimeType !== "string") {
      rest.push(raw);
      continue;
    }
    const mimeType = raw.mimeType;
    const base64 = typeof raw.base64 === "string" ? raw.base64 : "";
    const bytes = base64 ? Buffer.byteLength(base64, "base64") : 0;
    if (base64 && bytes <= cap && mimeType.startsWith("image/")) {
      images.push({ mimeType, data: base64 });
      rest.push({ mimeType, path: raw.path, inlined: true });
    } else {
      rest.push({
        mimeType,
        path: raw.path,
        inlined: false,
        note:
          (typeof raw.omittedReason === "string" && raw.omittedReason) ||
          (base64
            ? `inline image omitted (payload ${bytes} bytes exceeds ${cap} byte cap); use the saved path`
            : "no inline image"),
      });
    }
  }
  const summary = { ...result, [MEDIA_KEY]: rest };
  return { summary, images };
}

export function stripMediaForAudit(result: unknown): unknown {
  if (!isRecord(result) || !Array.isArray(result[MEDIA_KEY])) return result;
  return {
    ...result,
    [MEDIA_KEY]: (result[MEDIA_KEY] as unknown[]).map((raw) => {
      if (!isRecord(raw)) return raw;
      const { base64: _base64, ...rest } = raw;
      void _base64;
      return { ...rest, omitted: true };
    }),
  };
}
