import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { customProvider } from "ai";
import { getUserProviderByProviderId } from "@/lib/db/queries";
import { isTestEnvironment } from "../constants";
import { KNOWN_PROVIDERS } from "./provider-registry";

export const myProvider = isTestEnvironment
  ? (() => {
      const { chatModel, titleModel } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "title-model": titleModel,
        },
      });
    })()
  : null;

export async function getLanguageModel(modelId: string, userId: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  const [providerSlug, ...rest] = modelId.split("/");
  const modelName = rest.join("/");

  const config = await getUserProviderByProviderId({
    userId,
    providerId: providerSlug,
  });

  if (!config) {
    throw new Error(`No API key configured for provider: ${providerSlug}`);
  }

  switch (config.providerType) {
    case "anthropic":
      return createAnthropic({
        apiKey: config.apiKey,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      })(modelName);
    case "google":
      return createGoogleGenerativeAI({
        apiKey: config.apiKey,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      })(modelName);
    case "openai-compatible":
    default: {
      const baseURL =
        config.baseUrl ?? KNOWN_PROVIDERS[providerSlug]?.defaultBaseUrl;
      if (!baseURL) {
        throw new Error(
          `No base URL configured for provider: ${providerSlug}. Please set a base URL in your provider settings.`
        );
      }
      return createOpenAICompatible({
        name: providerSlug,
        apiKey: config.apiKey,
        baseURL,
      })(modelName);
    }
  }
}

export async function getTitleModel(modelId: string, userId: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }
  return getLanguageModel(modelId, userId);
}
