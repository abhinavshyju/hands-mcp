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
      "@hands/shared": path.join(root, "packages/shared/src/index.ts"),
      "@hands/core": path.join(root, "packages/core/src/index.ts"),
      "@hands/tools": path.join(root, "packages/tools/src/index.ts"),
      "@hands/server": path.join(root, "packages/server/src/index.ts"),
    },
  },
});
