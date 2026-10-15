import fs from "node:fs";
import path from "node:path";
import { DEFAULT_FILE_SIZE_LIMIT, EditError } from "@hands/shared";
import { applyLineInfo, detectLineInfo } from "./lineEnding.js";

function tempWritePath(dest: string): string {
  const dir = path.dirname(dest);
  return path.join(
    dir,
    `.hands-write-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
}

function replaceDestFromTemp(dest: string, tmp: string): void {
  try {
    fs.renameSync(tmp, dest);
  } catch (err) {
    const code =
      err instanceof Error && "code" in err ? (err as NodeJS.ErrnoException).code : undefined;
    if (code !== "EXDEV") throw err;
    fs.copyFileSync(tmp, dest);
    fs.unlinkSync(tmp);
  }
}

function commitAtomicReplace(dest: string, writePayload: (tmpPath: string) => void): void {
  const dir = path.dirname(dest);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = tempWritePath(dest);
  try {
    writePayload(tmp);
    replaceDestFromTemp(dest, tmp);
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

export function atomicWriteFile(
  dest: string,
  contents: string,
  opts: { preserveLineEndings?: boolean; maxBytes?: number } = {},
): void {
  const max = opts.maxBytes ?? DEFAULT_FILE_SIZE_LIMIT;
  const buf = Buffer.from(contents, "utf8");
  if (buf.byteLength > max) {
    throw new EditError(`File exceeds size limit (${max} bytes)`);
  }
  let payload = contents;
  if (opts.preserveLineEndings !== false && fs.existsSync(dest)) {
    const existing = fs.readFileSync(dest, "utf8");
    payload = applyLineInfo(contents, detectLineInfo(existing));
  }
  commitAtomicReplace(dest, (tmp) => {
    fs.writeFileSync(tmp, payload, "utf8");
  });
}

export function atomicWriteBuffer(
  dest: string,
  contents: Buffer,
  opts: { maxBytes?: number } = {},
): void {
  const max = opts.maxBytes ?? DEFAULT_FILE_SIZE_LIMIT;
  if (contents.byteLength > max) {
    throw new EditError(`File exceeds size limit (${max} bytes)`);
  }
  commitAtomicReplace(dest, (tmp) => {
    fs.writeFileSync(tmp, contents);
  });
}
