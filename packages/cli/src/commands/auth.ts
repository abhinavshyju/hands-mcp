import type { Command } from "commander";
import {
  applyGlobalConfigKey,
  authStartupWarnings,
  buildOAuthDiscoveryUrls,
  formatOAuthDiscoveryLines,
  loadGlobalConfig,
} from "@hands/core";
import { authModeSchema } from "@hands/shared";
import { runtimeFromOpts } from "../runtime-opts.js";
import { printJson, success, writeErr, writeWarn, writeln } from "../ui/render.js";

export function registerAuth(program: Command): void {
  const auth = program.command("auth").description("Configure MCP HTTP authentication");

  auth
    .command("mode")
    .argument("<mode>", "none | bearer | oauth")
    .option("--home <dir>")
    .action((mode: string, opts: { home?: string }) => {
      const parsed = authModeSchema.parse(mode);
      const rt = runtimeFromOpts(opts);
      applyGlobalConfigKey(rt.paths, "auth.mode", JSON.stringify(parsed));
      const cfg = loadGlobalConfig(rt.paths);
      for (const w of authStartupWarnings(cfg)) writeWarn(w);
      success(`auth.mode = ${parsed}`);
    });

  auth
    .command("show")
    .option("--home <dir>")
    .action((opts: { home?: string }) => {
      const rt = runtimeFromOpts(opts);
      const cfg = loadGlobalConfig(rt.paths);
      printJson(cfg.auth);
    });

  auth
    .command("oauth-urls")
    .description("Print OAuth protected-resource and issuer URLs")
    .option("--home <dir>")
    .action((opts: { home?: string }) => {
      const rt = runtimeFromOpts(opts);
      const cfg = loadGlobalConfig(rt.paths);
      const urls = buildOAuthDiscoveryUrls(cfg);
      if (!urls) {
        writeErr(
          "No public base URL. Set auth.oauth.publicBaseUrl or configure a tunnel hostname.",
        );
        process.exitCode = 1;
        return;
      }
      for (const line of formatOAuthDiscoveryLines(urls)) writeln(line);
    });
}
