import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AuthError } from "@editer/shared";
import { resolveEditerPaths } from "./paths.js";
import { TokenStore } from "./tokens.js";

describe("tokens", () => {
  it("accepts a valid token and rejects missing/wrong/revoked", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "editer-tok-"));
    const store = new TokenStore(resolveEditerPaths(home));
    const t = store.create("claude");
    expect(store.authenticate(t.token).name).toBe("claude");
    expect(() => store.authenticate(undefined)).toThrow(AuthError);
    expect(() => store.authenticate("nope")).toThrow(AuthError);
    store.revoke(t.id);
    expect(() => store.authenticate(t.token)).toThrow(AuthError);
  });
});
