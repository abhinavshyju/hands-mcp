import { useCallback, useEffect, useState } from "react";
import { api, type TreeEntry } from "../api.js";
import { IconChevron, IconFile, IconFolder } from "./icons.js";

function joinPath(parent: string, name: string): string {
  return parent === "." ? name : `${parent}/${name}`;
}

function sortEntries(entries: TreeEntry[]): TreeEntry[] {
  return entries.slice().sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function breadcrumbFromPath(path: string | null): string {
  if (!path || path === ".") return "Workspace";
  return path.split("/").join(" › ");
}

export function FileTree({
  workspaceReady,
  workspaceKey,
  activeFilePath,
  touched,
  onOpenFile,
}: {
  workspaceReady: boolean;
  workspaceKey: string;
  activeFilePath: string | null;
  touched: Set<string>;
  onOpenFile: (path: string) => void;
}) {
  const [cache, setCache] = useState<Map<string, TreeEntry[]>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["."]));
  const [loading, setLoading] = useState<Set<string>>(new Set());

  const fetchDir = useCallback(async (dirPath: string) => {
    setLoading((s) => new Set(s).add(dirPath));
    try {
      const res = await api<{ entries: TreeEntry[] }>(
        `/api/tree?path=${encodeURIComponent(dirPath)}`,
      );
      setCache((c) => new Map(c).set(dirPath, sortEntries(res.entries)));
    } finally {
      setLoading((s) => {
        const n = new Set(s);
        n.delete(dirPath);
        return n;
      });
    }
  }, []);

  useEffect(() => {
    setCache(new Map());
    setExpanded(new Set(["."]));
    if (workspaceReady) void fetchDir(".");
  }, [workspaceKey, workspaceReady, fetchDir]);

  async function toggleExpand(dirPath: string) {
    if (expanded.has(dirPath)) {
      setExpanded((s) => {
        const n = new Set(s);
        n.delete(dirPath);
        return n;
      });
      return;
    }
    if (!cache.has(dirPath)) await fetchDir(dirPath);
    setExpanded((s) => new Set(s).add(dirPath));
  }

  function renderDir(dirPath: string, depth: number) {
    const entries = cache.get(dirPath);
    const isLoading = loading.has(dirPath);
    if (!entries && isLoading) {
      return (
        <li
          className="px-3 py-1 text-[12px] text-[var(--wb-muted)]"
          style={{ paddingLeft: 8 + depth * 12 }}
        >
          Loading…
        </li>
      );
    }
    if (!entries?.length) {
      if (dirPath === "." && workspaceReady) {
        return (
          <li
            className="px-3 py-1 text-[12px] text-[var(--wb-muted)]"
            style={{ paddingLeft: 8 + depth * 12 }}
          >
            Empty directory
          </li>
        );
      }
      return null;
    }
    return entries.map((e) => {
      const full = joinPath(dirPath, e.name);
      const isActive = activeFilePath === full;
      const pad = 8 + depth * 12;
      if (e.isDirectory) {
        const open = expanded.has(full);
        return (
          <li key={full} role="none">
            <div
              className={`flex items-center hover:bg-[var(--wb-list-hover)] ${isActive ? "bg-[var(--wb-list-active)]" : ""}`}
              style={{ paddingLeft: pad }}
              role="treeitem"
              aria-expanded={open}
            >
              <button
                type="button"
                className="flex h-[22px] w-4 shrink-0 items-center justify-center text-[var(--wb-muted)]"
                aria-label={open ? "Collapse folder" : "Expand folder"}
                onClick={() => void toggleExpand(full)}
              >
                <IconChevron open={open} />
              </button>
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1 py-0.5 text-left text-[13px]"
                onClick={() => void toggleExpand(full)}
              >
                <IconFolder open={open} />
                <span className="truncate text-[var(--wb-text)]">{e.name}</span>
              </button>
            </div>
            {open ? <ul role="group">{renderDir(full, depth + 1)}</ul> : null}
          </li>
        );
      }
      return (
        <li key={full} role="none">
          <button
            type="button"
            className={`flex w-full items-center gap-1 py-0.5 pr-2 text-left text-[13px] hover:bg-[var(--wb-list-hover)] ${
              isActive ? "bg-[var(--wb-list-active)]" : ""
            }`}
            style={{ paddingLeft: pad + 16 }}
            role="treeitem"
            onClick={() => onOpenFile(full)}
          >
            <IconFile />
            <span className="truncate text-[var(--wb-text)]">{e.name}</span>
            {touched.has(full) ? <span className="text-[var(--wb-badge)]">●</span> : null}
          </button>
        </li>
      );
    });
  }

  if (!workspaceReady) {
    return (
      <p className="px-3 py-2 text-[12px] text-[var(--wb-muted)]">
        Open a project folder in Settings to browse files.
      </p>
    );
  }

  return (
    <ul className="py-1" role="tree" aria-label="Explorer">
      {renderDir(".", 0)}
    </ul>
  );
}
