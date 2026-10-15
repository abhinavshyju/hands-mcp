import fs from "node:fs";
import path from "node:path";

export const HANDS_CODING_GUIDANCE = `# Coding standards (hands MCP)

## Scope
- Smallest correct change for the task. No drive-by refactors or unrelated files.
- Read neighboring code before adding abstractions. Match naming, imports, and error style.

## Modularity
- One module, one reason to change. Extract shared logic only on second use, not speculatively.
- Avoid middle-man wrappers unless they hide a real boundary (policy, IO, test seam).
- If a change scatters across unrelated files, consolidate or split along natural package boundaries.

## Style
- Comments only for non-obvious invariants or security/policy rationale.
- Specific, actionable errors. No blanket try/catch or vague failure messages unless the surrounding code already does that.
- Add tests when behavior changes; skip tests that only restate types or trivial getters.

## Formatting
- Edit tools auto-format supported source files with Prettier when formatOnEdit is true in .hands/config.json.
`;

export const CODING_STANDARDS_RESOURCE_URI = "hands://guidance/coding-standards";

export function mergeWorkspaceGuidance(workspaceRoot: string): { text: string; sources: string[] } {
  const sources = ["@hands/shared:codingGuidance"];
  const parts = [HANDS_CODING_GUIDANCE.trim()];

  const agentsPath = path.join(workspaceRoot, "AGENTS.md");
  if (fs.existsSync(agentsPath)) {
    parts.push(fs.readFileSync(agentsPath, "utf8").trim());
    sources.push("AGENTS.md");
  }

  const rulesDir = path.join(workspaceRoot, ".cursor", "rules");
  if (fs.existsSync(rulesDir)) {
    const mdcFiles = fs
      .readdirSync(rulesDir)
      .filter((f) => f.endsWith(".mdc"))
      .sort();
    const preferred = mdcFiles.includes("engineering-standards.mdc")
      ? "engineering-standards.mdc"
      : mdcFiles[0];
    if (preferred) {
      const rulePath = path.join(rulesDir, preferred);
      parts.push(fs.readFileSync(rulePath, "utf8").trim());
      sources.push(path.join(".cursor/rules", preferred));
    }
  }

  return { text: parts.join("\n\n---\n\n"), sources };
}
