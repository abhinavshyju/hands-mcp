/** Option value suggestions keyed by command path (space-separated) and long option name. */
export const OPTION_VALUES: Record<string, Record<string, string[]>> = {
  "": {
    "--mode": ["readonly", "review", "auto"],
  },
  init: {
    "--mode": ["readonly", "review", "auto"],
    "--template": ["node", "typescript", "python"],
  },
  start: {
    "--mode": ["readonly", "review", "auto"],
  },
  mode: {
    "--mode": ["readonly", "review", "auto"],
  },
  "mode set": {
    "<mode>": ["readonly", "review", "auto"],
    "--workspace": [], // filled dynamically
  },
  "workspace mode": {
    "<mode>": ["readonly", "review", "auto"],
  },
  connect: {
    "--client": ["cursor", "claude", "generic"],
  },
  stdio: {
    "--mode": ["readonly", "review", "auto"],
  },
  "tunnel set": {
    "--mode": ["off", "quick", "token", "named"],
  },
  "config show": {
    "--global": [],
    "--project": [],
    "--effective": [],
  },
};

export const CONFIG_KEYS = [
  "port",
  "host",
  "tunnel.enabled",
  "tunnel.mode",
  "tunnel.hostname",
  "tunnel.tunnelName",
  "exposeUiOverTunnel",
];
