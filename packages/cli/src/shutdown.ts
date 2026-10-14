import fs from "node:fs";
import { DaemonClient, type EditerPaths } from "@editer/core";

export async function stopEditerDaemon(paths: EditerPaths): Promise<boolean> {
  const client = DaemonClient.fromPaths(paths);
  if (await client.isRunning()) {
    try {
      await client.shutdown();
      await waitUntilDown(client, 5_000);
    } catch {
      // fall through to pid kill
    }
  }

  if (!fs.existsSync(paths.pidFile)) {
    return !(await client.isRunning());
  }

  const pid = Number(fs.readFileSync(paths.pidFile, "utf8"));
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    try {
      fs.unlinkSync(paths.pidFile);
    } catch {
      // ignore
    }
    return !(await client.isRunning());
  }

  await waitUntilDown(client, 8_000);
  if (fs.existsSync(paths.pidFile)) {
    try {
      fs.unlinkSync(paths.pidFile);
    } catch {
      // ignore
    }
  }
  return !(await client.isRunning());
}

async function waitUntilDown(client: DaemonClient, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await client.isRunning())) return;
    await sleep(100);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
