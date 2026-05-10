import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  DIRECT_PROVIDER_IDS,
  GATEWAY_PROVIDER_ID,
  isDirectProviderId,
} from "@/lib/ai/provider-registry";
import {
  discoverOpenAICompatibleModels,
  normalizeModelIds,
} from "@/lib/ai/openai-compatible";
import {
  deleteUserProvider,
  getUserProviders,
  upsertUserProvider,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { generateUUID } from "@/lib/utils";

function maskApiKey(key: string): string {
  if (key.length <= 8) {
    return `${"*".repeat(key.length)}`;
  }
  return `${key.slice(0, 4)}${"*".repeat(key.length - 8)}${key.slice(-4)}`;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const providers = await getUserProviders({ userId: session.user.id });

  const masked = providers.map((p) => ({
    id: p.id,
    providerId: p.providerId,
    displayName: p.displayName,
    providerType: p.providerType,
    baseUrl: p.baseUrl,
    models: p.models ?? [],
    apiKeyMasked: maskApiKey(p.apiKey),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));

  return Response.json(masked);
}

const providerTypeSchema = z.enum([
  "openai",
  "anthropic",
  "google",
  "deepseek",
  "moonshotai",
  "alibaba",
  "xai",
  "gateway",
  "openai-compatible",
]);

const upsertSchema = z.object({
  providerId: z.string().min(1).max(64).optional(),
  displayName: z.string().min(1).max(80).optional(),
  apiKey: z.string().min(1),
  baseUrl: z.string().url().nullable().optional(),
  manualModels: z.array(z.string().min(1).max(200)).optional(),
  providerType: providerTypeSchema,
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  let body: z.infer<typeof upsertSchema>;
  try {
    const json = await request.json();
    body = upsertSchema.parse(json);
  } catch {
    return new ChatbotError("bad_request:api").toResponse();
  }

  let providerId = body.providerId;
  let baseUrl = body.baseUrl ?? null;
  let displayName = body.displayName ?? null;
  let models = normalizeModelIds(body.manualModels ?? []);
  let warning: string | undefined;

  if (body.providerType === "openai-compatible") {
    if (!body.baseUrl || !body.displayName) {
      return new ChatbotError(
        "bad_request:api",
        "Custom providers require a name and base URL"
      ).toResponse();
    }

    providerId = providerId?.startsWith("custom_")
      ? providerId
      : `custom_${generateUUID().slice(0, 8)}`;
    const discovered = await discoverOpenAICompatibleModels({
      baseUrl: body.baseUrl,
      apiKey: body.apiKey,
    });
    models = normalizeModelIds([...models, ...discovered.models]);
    warning = discovered.warning;
  } else if (body.providerType === "gateway") {
    providerId = GATEWAY_PROVIDER_ID;
    baseUrl = null;
    displayName = null;
    models = [];
  } else {
    if (!providerId || !isDirectProviderId(providerId)) {
      return new ChatbotError("bad_request:api").toResponse();
    }
    if (!DIRECT_PROVIDER_IDS.includes(body.providerType)) {
      return new ChatbotError("bad_request:api").toResponse();
    }
    providerId = body.providerType;
    baseUrl = null;
    displayName = null;
    models = [];
  }

  const result = await upsertUserProvider({
    userId: session.user.id,
    providerId,
    displayName,
    apiKey: body.apiKey,
    baseUrl,
    providerType: body.providerType,
    models,
  });

  return Response.json({
    id: result[0].id,
    providerId: result[0].providerId,
    displayName: result[0].displayName,
    providerType: result[0].providerType,
    baseUrl: result[0].baseUrl,
    models: result[0].models ?? [],
    apiKeyMasked: maskApiKey(result[0].apiKey),
    warning,
  });
}

const deleteSchema = z.object({
  providerId: z.string().min(1).max(64),
});

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  let body: z.infer<typeof deleteSchema>;
  try {
    const json = await request.json();
    body = deleteSchema.parse(json);
  } catch {
    return new ChatbotError("bad_request:api").toResponse();
  }

  await deleteUserProvider({
    userId: session.user.id,
    providerId: body.providerId,
  });

  return Response.json({ success: true });
}
