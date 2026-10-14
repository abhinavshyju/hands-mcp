import path from "node:path";
import { z } from "zod";
import {
  atomicWriteBuffer,
  isLocalOrAllowedHost,
  type ConsoleEntry,
  type FailedRequestEntry,
  type PageErrorEntry,
} from "@editer/core";
import { DEFAULT_INLINE_MEDIA_BYTES } from "@editer/shared";
import { defineTool, type ToolContext } from "./types.js";
import { mediaFromBuffer, withMedia } from "./media.js";

const sessionArg = z.string().default("default");

async function requireOffHostApproval(ctx: ToolContext, url: string): Promise<void> {
  const extra = ctx.runtime.projectConfig().allowedBrowserHosts ?? [];
  if (isLocalOrAllowedHost(url, extra)) return;
  if (ctx.runtime.merged().mode === "review") return;
  await ctx.runtime.approvals.request({
    tool: "browser_navigate",
    group: "browser",
    summary: `Navigate off-host to ${url}`,
    preview: url,
    workspaceId: ctx.runtime.workspace().id,
    clientId: ctx.clientId,
    clientName: ctx.clientName,
  });
}

async function snapshotAria(page: {
  locator: (sel: string) => {
    ariaSnapshot?: (opts?: { timeout?: number }) => Promise<string>;
  };
  accessibility?: { snapshot: () => Promise<unknown> };
  title: () => Promise<string>;
  url: () => string;
}): Promise<string> {
  const loc = page.locator("html");
  if (typeof loc.ariaSnapshot === "function") {
    return loc.ariaSnapshot({ timeout: 5000 });
  }
  const tree = await page.accessibility?.snapshot();
  return JSON.stringify({ url: page.url(), title: await page.title(), tree }, null, 2);
}

