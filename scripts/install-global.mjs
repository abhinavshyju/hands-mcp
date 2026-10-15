#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliEntry = path.join(root, "packages/cli/dist/index.js");
const binDir =
  process.env.HANDS_BIN_DIR ?? process.env.EDITER_BIN_DIR ?? path.join(os.homedir(), ".local/bin");
const shimPath = path.join(binDir, "hands");

function run(cmd, args) {
  const res = spawnSync(cmd, args, { cwd: root, stdio: "inherit", env: process.env });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

run("pnpm", ["build"]);

if (!fs.existsSync(cliEntry)) {
  console.error(`CLI build missing: ${cliEntry}`);
  process.exit(1);
}
fs.chmodSync(cliEntry, 0o755);

run("node", ["scripts/sync-ui.mjs"]);

fs.mkdirSync(binDir, { recursive: true });
const shim = `#!/usr/bin/env bash
exec node ${JSON.stringify(cliEntry)} "$@"
`;
fs.writeFileSync(shimPath, shim, { mode: 0o755 });
fs.chmodSync(shimPath, 0o755);

const onPath = (process.env.PATH ?? "").split(path.delimiter).includes(binDir);
console.log(`Installed hands -> ${shimPath}`);
if (!onPath) {
  console.log(`Add this to your shell profile:\n  export PATH="${binDir}:$PATH"`);
} else {
  console.log("You can now run `hands` from any directory.");
}
console.log(`
Examples:
  hands init
  hands workspace add .
  hands start --no-tunnel

Shell tab completion (bash):
  eval "$(hands completion bash)"
`);
