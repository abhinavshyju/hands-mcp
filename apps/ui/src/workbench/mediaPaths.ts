export function mediaPaths(result: unknown): string[] {
  if (!result || typeof result !== "object") return [];
  const rec = result as { path?: unknown; _media?: unknown };
  const out: string[] = [];
  if (Array.isArray(rec._media)) {
    for (const item of rec._media) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as { path?: unknown }).path === "string"
      ) {
        out.push((item as { path: string }).path);
      }
    }
  }
  if (typeof rec.path === "string" && rec.path.includes("media") && !out.includes(rec.path)) {
    out.push(rec.path);
  }
  return out;
}
