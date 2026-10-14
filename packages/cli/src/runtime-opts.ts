import { EditerRuntime } from "@editer/core";
import type { WorkspaceMode } from "@editer/shared";

export interface CommonOpts {
  home?: string;
  headless?: boolean;
  host?: string;
  port?: string;
  noTunnel?: boolean;
  mode?: string;
  url?: string;
}

export function runtimeFromOpts(opts: CommonOpts): EditerRuntime {
  return new EditerRuntime({
    home: opts.home,
    headless: opts.headless,
    host: opts.host,
    port: opts.port ? Number(opts.port) : undefined,
    noTunnel: opts.noTunnel,
    modeOverride: opts.mode as WorkspaceMode | undefined,
  });
}
