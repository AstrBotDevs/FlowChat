import type { DirectProviderId } from "./provider-registry";

export type ModelDiscoveryResult = {
  models: string[];
  warning?: string;
};

export function normalizeModelIds(models: string[]): string[] {
  return Array.from(
    new Set(models.map((model) => model.trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
}

async function discoverModelsFromUrl({
  url,
  headers = {},
  parseModels,
}: {
  url: string;
  headers?: Record<string, string>;
  parseModels: (json: unknown) => string[];
}): Promise<ModelDiscoveryResult> {
  try {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return {
        models: [],
        warning: `Model discovery failed with ${res.status}`,
      };
    }

    const json = await res.json();
    return { models: normalizeModelIds(parseModels(json)) };
  } catch (error) {
    return {
      models: [],
      warning:
        error instanceof Error ? error.message : "Model discovery failed",
    };
  }
}

function parseOpenAICompatibleModels(json: unknown): string[] {
  if (
    !json ||
    typeof json !== "object" ||
    !Array.isArray((json as { data?: unknown }).data)
  ) {
    return [];
  }

  return (json as { data: Array<{ id?: unknown }> }).data
    .map((model) => (typeof model.id === "string" ? model.id : null))
    .filter((id: string | null): id is string => Boolean(id));
}

function parseGoogleModels(json: unknown): string[] {
  if (
    !json ||
    typeof json !== "object" ||
    !Array.isArray((json as { models?: unknown }).models)
  ) {
    return [];
  }

  return (json as { models: Array<{ name?: unknown; id?: unknown }> }).models
    .map((model) => {
      if (typeof model.name === "string") {
        return model.name;
      }
      return typeof model.id === "string" ? model.id : null;
    })
    .filter((id: string | null): id is string => Boolean(id));
}

export function discoverOpenAICompatibleModels({
  baseUrl,
  apiKey,
}: {
  baseUrl: string;
  apiKey: string;
}): Promise<ModelDiscoveryResult> {
  return discoverModelsFromUrl({
    url: `${baseUrl.replace(/\/$/, "")}/models`,
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    parseModels: parseOpenAICompatibleModels,
  });
}

export function discoverDirectProviderModels({
  providerType,
  apiKey,
}: {
  providerType: DirectProviderId;
  apiKey: string;
}): Promise<ModelDiscoveryResult> {
  switch (providerType) {
    case "openai":
      return discoverModelsFromUrl({
        url: "https://api.openai.com/v1/models",
        headers: { Authorization: `Bearer ${apiKey}` },
        parseModels: parseOpenAICompatibleModels,
      });
    case "anthropic":
      return discoverModelsFromUrl({
        url: "https://api.anthropic.com/v1/models",
        headers: {
          "anthropic-version": "2023-06-01",
          "x-api-key": apiKey,
        },
        parseModels: parseOpenAICompatibleModels,
      });
    case "google":
      return discoverModelsFromUrl({
        url: `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        parseModels: parseGoogleModels,
      });
    case "deepseek":
      return discoverModelsFromUrl({
        url: "https://api.deepseek.com/v1/models",
        headers: { Authorization: `Bearer ${apiKey}` },
        parseModels: parseOpenAICompatibleModels,
      });
    case "moonshotai":
      return discoverModelsFromUrl({
        url: "https://api.moonshot.cn/v1/models",
        headers: { Authorization: `Bearer ${apiKey}` },
        parseModels: parseOpenAICompatibleModels,
      });
    case "alibaba":
      return discoverModelsFromUrl({
        url: "https://dashscope.aliyuncs.com/compatible-mode/v1/models",
        headers: { Authorization: `Bearer ${apiKey}` },
        parseModels: parseOpenAICompatibleModels,
      });
    case "xai":
      return discoverModelsFromUrl({
        url: "https://api.x.ai/v1/models",
        headers: { Authorization: `Bearer ${apiKey}` },
        parseModels: parseOpenAICompatibleModels,
      });
    default:
      return Promise.resolve({
        models: [],
        warning: "Provider does not support model discovery",
      });
  }
}
