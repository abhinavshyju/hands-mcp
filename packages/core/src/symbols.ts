import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import fg from "fast-glob";
import { HANDS_DIRNAME, LEGACY_EDITER_DIRNAME } from "@hands/shared";
import initSqlJs, { type Database } from "sql.js";

const require = createRequire(import.meta.url);

export interface SymbolHit {
  file: string;
  name: string;
  kind: string;
  line: number;
}

const EXTRACTORS: Array<{ glob: string; kind: string; re: RegExp }> = [
  {
    glob: "*.{ts,tsx,js,jsx}",
    kind: "function",
    re: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
  },
  { glob: "*.{ts,tsx,js,jsx}", kind: "class", re: /(?:export\s+)?class\s+(\w+)/g },
  { glob: "*.{ts,tsx}", kind: "interface", re: /(?:export\s+)?interface\s+(\w+)/g },
  { glob: "*.{ts,tsx}", kind: "type", re: /(?:export\s+)?type\s+(\w+)\s*=/g },
  { glob: "*.py", kind: "function", re: /^\s*def\s+(\w+)/gm },
  { glob: "*.py", kind: "class", re: /^\s*class\s+(\w+)/gm },
  { glob: "*.go", kind: "function", re: /^func\s+(?:\([^)]+\)\s+)?(\w+)/gm },
  { glob: "*.go", kind: "type", re: /^type\s+(\w+)\s/gm },
  { glob: "*.rs", kind: "function", re: /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/g },
  { glob: "*.rs", kind: "struct", re: /(?:pub\s+)?struct\s+(\w+)/g },
  { glob: "*.java", kind: "class", re: /(?:public\s+)?(?:class|interface|enum)\s+(\w+)/g },
  {
    glob: "*.java",
    kind: "method",
    re: /(?:public|private|protected)\s+(?:static\s+)?[\w<>[\]]+\s+(\w+)\s*\(/g,
  },
];

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

function extractFile(abs: string, rel: string): SymbolHit[] {
  const text = fs.readFileSync(abs, "utf8");
  const hits: SymbolHit[] = [];
  const ext = path.extname(rel);
  for (const ex of EXTRACTORS) {
    const ok =
      ex.glob.includes(ext.replace(".", "")) ||
      (ext === ".ts" && ex.glob.includes("ts")) ||
      (ext === ".tsx" && ex.glob.includes("tsx")) ||
      (ext === ".js" && ex.glob.includes("js")) ||
      (ext === ".jsx" && ex.glob.includes("jsx")) ||
      (ext === ".py" && ex.glob.includes("py")) ||
      (ext === ".go" && ex.glob.includes("go")) ||
      (ext === ".rs" && ex.glob.includes("rs")) ||
      (ext === ".java" && ex.glob.includes("java"));
    if (!ok) continue;
    const re = new RegExp(ex.re.source, ex.re.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const name = m[1];
      if (!name) continue;
      hits.push({ file: rel, name, kind: ex.kind, line: lineOf(text, m.index) });
    }
  }
  return hits;
}

export class SymbolIndex {
  private db: Database | undefined;
  private mtimes = new Map<string, number>();
  private SQL: Awaited<ReturnType<typeof initSqlJs>> | undefined;

  async init(): Promise<void> {
    if (this.db) return;
    const wasmPath = path.join(path.dirname(require.resolve("sql.js")), "sql-wasm.wasm");
    this.SQL = await initSqlJs({
      locateFile: (file: string) => (file.endsWith(".wasm") ? wasmPath : file),
    });
    this.db = new this.SQL.Database();
    this.db.run(
      `CREATE TABLE symbols (file TEXT, name TEXT, kind TEXT, line INTEGER);
       CREATE INDEX idx_name ON symbols(name);
       CREATE INDEX idx_file ON symbols(file);`,
    );
  }

  async reindex(cwd: string, onlyFile?: string): Promise<number> {
    await this.init();
    const db = this.db!;
    const files = onlyFile
      ? [onlyFile]
      : fg.sync(["**/*.{ts,tsx,js,jsx,py,go,rs,java}"], {
          cwd,
          ignore: [
            "**/node_modules/**",
            "**/.git/**",
            `**/${HANDS_DIRNAME}/**`,
            `**/${LEGACY_EDITER_DIRNAME}/**`,
          ],
          onlyFiles: true,
        });
    const t0 = Date.now();
    for (const rel of files) {
      const abs = path.join(cwd, rel);
      let mtime = 0;
      try {
        mtime = fs.statSync(abs).mtimeMs;
      } catch {
        continue;
      }
      if (!onlyFile && this.mtimes.get(rel) === mtime) continue;
      db.run("DELETE FROM symbols WHERE file = ?", [rel]);
      const hits = extractFile(abs, rel);
      for (const h of hits) {
        db.run("INSERT INTO symbols (file, name, kind, line) VALUES (?, ?, ?, ?)", [
          h.file,
          h.name,
          h.kind,
          h.line,
        ]);
      }
      this.mtimes.set(rel, mtime);
    }
    return Date.now() - t0;
  }

  list(cwd: string, prefix?: string): SymbolHit[] {
    const db = this.db;
    if (!db) return [];
    const stmt = prefix
      ? db.prepare("SELECT file, name, kind, line FROM symbols WHERE name LIKE ? LIMIT 500")
      : db.prepare("SELECT file, name, kind, line FROM symbols LIMIT 500");
    if (prefix) stmt.bind([`${prefix}%`]);
    const out: SymbolHit[] = [];
    while (stmt.step()) {
      const r = stmt.getAsObject() as { file: string; name: string; kind: string; line: number };
      out.push(r);
    }
    stmt.free();
    void cwd;
    return out;
  }

  findDefinition(name: string): SymbolHit[] {
    const db = this.db;
    if (!db) return [];
    const stmt = db.prepare("SELECT file, name, kind, line FROM symbols WHERE name = ?");
    stmt.bind([name]);
    const out: SymbolHit[] = [];
    while (stmt.step()) {
      const r = stmt.getAsObject() as unknown as SymbolHit;
      out.push(r);
    }
    stmt.free();
    return out;
  }
}
