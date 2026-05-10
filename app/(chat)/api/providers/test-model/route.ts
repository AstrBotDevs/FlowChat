import { generateText } from "ai";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import type { ModelSelection } from "@/lib/ai/model-selection";
import { getLanguageModel } from "@/lib/ai/providers";
import { GATEWAY_PROVIDER_ID } from "@/lib/ai/provider-registry";
import { getUserProviderByProviderId } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

const testModelSchema = z.object({
  providerId: z.string().min(1).max(64),
  modelId: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  let body: z.infer<typeof testModelSchema>;
  try {
    const json = await request.json();
    body = testModelSchema.parse(json);
  } catch {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const config = await getUserProviderByProviderId({
    userId: session.user.id,
    providerId: body.providerId,
  });

  if (!config) {
    return Response.json(
      { success: false, error: "Provider not configured" },
      { status: 404 }
    );
  }

  const selection: ModelSelection =
    config.providerId === GATEWAY_PROVIDER_ID
      ? {
          source: "gateway",
          modelId: body.modelId,
        }
      : config.providerType === "openai-compatible"
        ? {
            source: "custom",
            providerId: config.providerId,
            modelId: body.modelId,
          }
        : {
            source: "direct",
            providerId: config.providerId,
            modelId: body.modelId,
          };

  try {
    await generateText({
      model: await getLanguageModel(selection, session.user.id),
      maxOutputTokens: 4,
      prompt: "Reply OK.",
    });

    return Response.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Model test failed";
    return Response.json({ success: false, error: message }, { status: 200 });
  }
}
