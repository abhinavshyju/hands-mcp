import { describe, expect, it } from "vitest";
import { buildCloudflaredArgs, effectiveTunnelMode, parseQuickTunnelUrl } from "./tunnel.js";

describe("tunnel helpers", () => {
  it("parses trycloudflare URL", () => {
    const text = "INF |  https://abc-def.trycloudflare.com  |  some log";
    expect(parseQuickTunnelUrl(text)).toBe("https://abc-def.trycloudflare.com");
  });

  it("builds quick args", () => {
    expect(
      buildCloudflaredArgs({ enabled: true, mode: "quick" }, 4877),
    ).toEqual(["tunnel", "--url", "http://127.0.0.1:4877"]);
  });

  it("builds token args", () => {
    expect(
      buildCloudflaredArgs({ enabled: true, mode: "token", token: "tok" }, 4877),
    ).toEqual(["tunnel", "run", "--token", "tok"]);
  });

  it("effective mode from legacy enabled", () => {
    expect(effectiveTunnelMode({ enabled: true })).toBe("named");
    expect(effectiveTunnelMode({ enabled: false, mode: "off" })).toBe("off");
  });
});
