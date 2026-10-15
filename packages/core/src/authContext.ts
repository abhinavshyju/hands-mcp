import { AsyncLocalStorage } from "node:async_hooks";
import type { AuthContext } from "@hands/shared";

const storage = new AsyncLocalStorage<AuthContext>();

export function runWithAuthContext<T>(ctx: AuthContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function runWithAuthContextAsync<T>(ctx: AuthContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

export function getAuthContext(): AuthContext | undefined {
  return storage.getStore();
}

export function defaultAuthContext(method: AuthContext["method"], clientName: string): AuthContext {
  return { method, clientName };
}
