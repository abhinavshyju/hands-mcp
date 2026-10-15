import type { Command } from "commander";
import { runtimeFromOpts } from "../runtime-opts.js";
import { printKv } from "../ui/render.js";
import { styles } from "../ui/theme.js";

export function registerToken(program: Command): void {
  const token = program.command("token");
  token
    .command("new")
    .argument("<name>")
    .option("--home <dir>")
    .action((name: string, opts: { home?: string }) => {
      const t = runtimeFromOpts(opts).tokens.create(name);
      printKv([
        { key: "name", value: t.name },
        { key: "id", value: t.id },
        { key: "token", value: t.token, valueStyle: styles.bold },
      ]);
    });
  token
    .command("list")
    .option("--home <dir>")
    .action((opts: { home?: string }) => {
      for (const t of runtimeFromOpts(opts).tokens.list()) {
        printKv([
          { key: "name", value: t.name },
          { key: "id", value: t.id },
          { key: "created", value: String(t.createdAt) },
        ]);
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
