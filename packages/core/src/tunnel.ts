import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { APP_NAME, type TunnelConfig, type TunnelMode } from "@editer/shared";
import type { EditerPaths } from "./paths.js";
import { ensureDir } from "./paths.js";
import type { EventBus } from "./events.js";
import { loadGlobalConfig, saveGlobalConfig } from "./config.js";

export interface TunnelState {
  enabled: boolean;
  mode?: TunnelMode;
  hostname?: string;
  quickUrl?: string;
  healthy: boolean;
  status: string;
  lastError?: string;
}

export function parseQuickTunnelUrl(text: string): string | undefined {
  const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  return m?.[0];
}

export function effectiveTunnelMode(cfg: TunnelConfig): TunnelMode {
  if (cfg.mode && cfg.mode !== "off") return cfg.mode;
  if (cfg.enabled) return "named";
  return "off";
}

export function buildCloudflaredArgs(cfg: TunnelConfig, localPort: number): string[] {
  const mode = effectiveTunnelMode(cfg);
  if (mode === "quick") {
    return ["tunnel", "--url", `http://127.0.0.1:${localPort}`];
  }
  if (mode === "token") {
    if (!cfg.token) throw new Error("Tunnel token not configured");
    return ["tunnel", "run", "--token", cfg.token];
  }
  if (mode === "named") {
    if (cfg.configFile && fs.existsSync(cfg.configFile)) {
      return ["tunnel", "--config", cfg.configFile, "run"];
    }
    if (cfg.tunnelName) {
      return ["tunnel", "run", cfg.tunnelName];
    }
    throw new Error("Named tunnel not configured (run editer tunnel setup)");
  }
  throw new Error("Tunnel is off");
}

export class TunnelSupervisor {
  private child: ChildProcess | undefined;
  private state: TunnelState = { enabled: false, healthy: false, status: "idle" };
  private stopping = false;

  constructor(
    private readonly paths: EditerPaths,
    private readonly events: EventBus,
    private readonly localPort: number,
  ) {}

  getLocalPort(): number {
    return this.localPort;
  }

  getState(): TunnelState {
    return { ...this.state };
  }

  findCloudflared(): string | undefined {
    const local = path.join(this.paths.bin, "cloudflared");
    if (fs.existsSync(local)) return local;
    const candidates = ["/usr/local/bin/cloudflared", "/usr/bin/cloudflared"];
    for (const c of candidates) {
      if (c.startsWith("/") && fs.existsSync(c)) return c;
    }
    return "cloudflared";
  }

  async ensureBinary(): Promise<string> {
    ensureDir(this.paths.bin);
    const existing = this.findCloudflared();
    if (existing && existing !== "cloudflared" && fs.existsSync(existing)) return existing;
    const dest = path.join(this.paths.bin, "cloudflared");
    if (fs.existsSync(dest)) return dest;
    const url = defaultDownloadUrl();
    await downloadFile(url, dest);
    fs.chmodSync(dest, 0o755);
    return dest;
  }

