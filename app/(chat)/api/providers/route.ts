import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  deleteUserProvider,
  getUserProviders,
  upsertUserProvider,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

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
    providerType: p.providerType,
    baseUrl: p.baseUrl,
    apiKeyMasked: maskApiKey(p.apiKey),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));

  return Response.json(masked);
}

const upsertSchema = z.object({
  providerId: z.string().min(1).max(64),
  apiKey: z.string().min(1),
  baseUrl: z.string().url().nullable().optional(),
  providerType: z.enum(["openai-compatible", "anthropic", "google"]),
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

  const result = await upsertUserProvider({
    userId: session.user.id,
    providerId: body.providerId,
    apiKey: body.apiKey,
    baseUrl: body.baseUrl ?? null,
    providerType: body.providerType,
  });

  return Response.json({
    id: result[0].id,
    providerId: result[0].providerId,
    providerType: result[0].providerType,
    baseUrl: result[0].baseUrl,
    apiKeyMasked: maskApiKey(result[0].apiKey),
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
