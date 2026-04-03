export const DEFAULT_CHAT_MODEL = "deepseek/deepseek-v3.2";

export type ModelCapabilities = {
  tools: boolean;
  vision: boolean;
  reasoning: boolean;
};

export type ChatModel = {
  id: string;
  name: string;
  provider: string;
  description: string;
  capabilities: ModelCapabilities;
  contextWindow?: number;
  maxTokens?: number;
  pricing?: {
    input: string;
    output: string;
  };
};

type GatewayModelRaw = {
  id: string;
  name: string;
  owned_by: string;
  type?: string;
  tags?: string[];
  context_window?: number;
  max_tokens?: number;
  description?: string;
  pricing?: {
    input: string;
    output: string;
  };
};

export async function getAllModels(): Promise<ChatModel[]> {
  try {
    const res = await fetch("https://ai-gateway.vercel.sh/v1/models", {
      next: { revalidate: 86_400 },
    });
    if (!res.ok) {
      return [];
    }

    const json = await res.json();
    return (json.data ?? [])
      .filter((m: GatewayModelRaw) => m.type === "language")
      .map(
        (m: GatewayModelRaw): ChatModel => ({
          id: m.id,
          name: m.name,
          provider: m.owned_by ?? m.id.split("/")[0],
          description: m.description ?? "",
          capabilities: {
            tools: m.tags?.includes("tool-use") ?? false,
            vision: m.tags?.includes("vision") ?? false,
            reasoning: m.tags?.includes("reasoning") ?? false,
          },
          contextWindow: m.context_window,
          maxTokens: m.max_tokens,
          pricing: m.pricing,
        })
      );
  } catch {
    return [];
  }
}

export function getCapabilitiesFromModels(
  models: ChatModel[]
): Record<string, ModelCapabilities> {
  return Object.fromEntries(
    models.map((m) => [m.id, m.capabilities])
  );
}
