import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { getUserProviderByProviderId } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

const testSchema = z.object({
  providerId: z.string().min(1).max(64),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  let body: z.infer<typeof testSchema>;
  try {
    const json = await request.json();
    body = testSchema.parse(json);
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

  try {
    let testUrl: string;
    const headers: Record<string, string> = {};

    switch (config.providerType) {
      case "openai": {
        testUrl = "https://api.openai.com/v1/models";
        headers.Authorization = `Bearer ${config.apiKey}`;
        break;
      }
      case "anthropic": {
        testUrl = "https://api.anthropic.com/v1/models";
        headers["x-api-key"] = config.apiKey;
        headers["anthropic-version"] = "2023-06-01";
        break;
      }
      case "google": {
        testUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${config.apiKey}`;
        break;
      }
      case "deepseek": {
        testUrl = "https://api.deepseek.com/v1/models";
        headers.Authorization = `Bearer ${config.apiKey}`;
        break;
      }
      case "moonshotai": {
        testUrl = "https://api.moonshot.cn/v1/models";
        headers.Authorization = `Bearer ${config.apiKey}`;
        break;
      }
      case "alibaba": {
        testUrl = "https://dashscope.aliyuncs.com/compatible-mode/v1/models";
        headers.Authorization = `Bearer ${config.apiKey}`;
        break;
      }
      case "xai": {
        testUrl = "https://api.x.ai/v1/models";
        headers.Authorization = `Bearer ${config.apiKey}`;
        break;
      }
      case "gateway": {
        testUrl = "https://ai-gateway.vercel.sh/v1/models";
        headers.Authorization = `Bearer ${config.apiKey}`;
        break;
      }
      default: {
        const baseURL = config.baseUrl;
        if (!baseURL) {
          return Response.json(
            {
              success: false,
              error: "No base URL configured for this provider",
            },
            { status: 400 }
          );
        }
        testUrl = `${baseURL.replace(/\/$/, "")}/models`;
        headers.Authorization = `Bearer ${config.apiKey}`;
        break;
      }
    }

    const res = await fetch(testUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) {
      return Response.json({ success: true });
    }

    const text = await res.text().catch(() => "");
    return Response.json(
      {
        success: false,
        error: `Provider returned ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
      },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return Response.json({ success: false, error: message }, { status: 200 });
  }
}
