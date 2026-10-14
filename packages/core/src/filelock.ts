export class FileLockManager {
  private locks = new Map<string, Promise<void>>();
  private inflight = 0;
  constructor(private readonly maxConcurrent = 8) {}

  async withFileLock<T>(file: string, fn: () => Promise<T> | T): Promise<T> {
    const key = file;
    const prev = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((r) => {
      release = r;
    });
    this.locks.set(
      key,
      prev.then(() => next),
    );
    await prev;
    while (this.inflight >= this.maxConcurrent) {
      await new Promise((r) => setTimeout(r, 10));
    }
    this.inflight += 1;
    try {
      return await fn();
    } finally {
      this.inflight -= 1;
      release();
      if (this.locks.get(key) === next) this.locks.delete(key);
    }
  }
}
