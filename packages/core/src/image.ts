import { HandsError } from "@hands/shared";

export interface GeneratedImage {
  mimeType: string;
  bytes: Buffer;
}

export interface ImageSource {
  generate(prompt: string): Promise<GeneratedImage>;
}

export interface SamplingContent {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface SamplingClient {
  available(): boolean;
  createMessage(prompt: string): Promise<{ content: SamplingContent | SamplingContent[] }>;
}

const IMAGE_PROMPT_PREFIX =
  "Generate an image (not text) for the following request. Return image content, not a description.\n\n";

function asList(content: SamplingContent | SamplingContent[]): SamplingContent[] {
  return Array.isArray(content) ? content : [content];
}

export function samplingImageSource(client: SamplingClient | undefined): ImageSource {
  return {
    async generate(prompt: string): Promise<GeneratedImage> {
      if (!client) {
        throw new HandsError(
          "SAMPLING_UNAVAILABLE",
          "this client does not advertise sampling capability",
        );
      }
      if (!client.available()) {
        throw new HandsError(
          "SAMPLING_UNAVAILABLE",
          "this client does not advertise sampling capability",
        );
      }
      const result = await client.createMessage(`${IMAGE_PROMPT_PREFIX}${prompt}`);
      const blocks = asList(result.content);
      const image = blocks.find((b) => b.type === "image" && typeof b.data === "string");
      if (!image?.data) {
        const kinds = blocks.map((b) => b.type).join(", ") || "empty";
        throw new HandsError(
          "SAMPLING_NOT_IMAGE",
          `the model returned text instead of an image (content types: ${kinds})`,
        );
      }
      return {
        mimeType: image.mimeType ?? "image/png",
        bytes: Buffer.from(image.data, "base64"),
      };
    },
  };
}
