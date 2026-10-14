import path from "node:path";
import { defineConfig } from "vitest/config";

const root = import.meta.dirname;

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: "forks",
    env: { VITEST: "1" },
  },
  resolve: {
    alias: {
      "@editer/shared": path.join(root, "packages/shared/src/index.ts"),
      "@editer/core": path.join(root, "packages/core/src/index.ts"),
      "@editer/tools": path.join(root, "packages/tools/src/index.ts"),
      "@editer/server": path.join(root, "packages/server/src/index.ts"),
    },
  },
});
