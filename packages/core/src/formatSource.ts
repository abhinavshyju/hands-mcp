import fs from "node:fs";
import path from "node:path";
import prettier from "prettier";
import { atomicWriteFile } from "./atomicWrite.js";

const FORMATTABLE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".jsonc",
  ".css",
  ".scss",
  ".less",
  ".html",
  ".vue",
  ".yaml",
  ".yml",
  ".md",
  ".mdx",
  ".graphql",
  ".gql",
]);

export interface FormatSourceResult {
  formatted: boolean;
  changed: boolean;
  warning?: string;
}

export function isFormattableSourcePath(absPath: string): boolean {
  return FORMATTABLE_EXTENSIONS.has(path.extname(absPath).toLowerCase());
}

export async function formatSourceFile(absPath: string): Promise<FormatSourceResult> {
  if (!fs.existsSync(absPath)) {
    return { formatted: false, changed: false, warning: "file missing" };
  }
  if (!isFormattableSourcePath(absPath)) {
    return { formatted: false, changed: false };
  }

  const before = fs.readFileSync(absPath, "utf8");
  try {
    const config = await prettier.resolveConfig(absPath);
    const info = await prettier.getFileInfo(absPath, {
      ignorePath: undefined,
      plugins: config?.plugins,
    });
    if (info.ignored || !info.inferredParser) {
      return { formatted: false, changed: false };
    }

    const after = await prettier.format(before, { ...config, filepath: absPath });
    if (after === before) {
      return { formatted: true, changed: false };
    }
    atomicWriteFile(absPath, after);
    return { formatted: true, changed: true };
  } catch (err) {
    return {
      formatted: false,
      changed: false,
      warning: err instanceof Error ? err.message : String(err),
    };
  }
}
