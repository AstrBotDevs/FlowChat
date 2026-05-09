import { createAlibaba } from "@ai-sdk/alibaba";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGatewayProvider } from "@ai-sdk/gateway";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMoonshotAI } from "@ai-sdk/moonshotai";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createXai } from "@ai-sdk/xai";
import { customProvider } from "ai";
import {
  getSelectionModelId,
  type ModelSelection,
} from "@/lib/ai/model-selection";
import { getUserProviderByProviderId } from "@/lib/db/queries";
import { isTestEnvironment } from "../constants";
import { GATEWAY_PROVIDER_ID } from "./provider-registry";

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

function getDirectModelName(selection: ModelSelection) {
  const [, ...rest] = selection.modelId.split("/");
  return rest.join("/") || selection.modelId;
}

export async function getLanguageModel(
  selection: ModelSelection,
  userId: string
) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(getSelectionModelId(selection));
  }

  if (selection.source === "gateway") {
    const config = await getUserProviderByProviderId({
      userId,
      providerId: GATEWAY_PROVIDER_ID,
    });

    if (!config) {
      throw new Error("No AI Gateway API key configured");
    }

    return createGatewayProvider({ apiKey: config.apiKey })(selection.modelId);
  }

  const config = await getUserProviderByProviderId({
    userId,
    providerId: selection.providerId,
  });

  if (!config) {
    throw new Error(
      `No API key configured for provider: ${selection.providerId}`
    );
  }

  if (selection.source === "custom") {
    if (!config.baseUrl) {
      throw new Error(
        `No base URL configured for custom provider: ${selection.providerId}`
      );
    }

    return createOpenAICompatible({
      name: config.displayName ?? selection.providerId,
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    })(selection.modelId);
  }

  const modelName = getDirectModelName(selection);

  switch (config.providerType) {
    case "openai":
      return createOpenAI({ apiKey: config.apiKey })(modelName);
    case "anthropic":
      return createAnthropic({ apiKey: config.apiKey })(modelName);
    case "google":
      return createGoogleGenerativeAI({ apiKey: config.apiKey })(modelName);
    case "deepseek":
      return createDeepSeek({ apiKey: config.apiKey })(modelName);
    case "moonshotai":
      return createMoonshotAI({ apiKey: config.apiKey })(modelName);
    case "alibaba":
      return createAlibaba({ apiKey: config.apiKey })(modelName);
    case "xai":
      return createXai({ apiKey: config.apiKey })(modelName);
    default:
      throw new Error(
        `Provider ${selection.providerId} is not configured for direct access`
      );
  }
}

export async function getTitleModel(selection: ModelSelection, userId: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }
  return await getLanguageModel(selection, userId);
}
