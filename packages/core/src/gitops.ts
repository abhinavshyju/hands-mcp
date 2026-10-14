import { spawnSync } from "node:child_process";

function git(cwd: string, args: string[]): { stdout: string; stderr: string; status: number } {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  const res = spawnSync("git", args, { cwd, env, encoding: "utf8" });
  return { stdout: res.stdout ?? "", stderr: res.stderr ?? "", status: res.status ?? 1 };
}

export function gitStatus(cwd: string): string {
  return git(cwd, ["status", "--porcelain=v1", "-b"]).stdout;
}

export function gitDiff(cwd: string, staged = false): string {
  return git(cwd, staged ? ["diff", "--staged"] : ["diff"]).stdout;
}

export function gitLog(cwd: string, n = 20): string {
  return git(cwd, ["log", `-${n}`, "--oneline", "--decorate"]).stdout;
}

export function gitBranch(cwd: string): string {
  return git(cwd, ["branch", "-vv"]).stdout;
}

export function gitCommit(cwd: string, message: string): string {
  const r = git(cwd, ["commit", "-m", message]);
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || "git commit failed");
  return r.stdout;
}
