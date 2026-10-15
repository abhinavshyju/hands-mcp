import fs from "node:fs";
import path from "node:path";
import { atomicWriteFile } from "./atomicWrite.js";

const TEMPLATES: Record<string, Record<string, string>> = {
  node: {
    "package.json": `{
  "name": "app",
  "version": "0.1.0",
  "type": "module",
  "scripts": { "start": "node index.js", "test": "node --test" }
}
`,
    "index.js": `console.log("hello from Hands");\n`,
    "README.md": `# app\n\nScaffolded by hands-mcp.\n`,
  },
  typescript: {
    "package.json": `{
  "name": "app",
  "version": "0.1.0",
  "type": "module",
  "scripts": { "build": "tsc", "start": "node dist/index.js", "test": "node --test" }
}
`,
    "tsconfig.json": `{
  "compilerOptions": { "target": "ES2022", "module": "NodeNext", "strict": true, "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
`,
    "src/index.ts": `console.log("hello from Hands");\n`,
    "README.md": `# app\n\nTypeScript scaffold from hands-mcp.\n`,
  },
  python: {
    "pyproject.toml": `[project]\nname = "app"\nversion = "0.1.0"\n`,
    "main.py": `def main():\n    print("hello from Hands")\n\nif __name__ == "__main__":\n    main()\n`,
    "README.md": `# app\n\nPython scaffold from hands-mcp.\n`,
  },
};

export function scaffoldProject(root: string, template: string): string[] {
  const files = TEMPLATES[template];
  if (!files)
    throw new Error(
      `Unknown template: ${template}. Available: ${Object.keys(TEMPLATES).join(", ")}`,
    );
  const written: string[] = [];
  for (const [rel, contents] of Object.entries(files)) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs)) continue;
    atomicWriteFile(abs, contents, { preserveLineEndings: false });
    written.push(rel);
  }
  return written;
}

export function listTemplates(): string[] {
  return Object.keys(TEMPLATES);
}
