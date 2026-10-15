import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { APP_NAME, type TunnelConfig, type TunnelMode } from "@hands/shared";
import type { HandsPaths } from "./paths.js";
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

/** Parse ngrok agent stdout (classic or log lines). */
export function parseNgrokPublicUrl(text: string): string | undefined {
  const fwd = text.match(/https:\/\/[\w.-]+\.ngrok(?:-[\w]+)?\.(?:app|dev|io)\b/i);
  if (fwd) return fwd[0];
  const jsonUrl = text.match(/"url"\s*:\s*"(https:\/\/[^"]+)"/);
  if (jsonUrl?.[1]?.includes("ngrok")) return jsonUrl[1];
  return undefined;
}

export function findNgrokBinary(paths: HandsPaths): string {
  const local = path.join(paths.bin, "ngrok");
  if (fs.existsSync(local)) return local;
  for (const c of ["/usr/local/bin/ngrok", "/usr/bin/ngrok"]) {
    if (fs.existsSync(c)) return c;
  }
  return "ngrok";
}

export function buildNgrokArgs(localPort: number): string[] {
  return ["http", String(localPort), "--log=stdout", "--log-format=logfmt"];
}

export function effectiveTunnelMode(cfg: TunnelConfig): TunnelMode {
  if (cfg.mode && cfg.mode !== "off") return cfg.mode;
  if (cfg.enabled) return "named";
  return "off";
}

export function tunnelWanted(cfg: TunnelConfig, noTunnel: boolean): boolean {
  if (noTunnel) return false;
  return effectiveTunnelMode(cfg) !== "off";
}

/** If a named hostname + credentials exist, persist mode named so `hands .` starts cloudflared. */
export function normalizeTunnelConfigForSession(paths: HandsPaths): void {
  const cfg = loadGlobalConfig(paths);
  const hostname = normalizePublicHostname(cfg.tunnel.hostname);
  const credFallback = path.join(paths.tunnel, "credentials.json");
  const hasCreds =
    (cfg.tunnel.credentialsFile && fs.existsSync(cfg.tunnel.credentialsFile)) ||
    fs.existsSync(credFallback);
  if (!hostname || !hasCreds) return;
  if (cfg.tunnel.mode === "off") {
    cfg.tunnel = { ...cfg.tunnel, mode: "named", enabled: true };
    saveGlobalConfig(paths, cfg);
  }
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
    throw new Error("Named tunnel not configured (run hands tunnel setup)");
  }
  throw new Error("Tunnel is off");
}

function readTunnelIdFromConfig(configFile: string): string | undefined {
  try {
    const text = fs.readFileSync(configFile, "utf8");
    const m = /^tunnel:\s*(.+)$/m.exec(text);
    return m?.[1]?.trim();
  } catch {
    return undefined;
  }
}

