import fs from "node:fs";
import path from "node:path";
import { loadGitignore } from "./search.js";

export interface ProjectOverview {
  languages: string[];
  packageManager: string | null;
  scripts: Record<string, string>;
  entrypoints: string[];
  tree: string[];
  readme: string | null;
}

const LANG_FILES: Record<string, string> = {
  "package.json": "javascript/typescript",
  "tsconfig.json": "typescript",
  "pyproject.toml": "python",
  "requirements.txt": "python",
  "go.mod": "go",
  "Cargo.toml": "rust",
  pom: "java",
  "build.gradle": "java",
};

export function getProjectOverview(root: string): ProjectOverview {
  const entries = fs.readdirSync(root);
  const languages = new Set<string>();
  for (const [file, lang] of Object.entries(LANG_FILES)) {
    if (entries.includes(file) || entries.some((e) => e.startsWith(file))) languages.add(lang);
  }
  let packageManager: string | null = null;
  if (entries.includes("pnpm-lock.yaml")) packageManager = "pnpm";
  else if (entries.includes("yarn.lock")) packageManager = "yarn";
  else if (entries.includes("bun.lockb") || entries.includes("bun.lock")) packageManager = "bun";
  else if (entries.includes("package-lock.json") || entries.includes("package.json")) packageManager = "npm";
  else if (entries.includes("Cargo.toml")) packageManager = "cargo";
  else if (entries.includes("go.mod")) packageManager = "go";
  else if (entries.includes("pyproject.toml") || entries.includes("requirements.txt")) packageManager = "pip";

  let scripts: Record<string, string> = {};
  const pkgPath = path.join(root, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, string> };
      scripts = pkg.scripts ?? {};
    } catch {
      scripts = {};
    }
  }

  const ignored = loadGitignore(root);
  const tree = entries
    .filter((e) => !ignored(e) && e !== ".git")
    .sort()
    .slice(0, 40);

  const entrypoints = ["src/index.ts", "src/main.ts", "src/index.js", "main.py", "cmd/main.go", "src/main.rs"].filter(
    (p) => fs.existsSync(path.join(root, p)),
  );

  let readme: string | null = null;
  const readmeFile = entries.find((e) => e.toLowerCase().startsWith("readme"));
  if (readmeFile) {
    const text = fs.readFileSync(path.join(root, readmeFile), "utf8");
    readme = text.slice(0, 2000);
  }

  return { languages: [...languages], packageManager, scripts, entrypoints, tree, readme };
}

export function detectPackageManager(root: string): string {
  return getProjectOverview(root).packageManager ?? "npm";
}

export function resolveScript(
  root: string,
  kind: "test" | "lint" | "build",
  override?: string,
): string {
  if (override) return override;
  const ov = getProjectOverview(root);
  if (ov.scripts[kind]) {
    const pm = ov.packageManager ?? "npm";
    if (pm === "pnpm") return `pnpm ${kind}`;
    if (pm === "yarn") return `yarn ${kind}`;
    if (pm === "bun") return `bun run ${kind}`;
    return `npm run ${kind}`;
  }
  if (fs.existsSync(path.join(root, "Cargo.toml"))) return `cargo ${kind === "test" ? "test" : kind === "build" ? "build" : "clippy"}`;
  if (fs.existsSync(path.join(root, "go.mod"))) return kind === "test" ? "go test ./..." : kind === "build" ? "go build ./..." : "go vet ./...";
  if (fs.existsSync(path.join(root, "pyproject.toml"))) return kind === "test" ? "pytest" : kind === "lint" ? "ruff check ." : "python -m build";
  throw new Error(`Could not detect a ${kind} command. Set it in .editer/config.json scripts.${kind}`);
}
