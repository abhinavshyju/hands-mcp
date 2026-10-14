#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const uiSrc = path.join(root, "apps/ui/dist");
const uiDest = path.join(root, "packages/server/ui");

if (!fs.existsSync(uiSrc)) {
  console.warn(`sync-ui: missing ${uiSrc} (run pnpm --filter @editer/ui build first)`);
  process.exit(0);
}

fs.rmSync(uiDest, { recursive: true, force: true });
fs.cpSync(uiSrc, uiDest, { recursive: true });
