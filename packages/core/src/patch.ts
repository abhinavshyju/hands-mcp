import fs from "node:fs";
import path from "node:path";
import { EditError } from "@editer/shared";
import { atomicWriteFile } from "./atomicWrite.js";

interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
}

interface FilePatch {
  oldFile: string;
  newFile: string;
  hunks: Hunk[];
}

export function parseUnifiedDiff(patch: string): FilePatch[] {
  const files: FilePatch[] = [];
  const lines = patch.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.startsWith("--- ")) {
      const oldFile = line.slice(4).replace(/^a\//, "").split("\t")[0] ?? "";
      const plus = lines[i + 1] ?? "";
      if (!plus.startsWith("+++ ")) throw new EditError("Malformed patch: missing +++ line");
      const newFile = plus.slice(4).replace(/^b\//, "").split("\t")[0] ?? "";
      i += 2;
      const hunks: Hunk[] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith("@@")) {
        const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(lines[i] ?? "");
        if (!m) throw new EditError(`Malformed hunk header: ${lines[i]}`);
        i += 1;
        const hunkLines: string[] = [];
        while (i < lines.length) {
          const hl = lines[i] ?? "";
          if (hl.startsWith("@@") || hl.startsWith("--- ")) break;
          if (hl.startsWith("\\")) {
            i += 1;
            continue;
          }
          if (hl.startsWith(" ") || hl.startsWith("+") || hl.startsWith("-") || hl === "") {
            hunkLines.push(hl === "" ? " " : hl);
            i += 1;
            continue;
          }
          break;
        }
        hunks.push({
          oldStart: Number(m[1]),
          oldCount: m[2] !== undefined ? Number(m[2]) : 1,
          newStart: Number(m[3]),
          newCount: m[4] !== undefined ? Number(m[4]) : 1,
          lines: hunkLines,
        });
      }
      files.push({ oldFile, newFile, hunks });
      continue;
    }
    i += 1;
  }
  if (files.length === 0) throw new EditError("Patch contained no file hunks");
  return files;
}

function applyHunks(original: string, hunks: Hunk[], fileLabel: string): string {
  const src = original.split("\n");
  // If original ended with newline, split leaves a trailing empty; keep as-is for index math on line numbers (1-based).
  const out: string[] = [];
  let srcIdx = 0;
  for (const hunk of hunks) {
    const start = hunk.oldStart === 0 ? 0 : hunk.oldStart - 1;
    if (start < srcIdx) {
      throw new EditError(`Patch hunk overlaps in ${fileLabel}`);
    }
    out.push(...src.slice(srcIdx, start));
    srcIdx = start;
    for (const raw of hunk.lines) {
      const tag = raw[0] ?? " ";
      const text = raw.slice(1);
      if (tag === " ") {
        if (src[srcIdx] !== text) {
          throw new EditError(
            `Patch context drifted in ${fileLabel} at line ${srcIdx + 1}: expected ${JSON.stringify(text)}, found ${JSON.stringify(src[srcIdx])}`,
          );
        }
        out.push(src[srcIdx] ?? "");
        srcIdx += 1;
      } else if (tag === "-") {
        if (src[srcIdx] !== text) {
          throw new EditError(
            `Patch deletion mismatch in ${fileLabel} at line ${srcIdx + 1}: expected ${JSON.stringify(text)}, found ${JSON.stringify(src[srcIdx])}`,
          );
        }
        srcIdx += 1;
      } else if (tag === "+") {
        out.push(text);
      } else {
        throw new EditError(`Unknown hunk line in ${fileLabel}: ${raw}`);
      }
    }
  }
  out.push(...src.slice(srcIdx));
  return out.join("\n");
}

export function applyPatchToFiles(
  workspaceRoot: string,
  patch: string,
  resolve: (rel: string) => string,
): { files: string[]; diffs: Record<string, { before: string; after: string }> } {
  const parsed = parseUnifiedDiff(patch);
  const planned: Array<{ abs: string; rel: string; before: string; after: string; isNew: boolean; isDelete: boolean }> =
    [];
  for (const file of parsed) {
    const rel = file.newFile === "/dev/null" ? file.oldFile : file.newFile;
    const abs = resolve(rel);
    const isDelete = file.newFile === "/dev/null";
    const isNew = file.oldFile === "/dev/null" || !fs.existsSync(abs);
    const before = isNew ? "" : fs.readFileSync(abs, "utf8");
    const after = isDelete ? "" : applyHunks(before, file.hunks, rel);
    planned.push({ abs, rel, before, after, isNew, isDelete });
  }

  try {
    for (const p of planned) {
      if (p.isDelete) {
        if (fs.existsSync(p.abs)) fs.unlinkSync(p.abs);
      } else {
        atomicWriteFile(p.abs, p.after);
      }
    }
  } catch (err) {
    for (const p of planned) {
      if (p.isNew && fs.existsSync(p.abs)) fs.unlinkSync(p.abs);
      else if (!p.isNew) atomicWriteFile(p.abs, p.before);
    }
    throw err;
  }

  const diffs: Record<string, { before: string; after: string }> = {};
  for (const p of planned) diffs[path.relative(workspaceRoot, p.abs)] = { before: p.before, after: p.after };
  return { files: planned.map((p) => p.rel), diffs };
}
