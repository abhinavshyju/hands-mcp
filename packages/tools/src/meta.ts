import { z } from "zod";
import { APP_NAME, APP_VERSION, mergeWorkspaceGuidance } from "@hands/shared";
import { getProjectOverview } from "@hands/core";
import { defineTool } from "./types.js";

export const metaTools = [
  defineTool({
    name: "get_capabilities",
    description: "Report daemon version, mode, active workspace, tool groups, and limits.",
    group: "meta",
    mutating: false,
    schema: z.object({}),
    handler: (ctx) => {
      const ws = ctx.runtime.workspace();
      return {
        app: APP_NAME,
        version: APP_VERSION,
        mode: ctx.runtime.merged().mode,
        workspace: ws,
        limits: ctx.runtime.limits(),
        groups: [
          "meta",
          "read",
          "search",
          "edit",
          "exec",
          "git",
          "checkpoints",
          "quality",
          "highlevel",
          "browser",
        ],
      };
    },
  }),
  defineTool({
    name: "get_config",
    description: "Return the merged configuration for the active workspace (secrets redacted).",
    group: "meta",
    mutating: false,
    schema: z.object({}),
    handler: (ctx) => {
      const m = ctx.runtime.merged();
      return {
        mode: m.mode,
        denylist: m.denylist,
        scripts: m.scripts,
        host: m.global.host,
        port: m.global.port,
        tunnel: { enabled: m.global.tunnel.enabled, hostname: m.global.tunnel.hostname },
      };
    },
  }),
  defineTool({
    name: "list_workspaces",
    description: "List registered workspace roots. Registration is only via CLI/UI.",
    group: "meta",
    mutating: false,
    schema: z.object({}),
    handler: (ctx) => ctx.runtime.workspaces.list(),
  }),
  defineTool({
    name: "set_active_workspace",
    description: "Switch the active workspace by id or name. Cannot add new roots.",
    group: "meta",
    mutating: false,
    schema: z.object({ id: z.string() }),
    handler: (ctx, args) => ctx.runtime.workspaces.setActive(args.id),
  }),
  defineTool({
    name: "get_project_overview",
    description:
      "Cheap orientation: languages, package manager, scripts, entrypoints, top-level tree, README excerpt.",
    group: "meta",
    mutating: false,
    schema: z.object({}),
    handler: (ctx) => getProjectOverview(ctx.runtime.workspace().root),
  }),
  defineTool({
    name: "get_coding_guidance",
    description:
      "Standards for modular, minimal edits when using hands edit tools. Call before large refactors.",
    group: "meta",
    mutating: false,
    schema: z.object({}),
    handler: (ctx) => {
      const { text, sources } = mergeWorkspaceGuidance(ctx.runtime.workspace().root);
      return { guidance: text, sources };
    },
  }),
];
