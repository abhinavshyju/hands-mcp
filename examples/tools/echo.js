export default {
  name: "echo_workspace",
  description: "Return the active workspace root and the provided message.",
  schema: {
    parse(args) {
      return args ?? {};
    },
  },
  async handler(ctx, args) {
    return { workspace: ctx.runtime.workspace().root, args };
  },
};