export const browserTools = [
  defineTool({
    name: "browser_navigate",
    description: "Open or reuse a named browser session and navigate to a URL. Localhost is allowed; other hosts need approval in auto mode and in review.",
    group: "browser",
    mutating: true,
    schema: z.object({
      url: z.string(),
      session: sessionArg,
      waitUntil: z.enum(["load", "domcontentloaded", "networkidle", "commit"]).default("load"),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
    }),
    handler: async (ctx, args) => {
      await requireOffHostApproval(ctx, args.url);
      const session = await ctx.runtime.browser.getOrCreate(args.session, {
        viewport:
          args.width && args.height ? { width: args.width, height: args.height } : undefined,
      });
      await session.page.goto(args.url, { waitUntil: args.waitUntil, timeout: 30_000 });
      return {
        session: args.session,
        url: session.page.url(),
        title: await session.page.title(),
      };
    },
  }),
  defineTool({
    name: "browser_screenshot",
    description: "Capture the current page (or a CSS selector) as a PNG. Saved under .editer/media/ and returned as an image.",
    group: "browser",
    mutating: false,
    schema: z.object({
      session: sessionArg,
      selector: z.string().optional(),
      fullPage: z.boolean().default(false),
      path: z.string().optional(),
    }),
    handler: async (ctx, args) => {
      const page = await ctx.runtime.browser.page(args.session);
      const shot = async (type: "png" | "jpeg", quality?: number): Promise<Buffer> => {
        const opts =
          type === "jpeg" ? { type, quality: quality ?? 60 } : { type };
        if (args.selector) {
          return Buffer.from(await page.locator(args.selector).first().screenshot(opts));
        }
        return Buffer.from(await page.screenshot({ ...opts, fullPage: args.fullPage }));
      };
      let bytes = await shot("png");
      let mimeType = "image/png";
      if (bytes.byteLength > DEFAULT_INLINE_MEDIA_BYTES) {
        bytes = await shot("jpeg", 60);
        mimeType = "image/jpeg";
      }
      const rel =
        args.path ??
        path.posix.join(
          ".editer/media",
          `shot-${args.session}-${Date.now()}.${mimeType === "image/jpeg" ? "jpg" : "png"}`,
        );
      const abs = ctx.runtime.resolve(rel, "write");
      atomicWriteBuffer(abs, bytes);
      const { item, inline } = mediaFromBuffer(mimeType, bytes, rel);
      return withMedia(
        {
          session: args.session,
          path: rel,
          bytes: bytes.byteLength,
          inlined: inline,
          url: page.url(),
        },
        [item],
      );
    },
  }),
  defineTool({
    name: "browser_snapshot",
    description: "Return an accessibility tree of the current page. Prefer this over a screenshot for structure.",
    group: "browser",
    mutating: false,
    schema: z.object({ session: sessionArg }),
    handler: async (ctx, args) => {
      const page = await ctx.runtime.browser.page(args.session);
      return { session: args.session, url: page.url(), snapshot: await snapshotAria(page) };
    },
  }),
  defineTool({
    name: "browser_click",
    description: "Click a CSS selector in a browser session.",
    group: "browser",
    mutating: true,
    schema: z.object({
      session: sessionArg,
      selector: z.string(),
    }),
    handler: async (ctx, args) => {
      const page = await ctx.runtime.browser.page(args.session);
      await page.locator(args.selector).first().click({ timeout: 10_000 });
      return { session: args.session, url: page.url() };
    },
  }),
  defineTool({
    name: "browser_type",
    description: "Type text into a CSS selector (appends; does not clear).",
    group: "browser",
    mutating: true,
    schema: z.object({
      session: sessionArg,
      selector: z.string(),
      text: z.string(),
      delayMs: z.number().nonnegative().optional(),
    }),
    handler: async (ctx, args) => {
      const page = await ctx.runtime.browser.page(args.session);
      await page.locator(args.selector).first().pressSequentially(args.text, { delay: args.delayMs });
      return { session: args.session };
    },
  }),
  defineTool({
    name: "browser_fill",
    description: "Fill a CSS selector, replacing existing value.",
    group: "browser",
    mutating: true,
    schema: z.object({
      session: sessionArg,
      selector: z.string(),
      value: z.string(),
    }),
    handler: async (ctx, args) => {
      const page = await ctx.runtime.browser.page(args.session);
      await page.locator(args.selector).first().fill(args.value);
      return { session: args.session };
    },
  }),
  defineTool({
    name: "browser_select",
    description: "Select an option on a <select> by value or label.",
    group: "browser",
    mutating: true,
    schema: z.object({
      session: sessionArg,
      selector: z.string(),
      value: z.string().optional(),
      label: z.string().optional(),
    }),
    handler: async (ctx, args) => {
      const page = await ctx.runtime.browser.page(args.session);
      await page
        .locator(args.selector)
        .first()
        .selectOption(args.value ? { value: args.value } : { label: args.label ?? "" });
      return { session: args.session };
    },
  }),
  defineTool({
    name: "browser_press_key",
    description: "Press a keyboard key in the current page (e.g. Enter, Escape, Control+s).",
    group: "browser",
    mutating: true,
    schema: z.object({
      session: sessionArg,
      key: z.string(),
    }),
    handler: async (ctx, args) => {
      const page = await ctx.runtime.browser.page(args.session);
      await page.keyboard.press(args.key);
      return { session: args.session };
    },
  }),
  defineTool({
    name: "browser_scroll",
    description: "Scroll the page or an element.",
    group: "browser",
    mutating: true,
    schema: z.object({
      session: sessionArg,
      selector: z.string().optional(),
      x: z.number().default(0),
      y: z.number().default(400),
    }),
    handler: async (ctx, args) => {
      const page = await ctx.runtime.browser.page(args.session);
      if (args.selector) {
        await page.locator(args.selector).first().evaluate(
          (el: { scrollBy: (x: number, y: number) => void }, delta: { x: number; y: number }) => {
            el.scrollBy(delta.x, delta.y);
          },
          { x: args.x, y: args.y },
        );
      } else {
        await page.mouse.wheel(args.x, args.y);
      }
      return { session: args.session };
    },
  }),
  defineTool({
    name: "browser_wait_for",
    description: "Wait for a selector, text, URL, or network idle.",
    group: "browser",
    mutating: false,
    schema: z.object({
      session: sessionArg,
      selector: z.string().optional(),
      text: z.string().optional(),
      url: z.string().optional(),
      networkIdle: z.boolean().optional(),
      timeoutMs: z.number().int().positive().default(10_000),
    }),
    handler: async (ctx, args) => {
      const page = await ctx.runtime.browser.page(args.session);
      if (args.selector) await page.locator(args.selector).first().waitFor({ timeout: args.timeoutMs });
      if (args.text) await page.getByText(args.text).first().waitFor({ timeout: args.timeoutMs });
      if (args.url) await page.waitForURL(args.url, { timeout: args.timeoutMs });
      if (args.networkIdle) await page.waitForLoadState("networkidle", { timeout: args.timeoutMs });
      return { session: args.session, url: page.url() };
    },
  }),
  defineTool({
    name: "browser_eval",
    description: "Run JavaScript in the page and return a JSON-serializable value.",
    group: "browser",
    mutating: true,
    schema: z.object({
      session: sessionArg,
      expression: z.string(),
    }),
    handler: async (ctx, args) => {
      const page = await ctx.runtime.browser.page(args.session);
      const value = await page.evaluate((expr: string) => {
        return eval(expr) as unknown;
      }, args.expression);
      return { session: args.session, value };
    },
  }),
  defineTool({
    name: "browser_get_console",
    description: "Read (and drain) console messages, page errors, and failed network requests.",
    group: "browser",
    mutating: false,
    schema: z.object({
      session: sessionArg,
      drain: z.boolean().default(true),
    }),
    handler: async (ctx, args) => {
      const buffers = args.drain
        ? ctx.runtime.browser.drain(args.session)
        : ctx.runtime.browser.peek(args.session);
      return {
        session: args.session,
        console: buffers.console as ConsoleEntry[],
        errors: buffers.errors as PageErrorEntry[],
        failed: buffers.failed as FailedRequestEntry[],
      };
    },
  }),
  defineTool({
    name: "browser_assert",
    description: "Structured assertion against the page: selector visible, text present, URL match, or count.",
    group: "browser",
    mutating: false,
    schema: z.object({
      session: sessionArg,
      selector: z.string().optional(),
      text: z.string().optional(),
      urlIncludes: z.string().optional(),
      count: z.number().int().nonnegative().optional(),
    }),
    handler: async (ctx, args) => {
      const page = await ctx.runtime.browser.page(args.session);
      const failures: string[] = [];
      if (args.selector) {
        const loc = page.locator(args.selector);
        const n = await loc.count();
        if (args.count !== undefined) {
          if (n !== args.count) failures.push(`expected ${args.count} of ${args.selector}, got ${n}`);
        } else if (n === 0) {
          failures.push(`selector not found: ${args.selector}`);
        }
      }
      if (args.text) {
        const n = await page.getByText(args.text).count();
        if (n === 0) failures.push(`text not found: ${args.text}`);
      }
      if (args.urlIncludes && !page.url().includes(args.urlIncludes)) {
        failures.push(`url ${page.url()} does not include ${args.urlIncludes}`);
      }
      return {
        pass: failures.length === 0,
        failures,
        url: page.url(),
      };
    },
  }),
  defineTool({
    name: "browser_sessions",
    description: "List open browser sessions.",
    group: "browser",
    mutating: false,
    schema: z.object({}),
    handler: (ctx) => ctx.runtime.browser.list(),
  }),
  defineTool({
    name: "browser_close",
    description: "Close a named browser session.",
    group: "browser",
    mutating: true,
    schema: z.object({ session: sessionArg }),
    handler: async (ctx, args) => {
      await ctx.runtime.browser.close(args.session);
      return { closed: args.session };
    },
  }),
];
