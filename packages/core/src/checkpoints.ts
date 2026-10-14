import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  CHECKPOINT_META,
  EDITER_DIRNAME,
  SHADOW_GIT_DIR,
  type CheckpointRecord,
  checkpointRecordSchema,
  EditError,
} from "@editer/shared";
import { ensureDir, projectEditerDir } from "./paths.js";

function gitEnv(workspaceRoot: string): NodeJS.ProcessEnv {
  const dir = path.join(projectEditerDir(workspaceRoot), SHADOW_GIT_DIR);
  const index = path.join(projectEditerDir(workspaceRoot), "shadow.index");
  return {
    ...process.env,
    GIT_DIR: dir,
    GIT_WORK_TREE: workspaceRoot,
    GIT_INDEX_FILE: index,
    GIT_AUTHOR_NAME: "editer",
    GIT_AUTHOR_EMAIL: "editer@local",
    GIT_COMMITTER_NAME: "editer",
    GIT_COMMITTER_EMAIL: "editer@local",
  };
}

function git(workspaceRoot: string, args: string[]): string {
  const res = spawnSync("git", args, {
    cwd: workspaceRoot,
    env: gitEnv(workspaceRoot),
    encoding: "utf8",
  });
  if (res.status !== 0) {
    throw new EditError(`shadow git failed: git ${args.join(" ")}\n${res.stderr || res.stdout}`);
  }
  return res.stdout;
}

export function initShadowGit(workspaceRoot: string): void {
  const dir = path.join(projectEditerDir(workspaceRoot), SHADOW_GIT_DIR);
  ensureDir(path.dirname(dir));
  if (!fs.existsSync(path.join(dir, "HEAD"))) {
    fs.mkdirSync(dir, { recursive: true });
    const res = spawnSync("git", ["init", "--bare", dir], { encoding: "utf8" });
    if (res.status !== 0) {
      throw new EditError(`shadow git init failed: ${res.stderr || res.stdout}`);
    }
  }
  const exclude = path.join(dir, "info");
  ensureDir(exclude);
  fs.writeFileSync(
    path.join(exclude, "exclude"),
    `${EDITER_DIRNAME}/\n.git/\nnode_modules/\n`,
    "utf8",
  );
}

function metaPath(workspaceRoot: string): string {
  return path.join(projectEditerDir(workspaceRoot), CHECKPOINT_META);
}

export function listCheckpoints(workspaceRoot: string): CheckpointRecord[] {
  const p = metaPath(workspaceRoot);
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => checkpointRecordSchema.parse(JSON.parse(line)))
    .reverse();
}

export function snapshotFiles(
  workspaceRoot: string,
  files: string[],
  meta: { tool: string; clientName?: string; message?: string },
): CheckpointRecord {
  initShadowGit(workspaceRoot);
  const rels = files.map((f) => path.relative(workspaceRoot, f)).filter((r) => r && !r.startsWith(".."));
  for (const rel of rels) {
    const abs = path.join(workspaceRoot, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      git(workspaceRoot, ["add", "-f", "--", rel]);
    }
  }
  const status = git(workspaceRoot, ["status", "--porcelain"]);
  const message = meta.message ?? `checkpoint before ${meta.tool}`;
  let sha = "empty";
  if (status.trim().length > 0 || rels.length > 0) {
    try {
      git(workspaceRoot, ["commit", "-m", message, "--allow-empty"]);
    } catch {
      git(workspaceRoot, ["add", "-A"]);
      git(workspaceRoot, ["commit", "-m", message, "--allow-empty"]);
    }
    sha = git(workspaceRoot, ["rev-parse", "HEAD"]).trim();
  } else {
    git(workspaceRoot, ["commit", "-m", message, "--allow-empty"]);
    sha = git(workspaceRoot, ["rev-parse", "HEAD"]).trim();
  }
  const rec: CheckpointRecord = {
    id: randomUUID(),
    ts: Date.now(),
    tool: meta.tool,
    clientName: meta.clientName,
    files: rels,
    sha,
    message,
  };
  ensureDir(projectEditerDir(workspaceRoot));
  fs.appendFileSync(metaPath(workspaceRoot), `${JSON.stringify(rec)}\n`, "utf8");
  return rec;
}

export function restoreCheckpoint(
  workspaceRoot: string,
  id: string,
  onlyFiles?: string[],
): CheckpointRecord {
  const rec = listCheckpoints(workspaceRoot).find((c) => c.id === id || c.sha === id);
  if (!rec) throw new EditError(`Checkpoint not found: ${id}`);
  const paths = onlyFiles && onlyFiles.length > 0 ? onlyFiles : rec.files;
  if (paths.length === 0) {
    git(workspaceRoot, ["checkout", rec.sha, "--", "."]);
  } else {
    git(workspaceRoot, ["checkout", rec.sha, "--", ...paths]);
  }
  return rec;
}

export function diffCheckpoint(workspaceRoot: string, id: string): string {
  const rec = listCheckpoints(workspaceRoot).find((c) => c.id === id || c.sha === id);
  if (!rec) throw new EditError(`Checkpoint not found: ${id}`);
  const res = spawnSync("git", ["diff", rec.sha], {
    cwd: workspaceRoot,
    env: gitEnv(workspaceRoot),
    encoding: "utf8",
  });
  return res.stdout || res.stderr || "";
}

export function userGitState(workspaceRoot: string): { head: string; status: string } {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: workspaceRoot, env, encoding: "utf8" });
  const status = spawnSync("git", ["status", "--porcelain"], { cwd: workspaceRoot, env, encoding: "utf8" });
  return { head: head.stdout.trim(), status: status.stdout };
}
