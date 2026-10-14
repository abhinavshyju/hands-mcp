export const APP_NAME = "editer";
export const APP_VERSION = "0.1.0";
export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 4877;
export const DEFAULT_APPROVAL_TIMEOUT_MS = 120_000;
export const DEFAULT_COMMAND_TIMEOUT_MS = 60_000;
export const DEFAULT_OUTPUT_BYTES = 512 * 1024;
export const DEFAULT_READ_BYTES = 512 * 1024;
export const DEFAULT_GREP_MATCH_CAP = 200;
export const DEFAULT_FILE_SIZE_LIMIT = 8 * 1024 * 1024;
export const DEFAULT_INLINE_MEDIA_BYTES = Math.floor(1.5 * 1024 * 1024);
export const BROWSER_IDLE_MS = 5 * 60 * 1000;
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX = 120;
export const SESSION_COOKIE = "editer_session";
export const EDITER_DIRNAME = ".editer";
export const SHADOW_GIT_DIR = "shadow.git";
export const CHECKPOINT_META = "checkpoints.jsonl";

export const SENSITIVE_KEY_PATTERN =
  /(token|secret|password|passwd|api[_-]?key|authorization|bearer|credential)/i;

export const DEFAULT_READ_DENY_GLOBS = [
  "**/.git/config",
  "**/.env",
  "**/.env.*",
  "**/*.pem",
  "**/*.key",
  "**/id_rsa",
  "**/id_ed25519",
];

export const DEFAULT_WRITE_DENY_GLOBS = ["**/node_modules/**", "**/.git/**"];

export const ABSOLUTE_DENY_PREFIXES = [".ssh", ".aws", ".gnupg", ".editer/tokens"];
