import { BROWSER_IDLE_MS, EditerError, type BrowserSession } from "@editer/shared";
import type { Browser, BrowserContext, ConsoleMessage, Page, Request } from "playwright-core";
import type { EventBus } from "./events.js";

const RING = 200;

export interface ConsoleEntry {
  type: string;
  text: string;
  ts: number;
}

export interface PageErrorEntry {
  message: string;
  ts: number;
}

export interface FailedRequestEntry {
  url: string;
  status?: number;
  error?: string;
  ts: number;
}

export interface BrowserBuffers {
  console: ConsoleEntry[];
  errors: PageErrorEntry[];
  failed: FailedRequestEntry[];
}

interface Session {
  name: string;
  context: BrowserContext;
  page: Page;
  createdAt: number;
  lastUsedAt: number;
  console: ConsoleEntry[];
  errors: PageErrorEntry[];
  failed: FailedRequestEntry[];
  idleTimer?: ReturnType<typeof setTimeout>;
}

export function isLocalOrAllowedHost(url: string, extraHosts: string[] = []): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new EditerError("BROWSER_BAD_URL", `Invalid URL: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new EditerError(
      "BROWSER_BAD_URL",
      `Only http(s) URLs are allowed, got ${parsed.protocol}`,
    );
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host.endsWith(".localhost")
  ) {
    return true;
  }
  return extraHosts.some((h) => h.toLowerCase() === host);
}

function pushRing<T>(arr: T[], item: T): void {
  arr.push(item);
  if (arr.length > RING) arr.splice(0, arr.length - RING);
}

export class BrowserManager {
  private browser: Browser | undefined;
  private launching: Promise<Browser> | undefined;
  private sessions = new Map<string, Session>();
  private idleMs: number;

  constructor(
    private readonly events: EventBus,
    idleMs = BROWSER_IDLE_MS,
  ) {
    this.idleMs = idleMs;
  }

  list(): BrowserSession[] {
    return [...this.sessions.values()].map((s) => this.toRecord(s));
  }

  async getOrCreate(
    name: string,
    opts: { viewport?: { width: number; height: number } } = {},
  ): Promise<Session> {
    const existing = this.sessions.get(name);
    if (existing) {
      this.touch(existing);
      return existing;
    }
    const browser = await this.ensureBrowser();
    const context = await browser.newContext({
      viewport: opts.viewport ?? { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    const session: Session = {
      name,
      context,
      page,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      console: [],
      errors: [],
      failed: [],
    };
    page.on("console", (msg: ConsoleMessage) => {
      pushRing(session.console, { type: msg.type(), text: msg.text(), ts: Date.now() });
      this.emitSession(session);
    });
    page.on("pageerror", (err: Error) => {
      pushRing(session.errors, { message: err.message, ts: Date.now() });
      this.emitSession(session);
    });
    page.on("requestfailed", (req: Request) => {
      pushRing(session.failed, {
        url: req.url(),
        error: req.failure()?.errorText,
        ts: Date.now(),
      });
      this.emitSession(session);
    });
    page.on("response", (res) => {
      if (res.status() >= 400) {
        pushRing(session.failed, { url: res.url(), status: res.status(), ts: Date.now() });
      }
    });
    this.sessions.set(name, session);
    this.touch(session);
    this.emitSession(session);
    return session;
  }

  async page(name: string): Promise<Page> {
    const session = this.sessions.get(name);
    if (!session) {
      throw new EditerError(
        "BROWSER_NO_SESSION",
        `No browser session named "${name}". Call browser_navigate first.`,
      );
    }
    this.touch(session);
    return session.page;
  }

  async session(name: string): Promise<Session> {
    const session = this.sessions.get(name);
    if (!session) {
      throw new EditerError(
        "BROWSER_NO_SESSION",
        `No browser session named "${name}". Call browser_navigate first.`,
      );
    }
    this.touch(session);
    return session;
  }

  drain(name: string): BrowserBuffers {
    const session = this.sessions.get(name);
    if (!session) {
      throw new EditerError("BROWSER_NO_SESSION", `No browser session named "${name}".`);
    }
    const out = {
      console: [...session.console],
      errors: [...session.errors],
      failed: [...session.failed],
    };
    session.console.length = 0;
    session.errors.length = 0;
    session.failed.length = 0;
    this.emitSession(session);
    return out;
  }

  peek(name: string): BrowserBuffers {
    const session = this.sessions.get(name);
    if (!session) {
      throw new EditerError("BROWSER_NO_SESSION", `No browser session named "${name}".`);
    }
    return {
      console: [...session.console],
      errors: [...session.errors],
      failed: [...session.failed],
    };
  }

  async close(name: string): Promise<void> {
    const session = this.sessions.get(name);
    if (!session) return;
    if (session.idleTimer) clearTimeout(session.idleTimer);
    this.sessions.delete(name);
    await session.context.close().catch(() => undefined);
    this.events.emit("browser.session.closed", { name });
    if (this.sessions.size === 0) await this.closeBrowser();
  }

  async stopAll(): Promise<void> {
    const names = [...this.sessions.keys()];
    for (const name of names) await this.close(name);
    await this.closeBrowser();
  }

  private toRecord(s: Session): BrowserSession {
    return {
      name: s.name,
      url: s.page.url(),
      title: undefined,
      consoleErrors: s.console.filter((c) => c.type === "error").length + s.errors.length,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
    };
  }

  private emitSession(s: Session): void {
    this.events.emit("browser.session.updated", this.toRecord(s));
  }

  private touch(session: Session): void {
    session.lastUsedAt = Date.now();
    if (session.idleTimer) clearTimeout(session.idleTimer);
    session.idleTimer = setTimeout(() => {
      void this.close(session.name);
    }, this.idleMs);
  }

  private async ensureBrowser(): Promise<Browser> {
    if (this.browser) return this.browser;
    if (this.launching) return this.launching;
    this.launching = this.launch();
    try {
      this.browser = await this.launching;
      return this.browser;
    } finally {
      this.launching = undefined;
    }
  }

  private async launch(): Promise<Browser> {
    const { chromium } = await import("playwright-core");
    try {
      return await chromium.launch({
        headless: true,
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new EditerError(
        "BROWSER_UNAVAILABLE",
        `Chromium is not installed for Playwright. Run: npx playwright install chromium\n${message}`,
      );
    }
  }

  private async closeBrowser(): Promise<void> {
    const b = this.browser;
    this.browser = undefined;
    if (b) await b.close().catch(() => undefined);
  }
}
