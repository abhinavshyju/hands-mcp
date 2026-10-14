import type { Command } from "commander";
import { runtimeFromOpts } from "../runtime-opts.js";

export function registerToken(program: Command): void {
  const token = program.command("token");
  token
    .command("new")
    .argument("<name>")
    .option("--home <dir>")
    .action((name: string, opts: { home?: string }) => {
      const t = runtimeFromOpts(opts).tokens.create(name);
      console.log(`${t.name}\t${t.id}\t${t.token}`);
    });
  token
    .command("list")
    .option("--home <dir>")
    .action((opts: { home?: string }) => {
      for (const t of runtimeFromOpts(opts).tokens.list()) {
        console.log(`${t.name}\t${t.id}\t${t.createdAt}`);
      }
    });
  token
    .command("revoke")
    .argument("<id>")
    .option("--home <dir>")
    .action((id: string, opts: { home?: string }) => {
      runtimeFromOpts(opts).tokens.revoke(id);
    });
}
