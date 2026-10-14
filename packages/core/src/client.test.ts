import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DaemonClient } from "./client.js";
import { resolveEditerPaths } from "./paths.js";
import { saveGlobalConfig, loadGlobalConfig } from "./config.js";

describe("DaemonClient", () => {
  it("builds base URL from global config", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "editer-cli-"));
    const paths = resolveEditerPaths(home);
    saveGlobalConfig(paths, { ...loadGlobalConfig(paths), host: "127.0.0.1", port: 9999 });
    const client = DaemonClient.fromPaths(paths);
    expect(client.baseUrl).toBe("http://127.0.0.1:9999");
  });

  it("isRunning returns false when nothing listens", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "editer-cli-"));
    const paths = resolveEditerPaths(home);
    saveGlobalConfig(paths, { ...loadGlobalConfig(paths), port: 1 });
    const client = DaemonClient.fromPaths(paths);
    await expect(client.isRunning()).resolves.toBe(false);
  });
});
