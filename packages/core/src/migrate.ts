import fs from "node:fs";
import path from "node:path";
import { HANDS_DIRNAME, LEGACY_EDITER_DIRNAME } from "@hands/shared";

/** Rename legacyDir → newDir when newDir is missing and legacyDir exists. */
export function migrateLegacyDirIfNeeded(legacyDir: string, newDir: string): void {
  if (fs.existsSync(newDir)) return;
  if (!fs.existsSync(legacyDir)) return;
  fs.renameSync(legacyDir, newDir);
  console.error(`[hands] Migrated ${legacyDir} → ${newDir}`);
}

export function migrateDefaultProjectDir(workspaceRoot: string): void {
  migrateLegacyDirIfNeeded(
    path.join(workspaceRoot, LEGACY_EDITER_DIRNAME),
    path.join(workspaceRoot, HANDS_DIRNAME),
  );
}
