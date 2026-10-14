import { z } from "zod";

export const workspaceModeSchema = z.enum(["readonly", "review", "auto"]);
export type WorkspaceMode = z.infer<typeof workspaceModeSchema>;

export const policyActionSchema = z.enum(["allow", "approve", "deny"]);
export type PolicyAction = z.infer<typeof policyActionSchema>;

export const toolGroupSchema = z.enum([
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
  "plugin",
]);
export type ToolGroup = z.infer<typeof toolGroupSchema>;

export const clientTokenSchema = z.object({
  id: z.string(),
  name: z.string(),
  token: z.string(),
  createdAt: z.number(),
  revokedAt: z.number().optional(),
});
export type ClientToken = z.infer<typeof clientTokenSchema>;

export const workspaceRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  root: z.string(),
  mode: workspaceModeSchema.default("review"),
  createdAt: z.number(),
});
export type WorkspaceRecord = z.infer<typeof workspaceRecordSchema>;

export const tunnelConfigSchema = z.object({
  enabled: z.boolean().default(false),
  hostname: z.string().optional(),
  tunnelName: z.string().optional(),
  credentialsFile: z.string().optional(),
  configFile: z.string().optional(),
});
export type TunnelConfig = z.infer<typeof tunnelConfigSchema>;

export const toolGroupOverridesSchema = z
  .record(toolGroupSchema, policyActionSchema)
  .default({});

export const globalConfigSchema = z.object({
  host: z.string().default("127.0.0.1"),
  port: z.number().int().positive().default(4877),
  tokens: z.array(clientTokenSchema).default([]),
  tunnel: tunnelConfigSchema.default({ enabled: false }),
  pluginDir: z.string().optional(),
  workspaces: z.array(workspaceRecordSchema).default([]),
  activeWorkspaceId: z.string().optional(),
  approvalTimeoutMs: z.number().int().positive().default(120_000),
  exposeUiOverTunnel: z.boolean().default(false),
  approvalWebhookUrl: z.string().url().optional(),
  rateLimitWindowMs: z.number().int().positive().default(60_000),
  rateLimitMax: z.number().int().positive().default(120),
});
export type GlobalConfig = z.infer<typeof globalConfigSchema>;

export const projectConfigSchema = z.object({
  mode: workspaceModeSchema.optional(),
  denylist: z.array(z.string()).default([]),
  scripts: z
    .object({
      test: z.string().optional(),
      lint: z.string().optional(),
      build: z.string().optional(),
    })
    .default({}),
  toolGroupOverrides: toolGroupOverridesSchema,
  allowlistCommands: z.array(z.string()).optional(),
  allowedBrowserHosts: z.array(z.string()).default([]),
});
export type ProjectConfig = z.infer<typeof projectConfigSchema>;

export const mergedConfigSchema = z.object({
  global: globalConfigSchema,
  project: projectConfigSchema,
  mode: workspaceModeSchema,
  denylist: z.array(z.string()),
  scripts: z.object({
    test: z.string().optional(),
    lint: z.string().optional(),
    build: z.string().optional(),
  }),
  toolGroupOverrides: toolGroupOverridesSchema,
});
export type MergedConfig = z.infer<typeof mergedConfigSchema>;

export const auditEventSchema = z.object({
  id: z.string(),
  ts: z.number(),
  type: z.string(),
  clientId: z.string().optional(),
  clientName: z.string().optional(),
  workspaceId: z.string().optional(),
  tool: z.string().optional(),
  mutating: z.boolean().optional(),
  args: z.unknown().optional(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  durationMs: z.number().optional(),
  checkpointId: z.string().optional(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

export const approvalRequestSchema = z.object({
  id: z.string(),
  ts: z.number(),
  tool: z.string(),
  group: toolGroupSchema,
  summary: z.string(),
  preview: z.string().optional(),
  diff: z.string().optional(),
  command: z.string().optional(),
  clientId: z.string().optional(),
  clientName: z.string().optional(),
  workspaceId: z.string(),
  timeoutMs: z.number(),
  status: z.enum(["pending", "approved", "rejected", "timeout"]).default("pending"),
  reason: z.string().optional(),
});
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;

export const checkpointRecordSchema = z.object({
  id: z.string(),
  ts: z.number(),
  tool: z.string(),
  clientName: z.string().optional(),
  files: z.array(z.string()),
  sha: z.string(),
  message: z.string(),
});
export type CheckpointRecord = z.infer<typeof checkpointRecordSchema>;

export const browserSessionSchema = z.object({
  name: z.string(),
  url: z.string(),
  title: z.string().optional(),
  consoleErrors: z.number(),
  createdAt: z.number(),
  lastUsedAt: z.number(),
});
export type BrowserSession = z.infer<typeof browserSessionSchema>;

export const processRecordSchema = z.object({
  id: z.string(),
  command: z.string(),
  cwd: z.string(),
  pid: z.number().optional(),
  startedAt: z.number(),
  exitedAt: z.number().optional(),
  exitCode: z.number().nullable().optional(),
  detectedPort: z.number().optional(),
  status: z.enum(["running", "exited", "killed"]),
});
export type ProcessRecord = z.infer<typeof processRecordSchema>;

export const daemonStateSchema = z.object({
  version: z.string(),
  host: z.string(),
  port: z.number(),
  mode: workspaceModeSchema,
  workspace: workspaceRecordSchema.nullable(),
  tunnel: z.object({
    enabled: z.boolean(),
    hostname: z.string().optional(),
    healthy: z.boolean(),
    status: z.string(),
  }),
  clients: z.number(),
  toolCount: z.number(),
  headless: z.boolean(),
});
export type DaemonState = z.infer<typeof daemonStateSchema>;

export const controlEventSchema = z.object({
  type: z.string(),
  ts: z.number(),
  payload: z.unknown(),
});
export type ControlEvent = z.infer<typeof controlEventSchema>;

export const limitsSchema = z.object({
  readBytes: z.number(),
  outputBytes: z.number(),
  fileSize: z.number(),
  grepMatches: z.number(),
  commandTimeoutMs: z.number(),
  approvalTimeoutMs: z.number(),
});
export type Limits = z.infer<typeof limitsSchema>;
