import { describe, expect, it } from "vitest";
import { FileLockManager } from "./filelock.js";

describe("file locks", () => {
  it("serializes two writers on the same file", async () => {
    const locks = new FileLockManager();
    const order: number[] = [];
    await Promise.all([
      locks.withFileLock("a.txt", async () => {
        order.push(1);
        await new Promise((r) => setTimeout(r, 30));
        order.push(2);
      }),
      locks.withFileLock("a.txt", async () => {
        order.push(3);
      }),
    ]);
    expect(order).toEqual([1, 2, 3]);
  });
});
