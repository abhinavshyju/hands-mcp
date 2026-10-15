import { describe, expect, it } from "vitest";
import {
  filterSlashCompletions,
  resolveSlashLine,
  resolveSlashTokens,
  SLASH_CATALOG,
} from "./slashCatalog.js";

describe("slashCatalog", () => {
  it("rewrites auth-mode alias", () => {
    expect(resolveSlashTokens(["auth-mode", "oauth"])).toEqual(["auth", "mode", "oauth"]);
    expect(resolveSlashLine("/oauth-urls")).toEqual(["auth", "oauth-urls"]);
  });

  it("rewrites /mode review to mode set", () => {
    expect(resolveSlashLine("/mode review")).toEqual(["mode", "set", "review"]);
  });

  it("rewrites bare /workspace path to add", () => {
    expect(resolveSlashLine("/workspace /tmp/foo")).toEqual(["workspace", "add", "/tmp/foo"]);
  });

  it("filters completions for /tunnel prefix", () => {
    const hits = filterSlashCompletions("/tunnel ");
    expect(hits.some((h) => h.includes("login"))).toBe(true);
    expect(hits.some((h) => h.includes("setup"))).toBe(true);
  });

  it("has unique ids", () => {
    const ids = SLASH_CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
