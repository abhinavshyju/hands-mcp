import type { FastifyRequest } from "fastify";
import type { EditerRuntime } from "@editer/core";

/** Auth disabled for now — attach a default client label for audit logs. */
export function registerAuth(_runtime: EditerRuntime) {
  return async function authHook(req: FastifyRequest): Promise<void> {
    (req as FastifyRequest & { clientName?: string }).clientName = "mcp";
  };
}
