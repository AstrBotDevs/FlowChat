import { z } from "zod";
import { DEFAULT_CHAT_MODEL } from "./models";

export const modelSelectionSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("direct"),
    providerId: z.string().min(1),
    modelId: z.string().min(1),
  }),
  z.object({
    source: z.literal("gateway"),
    modelId: z.string().min(1),
  }),
  z.object({
    source: z.literal("custom"),
    providerId: z.string().min(1),
    modelId: z.string().min(1),
  }),
]);

export type ModelSelection = z.infer<typeof modelSelectionSchema>;

export const DEFAULT_MODEL_SELECTION: ModelSelection = {
  source: "direct",
  providerId: "deepseek",
  modelId: DEFAULT_CHAT_MODEL,
};

export function getSelectionModelId(selection: ModelSelection): string {
  return selection.modelId;
}

export function getSelectionKey(selection: ModelSelection): string {
  if (selection.source === "gateway") {
    return `gateway:${selection.modelId}`;
  }
  return `${selection.source}:${selection.providerId}:${selection.modelId}`;
}

export function parseModelSelection(value: unknown): ModelSelection | null {
  const parsed = modelSelectionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseModelSelectionCookie(
  value?: string | null
): ModelSelection | null {
  if (!value) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(value);
    return parseModelSelection(JSON.parse(decoded));
  } catch {
    return null;
  }
}

export function serializeModelSelection(selection: ModelSelection): string {
  return encodeURIComponent(JSON.stringify(selection));
}

export function legacyModelIdToSelection(modelId: string): ModelSelection {
  const [providerId] = modelId.split("/");
  return {
    source: "direct",
    providerId: providerId || "deepseek",
    modelId,
  };
}
