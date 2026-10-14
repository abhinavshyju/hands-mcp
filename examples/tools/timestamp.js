export default {
  name: "workspace_time",
  description: "Return the daemon local time.",
  schema: { parse: (args) => args ?? {} },
  async handler() {
    return { now: new Date().toISOString() };
  },
};
