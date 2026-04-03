export type ProviderType = "openai-compatible" | "anthropic" | "google";

export type KnownProvider = {
  name: string;
  defaultBaseUrl?: string;
  type: ProviderType;
};

export const KNOWN_PROVIDERS: Record<string, KnownProvider> = {
  openai: {
    name: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    type: "openai-compatible",
  },
  anthropic: {
    name: "Anthropic",
    type: "anthropic",
  },
  google: {
    name: "Google",
    type: "google",
  },
  deepseek: {
    name: "DeepSeek",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    type: "openai-compatible",
  },
  mistral: {
    name: "Mistral",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    type: "openai-compatible",
  },
  xai: {
    name: "xAI",
    defaultBaseUrl: "https://api.x.ai/v1",
    type: "openai-compatible",
  },
  moonshotai: {
    name: "Moonshot",
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    type: "openai-compatible",
  },
  alibaba: {
    name: "Alibaba",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    type: "openai-compatible",
  },
  cohere: {
    name: "Cohere",
    defaultBaseUrl: "https://api.cohere.com/v2",
    type: "openai-compatible",
  },
  minimax: {
    name: "MiniMax",
    defaultBaseUrl: "https://api.minimax.chat/v1",
    type: "openai-compatible",
  },
  perplexity: {
    name: "Perplexity",
    defaultBaseUrl: "https://api.perplexity.ai",
    type: "openai-compatible",
  },
  nvidia: {
    name: "Nvidia",
    defaultBaseUrl: "https://integrate.api.nvidia.com/v1",
    type: "openai-compatible",
  },
  meta: {
    name: "Meta",
    defaultBaseUrl: "https://api.llama.com/compat/v1",
    type: "openai-compatible",
  },
  "arcee-ai": {
    name: "Arcee AI",
    type: "openai-compatible",
  },
  bytedance: {
    name: "ByteDance",
    type: "openai-compatible",
  },
  inception: {
    name: "Inception",
    type: "openai-compatible",
  },
  kwaipilot: {
    name: "Kwaipilot",
    type: "openai-compatible",
  },
  meituan: {
    name: "Meituan",
    type: "openai-compatible",
  },
  morph: {
    name: "Morph",
    type: "openai-compatible",
  },
  "prime-intellect": {
    name: "Prime Intellect",
    type: "openai-compatible",
  },
  xiaomi: {
    name: "Xiaomi",
    type: "openai-compatible",
  },
  zai: {
    name: "Zai",
    type: "openai-compatible",
  },
  amazon: {
    name: "Amazon",
    type: "openai-compatible",
  },
};

export function getProviderName(providerId: string): string {
  return KNOWN_PROVIDERS[providerId]?.name ?? providerId;
}

export function getDefaultProviderType(providerId: string): ProviderType {
  return KNOWN_PROVIDERS[providerId]?.type ?? "openai-compatible";
}

export function getDefaultBaseUrl(providerId: string): string | undefined {
  return KNOWN_PROVIDERS[providerId]?.defaultBaseUrl;
}
