import fs from "node:fs";
import path from "node:path";
import { EditError } from "@hands/shared";
import { atomicWriteFile } from "./atomicWrite.js";
import { type EditOptions, type EditWriteResult, finalizeTextEdit } from "./editFormat.js";

export type { EditOptions, EditWriteResult };

export async function writeFile(
  abs: string,
  contents: string,
  options: EditOptions = {},
): Promise<EditWriteResult> {
  const before = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
  atomicWriteFile(abs, contents);
  return finalizeTextEdit(abs, before, options);
}

export async function createFile(
  abs: string,
  contents: string,
  options: EditOptions = {},
): Promise<EditWriteResult> {
  if (fs.existsSync(abs)) throw new EditError(`File already exists: ${abs}`);
  atomicWriteFile(abs, contents, { preserveLineEndings: false });
  return finalizeTextEdit(abs, "", options);
}

export function deletePath(abs: string): void {
  if (!fs.existsSync(abs)) throw new EditError(`Path does not exist: ${abs}`);
  const stat = fs.lstatSync(abs);
  if (stat.isDirectory()) fs.rmSync(abs, { recursive: true, force: false });
  else fs.unlinkSync(abs);
}

export function movePath(from: string, to: string): void {
  if (!fs.existsSync(from)) throw new EditError(`Path does not exist: ${from}`);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
}

export async function strReplace(
  abs: string,
  oldString: string,
  newString: string,
  expectedOccurrences?: number,
  options: EditOptions = {},
): Promise<EditWriteResult & { occurrences: number }> {
  if (!fs.existsSync(abs)) throw new EditError(`File does not exist: ${abs}`);
  const before = fs.readFileSync(abs, "utf8");
  if (oldString.length === 0) throw new EditError("old_string must not be empty");

  let count = 0;
  let idx = 0;
  while (true) {
    const found = before.indexOf(oldString, idx);
    if (found === -1) break;
    count += 1;
    idx = found + oldString.length;
  }

  if (count === 0) {
    throw new EditError(
      `No exact match for old_string in ${path.basename(abs)}. Provide a unique snippet copied from the file.`,
    );
  }
  const expected = expectedOccurrences ?? 1;
  if (count !== expected) {
    throw new EditError(
      `old_string matched ${count} times but expected ${expected}. Provide more surrounding context or set expected_occurrences.`,
    );
  }

  const after = before.split(oldString).join(newString);
  atomicWriteFile(abs, after);
  const finalized = await finalizeTextEdit(abs, before, options);
  return { ...finalized, occurrences: count };
}

export async function multiEdit(
  abs: string,
  edits: Array<{ old_string: string; new_string: string; expected_occurrences?: number }>,
  options: EditOptions = {},
): Promise<EditWriteResult> {
  if (!fs.existsSync(abs)) throw new EditError(`File does not exist: ${abs}`);
  const original = fs.readFileSync(abs, "utf8");
  let current = original;
  try {
    for (const [i, edit] of edits.entries()) {
      const tmp = `${abs}.__hands_multi`;
      fs.writeFileSync(tmp, current, "utf8");
      try {
        await strReplace(tmp, edit.old_string, edit.new_string, edit.expected_occurrences, {
          formatOnEdit: false,
        });
        current = fs.readFileSync(tmp, "utf8");
      } catch (err) {
        throw new EditError(
          `multi_edit failed at step ${i + 1}: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      }
    }
    atomicWriteFile(abs, current);
    return finalizeTextEdit(abs, original, options);
  } catch (err) {
    atomicWriteFile(abs, original);
    throw err;
  }
}
