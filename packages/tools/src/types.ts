import type { z, ZodTypeAny } from "zod";
import type { PolicyAction, ToolGroup } from "@editer/shared";
import type { EditerRuntime, SamplingClient } from "@editer/core";

export interface ToolContext {
  runtime: EditerRuntime;
  clientId?: string;
  clientName?: string;
  sampling?: SamplingClient;
}

export interface ToolDefinition<S extends ZodTypeAny = ZodTypeAny> {
  name: string;
  description: string;
  group: ToolGroup;
  mutating: boolean;
  requiredMode?: PolicyAction;
  schema: S;
  handler: (ctx: ToolContext, args: z.infer<S>) => Promise<unknown> | unknown;
}

export function defineTool<S extends ZodTypeAny>(def: ToolDefinition<S>): ToolDefinition {
  return def as unknown as ToolDefinition;
}
