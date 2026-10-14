# Custom tools

Drop a JS module in `~/.editer/tools/` (or `<workspace>/.editer/tools/`). It is loaded through the same registry as built-ins and hot-reloaded on change.

```bash
editer tool new my_tool
```

Export shape:

```js
export default {
  name: "my_tool",
  description: "What the model should know",
  schema: { parse: (args) => args },
  async handler(ctx, args) {
    // ctx.runtime.workspace()
    // ctx.runtime.resolve(path, "read" | "write")  — jailed fs
    // ctx.runtime.approvals.request(...)
    // ctx.runtime.audit.record(...)
    // ctx.runtime.processes.start(...)
    return { ok: true };
  },
};
```

Examples live in `examples/tools/`. Copy them into `~/.editer/tools/` to try.

A failed plugin cannot take down the daemon; load errors appear in the UI via `plugin.error` events.
