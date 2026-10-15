import { z } from "zod";
import { atomicWriteBuffer, samplingImageSource } from "@hands/core";
import { defineTool } from "./types.js";
import { mediaFromBuffer, withMedia } from "./media.js";

export const imageTools = [
  defineTool({
    name: "generate_image",
    description:
      "Ask the connected MCP client's model (sampling) to generate an image and write it into the workspace. Fails with SAMPLING_UNAVAILABLE if the client does not advertise sampling, or SAMPLING_NOT_IMAGE if the model returns text.",
    group: "highlevel",
    mutating: true,
    schema: z.object({
      prompt: z.string().min(1),
      path: z.string().default(".hands/media/generated.png"),
    }),
    handler: async (ctx, args) => {
      const source = samplingImageSource(ctx.sampling);
      const image = await source.generate(args.prompt);
      const abs = ctx.runtime.resolve(args.path, "write");
      atomicWriteBuffer(abs, image.bytes);
      const { item, inline } = mediaFromBuffer(image.mimeType, image.bytes, args.path);
      return withMedia(
        {
          path: args.path,
          mimeType: image.mimeType,
          bytes: image.bytes.byteLength,
          inlined: inline,
        },
        [item],
      );
    },
  }),
];
