import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  discoverDirectProviderModels,
  discoverOpenAICompatibleModels,
} from "@/lib/ai/model-discovery";
import { isDirectProviderId } from "@/lib/ai/provider-registry";
import {
  getUserProviderByProviderId,
  upsertUserProvider,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

const discoverSchema = z.union([
  z.object({
    apiKey: z.string().min(1),
    baseUrl: z.string().url(),
  }),
  z.object({
    providerId: z.string().min(1).max(64),
  }),
]);

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  let body: z.infer<typeof discoverSchema>;
  try {
    const json = await request.json();
    body = discoverSchema.parse(json);
  } catch {
    return new ChatbotError("bad_request:api").toResponse();
  }

  if ("providerId" in body) {
    const config = await getUserProviderByProviderId({
      userId: session.user.id,
      providerId: body.providerId,
    });

    if (!config) {
      return new ChatbotError("not_found:api").toResponse();
    }

    let discovered;
    if (isDirectProviderId(config.providerType)) {
      discovered = await discoverDirectProviderModels({
        providerType: config.providerType,
        apiKey: config.apiKey,
      });
    } else if (config.providerType === "openai-compatible") {
      if (!config.baseUrl) {
        return new ChatbotError(
          "bad_request:api",
          "Custom providers require a base URL"
        ).toResponse();
      }
      discovered = await discoverOpenAICompatibleModels({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
      });
    } else {
      return new ChatbotError(
        "bad_request:api",
        "This provider does not support model discovery"
      ).toResponse();
    }

    const [updated] = await upsertUserProvider({
      userId: session.user.id,
      providerId: config.providerId,
      displayName: config.displayName,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      providerType: config.providerType,
      models: config.models ?? [],
      discoveredModels: discovered.models,
    });

    return Response.json({
      discoveredModels: updated.discoveredModels ?? [],
      warning: discovered.warning,
    });
  }

  const discovered = await discoverOpenAICompatibleModels({
    baseUrl: body.baseUrl,
    apiKey: body.apiKey,
  });

  return Response.json(discovered);
}
