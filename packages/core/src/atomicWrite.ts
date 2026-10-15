import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_FILE_SIZE_LIMIT, EditError } from "@hands/shared";
import { applyLineInfo, detectLineInfo } from "./lineEnding.js";

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
  const dir = path.dirname(dest);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(
    os.tmpdir(),
    `.hands-write-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  fs.writeFileSync(tmp, payload, "utf8");
  fs.renameSync(tmp, dest);
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
  const dir = path.dirname(dest);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(
    os.tmpdir(),
    `.hands-write-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, dest);
}
