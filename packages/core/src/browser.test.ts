import http from "node:http";
import { afterAll, describe, expect, it } from "vitest";
import { HandsError } from "@hands/shared";
import { BrowserManager, isLocalOrAllowedHost } from "./browser.js";
import { EventBus } from "./events.js";

describe("navigation policy", () => {
  it("allows localhost and extra hosts", () => {
    expect(isLocalOrAllowedHost("http://localhost:5173")).toBe(true);
    expect(isLocalOrAllowedHost("http://127.0.0.1:80/x")).toBe(true);
    expect(isLocalOrAllowedHost("https://example.com", ["example.com"])).toBe(true);
    expect(isLocalOrAllowedHost("https://example.com")).toBe(false);
  });

  it("rejects non-http schemes", () => {
    expect(() => isLocalOrAllowedHost("file:///tmp/x")).toThrow(HandsError);
  });
});

describe.skipIf(process.env.EDITER_SKIP_BROWSER === "1")("BrowserManager", () => {
  const html = `<!doctype html><html><body>
    <h1 id="title">hello</h1>
    <button id="go">go</button>
    <p id="out"></p>
    <script>
      console.error("boom");
      document.getElementById("go").onclick = () => {
        document.getElementById("out").textContent = "clicked";
      };
    </script>
  </body></html>`;

  let server: http.Server | undefined;
  let url = "";

  it("navigates, clicks, captures console, screenshots, and closes", async ({ skip }) => {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no addr");
    url = `http://127.0.0.1:${addr.port}/`;

    const events = new EventBus();
    const mgr = new BrowserManager(events, 60_000);
    try {
      await mgr.getOrCreate("t");
    } catch (err) {
      await mgr.stopAll();
      if (err instanceof HandsError && err.code === "BROWSER_UNAVAILABLE") {
        skip();
        return;
      }
      throw err;
    }

    try {
      const session = await mgr.getOrCreate("t");
      await session.page.goto(url, { waitUntil: "load" });
      await session.page.locator("#go").click();
      const out = await session.page.locator("#out").textContent();
      expect(out).toBe("clicked");
      const buf = await mgr.peek("t");
      expect(buf.console.some((c) => c.type === "error")).toBe(true);
      const png = Buffer.from(await session.page.locator("#title").screenshot({ type: "png" }));
      expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(mgr.list().some((s) => s.name === "t")).toBe(true);
    } finally {
      await mgr.stopAll();
    }
    expect(mgr.list()).toEqual([]);
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      if (!server) return resolve();
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });
});
