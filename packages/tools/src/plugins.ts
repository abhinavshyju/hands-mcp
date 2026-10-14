import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type { ToolRegistry } from "./registry.js";
import type { ToolDefinition } from "./types.js";
import type { EditerRuntime } from "@editer/core";

const pluginExportSchema = z.object({
  name: z.string(),
  description: z.string(),
  schema: z.unknown(),
  handler: z.unknown(),
});

export interface PluginLoadError {
  file: string;
  error: string;
}

export class PluginLoader {
  private loaded = new Map<string, string>();
  errors: PluginLoadError[] = [];
  private watchers: fs.FSWatcher[] = [];

  constructor(
    private readonly runtime: EditerRuntime,
    private readonly registry: ToolRegistry,
  ) {}

  dirs(): string[] {
    const dirs = [this.runtime.paths.pluginDir];
    try {
      dirs.push(path.join(this.runtime.workspace().root, ".editer", "tools"));
    } catch {
      // no workspace yet
    }
    if (this.runtime.merged().global.pluginDir) {
      dirs.push(this.runtime.merged().global.pluginDir as string);
    }
    return dirs;
  }

  async loadAll(): Promise<void> {
    this.errors = [];
    for (const dir of this.dirs()) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".js") || f.endsWith(".mjs") || f.endsWith(".ts"));
      for (const file of files) {
        await this.loadFile(path.join(dir, file));
      }
    }
  }

  async loadFile(file: string): Promise<void> {
    try {
      const url = `${pathToFileURL(file).href}?t=${Date.now()}`;
      const mod = (await import(url)) as { default?: unknown } & Record<string, unknown>;
      const raw = mod.default ?? mod.tool ?? mod;
      const parsed = pluginExportSchema.parse(raw);
      const schema = parsed.schema as ToolDefinition["schema"];
      const handler = parsed.handler as ToolDefinition["handler"];
      if (typeof handler !== "function") throw new Error("handler must be a function");
      const prev = this.loaded.get(file);
      if (prev) this.registry.unregister(prev);
      const tool: ToolDefinition = {
        name: parsed.name,
        description: parsed.description,
        group: "plugin",
        mutating: true,
        schema,
        handler,
      };
      this.registry.register(tool);
      this.loaded.set(file, tool.name);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.errors.push({ file, error: message });
      this.runtime.events.emit("plugin.error", { file, error: message });
    }
  }

  watch(): void {
    for (const dir of this.dirs()) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const watcher = fs.watch(dir, { persistent: false }, () => {
        void this.loadAll();
      });
      this.watchers.push(watcher);
    }
  }

  close(): void {
    for (const w of this.watchers) w.close();
  }
}

export function pluginScaffold(name: string): string {
  return `/** @type {import("@editer/tools").ToolDefinition} */
export default {
  name: ${JSON.stringify(name)},
  description: "Custom editer tool: ${name}",
  schema: { parse: (args) => args },
  async handler(ctx, args) {
    return { ok: true, workspace: ctx.runtime.workspace().root, args };
  },
};
`;
}