  async applyConfig(patch: Partial<TunnelConfig> & { exposeUiOverTunnel?: boolean }): Promise<TunnelState> {
    const cfg = loadGlobalConfig(this.paths);
    if (patch.exposeUiOverTunnel !== undefined) {
      cfg.exposeUiOverTunnel = patch.exposeUiOverTunnel;
    }
    const nextTunnel = { ...cfg.tunnel, ...patch };
    if (patch.mode !== undefined) {
      nextTunnel.enabled = patch.mode !== "off";
    }
    cfg.tunnel = nextTunnel;
    saveGlobalConfig(this.paths, cfg);
    return this.getState();
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  async start(): Promise<void> {
    const cfg = loadGlobalConfig(this.paths);
    const mode = effectiveTunnelMode(cfg.tunnel);
    if (mode === "off") {
      this.state = { enabled: false, mode: "off", healthy: false, status: "disabled" };
      this.events.emit("tunnel.status", this.state);
      return;
    }
    this.stopping = false;
    let bin: string;
    let args: string[];
    try {
      bin = await this.ensureBinary();
      args = buildCloudflaredArgs(cfg.tunnel, this.localPort);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.state = {
        enabled: true,
        mode,
        hostname: cfg.tunnel.hostname,
        healthy: false,
        status: "not-configured",
        lastError: msg,
      };
      this.events.emit("tunnel.status", this.state);
      return;
    }
    this.state = {
      enabled: true,
      mode,
      hostname: cfg.tunnel.hostname,
      quickUrl: cfg.tunnel.quickUrl,
      healthy: false,
      status: "starting",
    };
    this.events.emit("tunnel.status", this.state);
    this.spawnLoop(bin, args, mode);
  }

  private spawnLoop(bin: string, args: string[], mode: TunnelMode, attempt = 0): void {
    if (this.stopping) return;
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    this.child = child;
    const onOut = (d: Buffer) => {
      const text = d.toString("utf8");
      if (/Registered tunnel connection|connIndex/.test(text)) {
        this.state = { ...this.state, healthy: true, status: "connected", lastError: undefined };
        this.events.emit("tunnel.status", this.state);
      }
      if (mode === "quick") {
        const url = parseQuickTunnelUrl(text);
        if (url) {
          this.state = { ...this.state, quickUrl: url, hostname: url.replace(/^https:\/\//, ""), healthy: true, status: "connected" };
          this.events.emit("tunnel.status", this.state);
          const cfg = loadGlobalConfig(this.paths);
          cfg.tunnel = { ...cfg.tunnel, quickUrl: url, hostname: url.replace(/^https:\/\//, "") };
          saveGlobalConfig(this.paths, cfg);
        }
      }
      if (/error|ERR|failed/i.test(text) && !/level=error/i.test(text)) {
        this.state = { ...this.state, lastError: text.trim().slice(0, 500) };
        this.events.emit("tunnel.status", this.state);
      }
    };
    child.stdout?.on("data", onOut);
    child.stderr?.on("data", onOut);
    child.on("exit", () => {
      this.state = { ...this.state, healthy: false, status: "disconnected" };
      this.events.emit("tunnel.status", this.state);
      if (!this.stopping) {
        const delay = Math.min(30_000, 1000 * 2 ** attempt);
        setTimeout(() => this.spawnLoop(bin, args, mode, attempt + 1), delay);
      }
    });
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.child?.kill("SIGTERM");
    this.child = undefined;
    this.state = { ...this.state, healthy: false, status: "stopped" };
    this.events.emit("tunnel.status", this.state);
  }

  async verifyPublicHealth(hostname: string): Promise<boolean> {
    return await new Promise((resolve) => {
      const req = https.get(`https://${hostname}/healthz`, { timeout: 8000 }, (res) => {
        resolve((res.statusCode ?? 500) < 500);
      });
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
    });
  }
}

function defaultDownloadUrl(): string {
  const plat = process.platform;
  const arch = process.arch;
  if (plat === "linux" && arch === "x64") {
    return "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64";
  }
  if (plat === "linux" && arch === "arm64") {
    return "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64";
  }
  if (plat === "darwin" && arch === "arm64") {
    return "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz";
  }
  if (plat === "darwin") {
    return "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz";
  }
  throw new Error(`Unsupported platform for cloudflared download: ${plat}/${arch}`);
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, { headers: { "User-Agent": APP_NAME } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlinkSync(dest);
          downloadFile(res.headers.location, dest).then(resolve, reject);
          return;
        }
        if ((res.statusCode ?? 500) >= 400) {
          reject(new Error(`Download failed: ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
      })
      .on("error", reject);
  });
}

export function writeTunnelConfig(paths: EditerPaths, opts: { tunnelId: string; credentialsFile: string; hostname: string; port: number }): string {
  ensureDir(paths.tunnel);
  const configFile = path.join(paths.tunnel, "config.yml");
  const body = `tunnel: ${opts.tunnelId}
credentials-file: ${opts.credentialsFile}
ingress:
  - hostname: ${opts.hostname}
    service: http://127.0.0.1:${opts.port}
  - service: http_status:404
`;
  fs.writeFileSync(configFile, body, "utf8");
  return configFile;
}
