import type { ToolDefinition } from "./types.js";
import { metaTools } from "./meta.js";
import { readTools } from "./read.js";
import { searchTools } from "./search.js";
import { editTools } from "./edit.js";
import { execTools } from "./exec.js";
import { gitTools } from "./git.js";
import { checkpointTools } from "./checkpoints.js";
import { qualityTools } from "./quality.js";
import { browserTools } from "./browser.js";
import { imageTools } from "./image.js";
import { ToolRegistry } from "./registry.js";

export function allBuiltinTools(): ToolDefinition[] {
  return [
    ...metaTools,
    ...readTools,
    ...searchTools,
    ...editTools,
    ...execTools,
    ...gitTools,
    ...checkpointTools,
    ...qualityTools,
    ...browserTools,
    ...imageTools,
  ];
}

export function registerBuiltins(registry: ToolRegistry): void {
  for (const t of allBuiltinTools()) registry.register(t);
}
