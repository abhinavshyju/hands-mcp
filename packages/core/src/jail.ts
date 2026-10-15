import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PathJailError, DEFAULT_READ_DENY_GLOBS, DEFAULT_WRITE_DENY_GLOBS } from "@hands/shared";

function normalizeSeparators(p: string): string {
  return p.replaceAll("\\", "/");
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replaceAll("\\", "/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("**", ":::GLOBSTAR:::")
    .replaceAll("*", "[^/]*")
    .replaceAll(":::GLOBSTAR:::", ".*")
    .replaceAll("?", ".");
  return new RegExp(`^${escaped}$`, "i");
}

function matchesGlob(rel: string, globs: string[]): boolean {
  const n = normalizeSeparators(rel);
  return globs.some((g) => globToRegExp(g).test(n) || globToRegExp(g).test(n.replace(/^\.\//, "")));
}

function existingAncestor(p: string): string {
  let current = p;
  while (current !== path.dirname(current)) {
    try {
      fs.lstatSync(current);
      return current;
    } catch {
      current = path.dirname(current);
    }
  }
  return current;
}

function realpathSafe(p: string): string {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return path.resolve(p);
  }
}

function isInside(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export interface JailOptions {
  workspaceRoot: string;
  input: string;
  op: "read" | "write";
  extraDenylist?: string[];
}

export function resolvePath(opts: JailOptions): string {
  const workspaceRoot = realpathSafe(path.resolve(opts.workspaceRoot));
  if (!fs.existsSync(workspaceRoot) || !fs.statSync(workspaceRoot).isDirectory()) {
    throw new PathJailError(`Workspace root does not exist: ${opts.workspaceRoot}`);
  }

  const raw = normalizeSeparators(opts.input);
  const joined = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(workspaceRoot, raw);

  const ancestor = existingAncestor(joined);
  const resolvedAncestor = realpathSafe(ancestor);
  const rest = path.relative(ancestor, joined);
  const resolved = rest ? path.resolve(resolvedAncestor, rest) : resolvedAncestor;

  if (!isInside(workspaceRoot, resolved)) {
    throw new PathJailError(`Path escapes workspace: ${opts.input}`);
  }

  const rel = normalizeSeparators(path.relative(workspaceRoot, resolved));
  const denylist = [
    ...(opts.extraDenylist ?? []),
    ...(opts.op === "read" ? DEFAULT_READ_DENY_GLOBS : DEFAULT_WRITE_DENY_GLOBS),
  ];
  if (matchesGlob(rel, denylist) || matchesGlob(`/${rel}`, denylist)) {
    throw new PathJailError(`Path is denylisted for ${opts.op}: ${rel}`);
  }

  const home = realpathSafe(os.homedir());
  const sensitive = [".ssh", ".aws", ".gnupg"];
  for (const dir of sensitive) {
    const blocked = path.join(home, dir);
    if (isInside(blocked, resolved) || resolved === blocked) {
      throw new PathJailError(`Refusing access to ${dir}`);
    }
  }

  if (opts.op === "write") {
    const segs = rel.split("/");
    if (segs.includes("node_modules")) {
      throw new PathJailError("Writes under node_modules are blocked");
    }
    if (rel === ".git" || rel.startsWith(".git/")) {
      throw new PathJailError("Writes under .git are blocked");
    }
  }

  return resolved;
}

export function assertInside(workspaceRoot: string, candidate: string): string {
  return resolvePath({ workspaceRoot, input: candidate, op: "read", extraDenylist: [] });
}
