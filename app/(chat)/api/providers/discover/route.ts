import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { discoverOpenAICompatibleModels } from "@/lib/ai/openai-compatible";
import { ChatbotError } from "@/lib/errors";

const discoverSchema = z.object({
  apiKey: z.string().min(1),
  baseUrl: z.string().url(),
});

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

  const discovered = await discoverOpenAICompatibleModels({
    baseUrl: body.baseUrl,
    apiKey: body.apiKey,
  });

  return Response.json(discovered);
}
