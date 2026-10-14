import path from "node:path";
import {
  APP_VERSION,
  DEFAULT_APPROVAL_TIMEOUT_MS,
  DEFAULT_COMMAND_TIMEOUT_MS,
  DEFAULT_FILE_SIZE_LIMIT,
  DEFAULT_GREP_MATCH_CAP,
  DEFAULT_OUTPUT_BYTES,
  DEFAULT_READ_BYTES,
  type ClientToken,
  type Limits,
  type MergedConfig,
  type WorkspaceRecord,
} from "@editer/shared";
import { ApprovalManager } from "./approvals.js";
import { AuditLog } from "./audit.js";
import { loadMerged, loadProjectConfig, mergeConfig } from "./config.js";
import { EventBus } from "./events.js";
import { FileLockManager } from "./filelock.js";
import { resolvePath } from "./jail.js";
import { resolveEditerPaths, type EditerPaths } from "./paths.js";
import { BrowserManager } from "./browser.js";
import { ProcessManager } from "./processes.js";
import { SymbolIndex } from "./symbols.js";
import { TokenStore } from "./tokens.js";
import { TunnelSupervisor } from "./tunnel.js";
import { WorkspaceRegistry } from "./workspaces.js";

export interface RuntimeOptions {
  home?: string;
  headless?: boolean;
  host?: string;
  port?: number;
  noTunnel?: boolean;
  modeOverride?: MergedConfig["mode"];
}

export class EditerRuntime {
  readonly paths: EditerPaths;
  readonly events: EventBus;
  readonly audit: AuditLog;
  readonly workspaces: WorkspaceRegistry;
  readonly tokens: TokenStore;
  readonly approvals: ApprovalManager;
  readonly processes: ProcessManager;
  readonly browser: BrowserManager;
  readonly locks: FileLockManager;
  readonly symbols: SymbolIndex;
  readonly tunnel: TunnelSupervisor;
  readonly headless: boolean;
  host: string;
  port: number;
  noTunnel: boolean;
  modeOverride?: MergedConfig["mode"];
  currentClient?: ClientToken;

  constructor(opts: RuntimeOptions = {}) {
    this.paths = resolveEditerPaths(opts.home);
    this.events = new EventBus();
    this.audit = new AuditLog(this.paths, this.events);
    this.workspaces = new WorkspaceRegistry(this.paths);
    this.tokens = new TokenStore(this.paths);
    this.headless = opts.headless ?? false;
    this.host = opts.host ?? "127.0.0.1";
    this.port = opts.port ?? 4877;
    this.noTunnel = opts.noTunnel ?? false;
    this.modeOverride = opts.modeOverride;
    const timeout = loadMerged(this.paths).global.approvalTimeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS;
    this.approvals = new ApprovalManager(this.events, this.audit, timeout);
    this.processes = new ProcessManager(this.events);
    this.browser = new BrowserManager(this.events);
    this.locks = new FileLockManager();
    this.symbols = new SymbolIndex();
    this.tunnel = new TunnelSupervisor(this.paths, this.events, this.port);
  }

  merged(): MergedConfig {
    const m = loadMerged(this.paths);
    if (this.modeOverride) return { ...m, mode: this.modeOverride };
    return m;
  }

  workspace(): WorkspaceRecord {
    return this.workspaces.requireActive();
  }

  projectConfig() {
    return loadProjectConfig(this.workspace().root);
  }

  resolve(input: string, op: "read" | "write"): string {
    const ws = this.workspace();
    return resolvePath({
      workspaceRoot: ws.root,
      input,
      op,
      extraDenylist: this.merged().denylist,
    });
  }

  rel(abs: string): string {
    return path.relative(this.workspace().root, abs);
  }

  limits(): Limits {
    return {
      readBytes: DEFAULT_READ_BYTES,
      outputBytes: DEFAULT_OUTPUT_BYTES,
      fileSize: DEFAULT_FILE_SIZE_LIMIT,
      grepMatches: DEFAULT_GREP_MATCH_CAP,
      commandTimeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
      approvalTimeoutMs: this.merged().global.approvalTimeoutMs,
    };
  }

  version(): string {
    return APP_VERSION;
  }

  mergeFor(ws: WorkspaceRecord): MergedConfig {
    return mergeConfig(this.merged().global, loadProjectConfig(ws.root), ws.mode, this.modeOverride);
  }
}
