import { describe, expect, it, afterEach } from "vitest";
import { colorEnabled, setColorEnabledForTests, styles, visibleWidth } from "./theme.js";

describe("theme", () => {
  afterEach(() => {
    setColorEnabledForTests(undefined);
  });

  it("disables color when override is false", () => {
    setColorEnabledForTests(false);
    expect(colorEnabled()).toBe(false);
    expect(styles.accent("x")).toBe("x");
  });

  it("enables styled output when override is true", () => {
    setColorEnabledForTests(true);
    expect(colorEnabled()).toBe(true);
    expect(styles.accent("x")).toContain("x");
    expect(styles.accent("x")).not.toBe("x");
  });

  it("visibleWidth ignores VT sequences", () => {
    setColorEnabledForTests(true);
    const styled = styles.bold("hello");
    expect(visibleWidth(styled)).toBe(5);
  });
});
