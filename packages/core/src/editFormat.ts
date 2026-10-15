import fs from "node:fs";
import path from "node:path";
import { unifiedDiff } from "./diffutil.js";
import { formatSourceFile, isFormattableSourcePath } from "./formatSource.js";

export interface EditOptions {
  formatOnEdit?: boolean;
}

export interface EditWriteResult {
  diff: string;
  formatted?: boolean;
  formatWarning?: string;
}

export async function finalizeTextEdit(
  abs: string,
  before: string,
  options: EditOptions = {},
): Promise<EditWriteResult> {
  const formatOnEdit = options.formatOnEdit !== false;
  const baseName = path.basename(abs);
  if (!formatOnEdit || !isFormattableSourcePath(abs)) {
    const after = fs.readFileSync(abs, "utf8");
    return { diff: unifiedDiff(baseName, before, after) };
  }

  const fmt = await formatSourceFile(abs);
  const after = fs.readFileSync(abs, "utf8");
  const result: EditWriteResult = { diff: unifiedDiff(baseName, before, after) };
  if (fmt.warning) {
    result.formatted = false;
    result.formatWarning = fmt.warning;
  } else if (fmt.formatted) {
    result.formatted = true;
  }
  return result;
}