function normalizePublicHostname(host: string | undefined): string | undefined {
  return host?.replace(/^https?:\/\//, "").trim() || undefined;
}

export class TunnelSupervisor {
  private child: ChildProcess | undefined;
  private state: TunnelState = { enabled: false, healthy: false, status: "idle" };
  private stopping = false;

  constructor(
    private readonly paths: HandsPaths,
    private readonly events: EventBus,
    private localPort: number,
  ) {}

  setLocalPort(port: number): void {
    this.localPort = port;
  }

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

  async applyConfig(
    patch: Partial<TunnelConfig> & { exposeUiOverTunnel?: boolean },
  ): Promise<TunnelState> {
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

  private resolveCredentialsFile(cfg: TunnelConfig): string | undefined {
    if (cfg.credentialsFile && fs.existsSync(cfg.credentialsFile)) return cfg.credentialsFile;
    const fallback = path.join(this.paths.tunnel, "credentials.json");
    if (fs.existsSync(fallback)) return fallback;
    return cfg.credentialsFile;
  }

  private syncNamedTunnelConfig(cfg: TunnelConfig): void {
    const mode = effectiveTunnelMode(cfg);
    if (mode !== "named") return;
    const hostname = normalizePublicHostname(cfg.hostname);
    const credentialsFile = this.resolveCredentialsFile(cfg);
    if (!hostname || !credentialsFile || !fs.existsSync(credentialsFile)) return;
    const configFile =
      cfg.configFile && fs.existsSync(cfg.configFile)
        ? cfg.configFile
        : path.join(this.paths.tunnel, "config.yml");
    const tunnelId =
      (fs.existsSync(configFile) ? readTunnelIdFromConfig(configFile) : undefined) ??
      cfg.tunnelName?.trim();
    if (!tunnelId) return;
    const nextConfig = writeTunnelConfig(this.paths, {
      tunnelId,
      credentialsFile,
      hostname,
      port: this.localPort,
    });
    const global = loadGlobalConfig(this.paths);
    global.tunnel = {
      ...global.tunnel,
      configFile: nextConfig,
      credentialsFile,
    };
    saveGlobalConfig(this.paths, global);
  }

  private publicHealthHost(mode: TunnelMode, cfg: TunnelConfig): string | undefined {
    const quick = this.state.quickUrl?.replace(/^https:\/\//, "");
    if (quick) return quick;
    if (mode === "quick" || mode === "ngrok") return undefined;
    return normalizePublicHostname(cfg.hostname);
  }

  private async verifyPublicHealthWithRetries(
    hostname: string,
    attempts = 8,
    delayMs = 2000,
  ): Promise<boolean> {
    for (let i = 0; i < attempts; i++) {
      if (await this.verifyPublicHealth(hostname)) return true;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    return false;
  }

  private async verifyAndUpdateHealth(mode: TunnelMode, cfg: TunnelConfig): Promise<void> {
    const host = this.publicHealthHost(mode, cfg);
    if (!host) return;
    const ok = await this.verifyPublicHealthWithRetries(host);
    this.state = {
      ...this.state,
      healthy: ok,
      status: ok ? "connected" : "degraded",
      lastError: ok ? undefined : "Public /healthz check failed",
    };
    this.events.emit("tunnel.status", this.state);
  }

  /** Re-check public /healthz (e.g. before printing the startup banner). */
  async refreshHealth(): Promise<TunnelState> {
    const cfg = loadGlobalConfig(this.paths);
    const mode = effectiveTunnelMode(cfg.tunnel);
    if (mode === "off") return this.getState();
    await this.verifyAndUpdateHealth(mode, cfg.tunnel);
    return this.getState();
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
    this.syncNamedTunnelConfig(cfg.tunnel);
    const refreshed = loadGlobalConfig(this.paths);
    let bin: string;
    let args: string[];
    let spawnEnv: NodeJS.ProcessEnv | undefined;
    try {
      if (mode === "ngrok") {
        bin = findNgrokBinary(this.paths);
        args = buildNgrokArgs(this.localPort);
        const token = refreshed.tunnel.ngrokAuthtoken ?? process.env.NGROK_AUTHTOKEN;
        spawnEnv = token ? { ...process.env, NGROK_AUTHTOKEN: token } : process.env;
      } else {
        bin = await this.ensureBinary();
        args = buildCloudflaredArgs(refreshed.tunnel, this.localPort);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.state = {
        enabled: true,
        mode,
        hostname: refreshed.tunnel.hostname,
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
      hostname: refreshed.tunnel.hostname,
      quickUrl: refreshed.tunnel.quickUrl,
      healthy: false,
      status: "starting",
    };
    this.events.emit("tunnel.status", this.state);

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unsub();
        resolve();
      };
      const timer = setTimeout(() => {
        void this.verifyAndUpdateHealth(mode, refreshed.tunnel).finally(finish);
      }, 15_000);
      const unsub = this.events.subscribe((event) => {
        if (event.type !== "tunnel.status") return;
        const st = event.payload as TunnelState;
        if (st.status !== "connected") return;
        void this.verifyAndUpdateHealth(mode, refreshed.tunnel).finally(finish);
      });
      this.spawnLoop(bin, args, mode, 0, spawnEnv);
    });
  }

  private spawnLoop(
    bin: string,
    args: string[],
    mode: TunnelMode,
    attempt = 0,
    spawnEnv?: NodeJS.ProcessEnv,
  ): void {
    if (this.stopping) return;
    const child = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: spawnEnv ?? process.env,
    });
    this.child = child;
    const onOut = (d: Buffer) => {
      const text = d.toString("utf8");
      if (/Registered tunnel connection|connIndex/.test(text)) {
        this.state = { ...this.state, status: "connected", lastError: undefined };
        this.events.emit("tunnel.status", this.state);
      }
      if (mode === "quick") {
        const url = parseQuickTunnelUrl(text);
        if (url) this.applyPublicTunnelUrl(url);
      }
      if (mode === "ngrok") {
        const url = parseNgrokPublicUrl(text);
        if (url) this.applyPublicTunnelUrl(url);
      }
      if (
        /\b(failed to serve|connection refused|cannot reach|no such file|authentication failed)\b/i.test(
          text,
        )
      ) {
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
        setTimeout(() => this.spawnLoop(bin, args, mode, attempt + 1, spawnEnv), delay);
      }
    });
  }

  private applyPublicTunnelUrl(url: string): void {
    this.state = {
      ...this.state,
      quickUrl: url,
      hostname: url.replace(/^https:\/\//, ""),
      healthy: false,
      status: "connected",
      lastError: undefined,
    };
    this.events.emit("tunnel.status", this.state);
    const cfg = loadGlobalConfig(this.paths);
    cfg.tunnel = { ...cfg.tunnel, quickUrl: url, hostname: url.replace(/^https:\/\//, "") };
    saveGlobalConfig(this.paths, cfg);
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
        let body = "";
        res.on("data", (chunk) => {
          body += chunk.toString("utf8");
        });
        res.on("end", () => {
          if (res.statusCode !== 200) {
            resolve(false);
            return;
          }
          try {
            const parsed = JSON.parse(body) as { ok?: boolean };
            resolve(parsed.ok === true);
          } catch {
            resolve(false);
          }
        });
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
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
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

export function writeTunnelConfig(
  paths: HandsPaths,
  opts: { tunnelId: string; credentialsFile: string; hostname: string; port: number },
): string {
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
