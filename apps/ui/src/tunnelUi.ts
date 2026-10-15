import type { TunnelMode } from "./api.js";

export type TunnelProvider = "off" | "cloudflare" | "ngrok";
export type CloudflareTunnelMode = "quick" | "token" | "named";

export function tunnelModeToProvider(mode: TunnelMode): TunnelProvider {
  if (mode === "ngrok") return "ngrok";
  if (mode === "off") return "off";
  return "cloudflare";
}

export function cloudflareModeFromTunnel(mode: TunnelMode): CloudflareTunnelMode {
  if (mode === "token" || mode === "named") return mode;
  return "quick";
}

export function tunnelModeForProvider(
  provider: TunnelProvider,
  cloudflareMode: CloudflareTunnelMode,
  current: TunnelMode,
): TunnelMode {
  if (provider === "off") return "off";
  if (provider === "ngrok") return "ngrok";
  if (current === "quick" || current === "token" || current === "named") {
    return cloudflareMode;
  }
  return cloudflareMode;
}
