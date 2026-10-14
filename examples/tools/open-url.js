export default {
  name: "note_url",
  description: "Record a URL the agent wants the human to open.",
  schema: {
    parse(args) {
      if (!args || typeof args.url !== "string") throw new Error("url required");
      return args;
    },
  },
  async handler(ctx, args) {
    ctx.runtime.events.emit("process.output", { id: "sync", text: `Open: ${args.url}\n` });
    return { noted: args.url };
  },
};
