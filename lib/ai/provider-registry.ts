export const DIRECT_PROVIDER_IDS = [
  "openai",
  "anthropic",
  "google",
  "deepseek",
  "moonshotai",
  "alibaba",
  "xai",
] as const;

export type DirectProviderId = (typeof DIRECT_PROVIDER_IDS)[number];

export type ProviderType = DirectProviderId | "gateway" | "openai-compatible";

export const GATEWAY_PROVIDER_ID = "ai-gateway";

export type KnownProvider = {
  name: string;
  type: ProviderType;
};

export const KNOWN_PROVIDERS: Record<string, KnownProvider> = {
  openai: {
    name: "OpenAI",
    type: "openai",
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
    type: "deepseek",
  },
  xai: {
    name: "xAI",
    type: "xai",
  },
  moonshotai: {
    name: "Moonshot",
    type: "moonshotai",
  },
  alibaba: {
    name: "Alibaba",
    type: "alibaba",
  },
  [GATEWAY_PROVIDER_ID]: {
    name: "AI Gateway",
    type: "gateway",
  },
};

export function getProviderName(providerId: string): string {
  return KNOWN_PROVIDERS[providerId]?.name ?? providerId;
}

export function getDefaultProviderType(providerId: string): ProviderType {
  return KNOWN_PROVIDERS[providerId]?.type ?? "openai-compatible";
}

export function isDirectProviderId(
  providerId: string
): providerId is DirectProviderId {
  return DIRECT_PROVIDER_IDS.includes(providerId as DirectProviderId);
}
