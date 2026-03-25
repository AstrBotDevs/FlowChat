import { mockStore } from "@/lib/mock/store";
import { generateUUID } from "@/lib/utils";

// GET /api/threads?chatId=xxx — list all threads for a chat
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chatId");

  if (!chatId) {
    return Response.json({ error: "chatId required" }, { status: 400 });
  }

  const threads = mockStore.getThreadsByChatId(chatId);
  return Response.json({ threads });
}

// POST /api/threads — create a new thread
export async function POST(request: Request) {
  const body = await request.json();
  const { chatId, parentThreadId, sourceQuoteId, forkedMessageId, title } = body;

  if (!chatId) {
    return Response.json({ error: "chatId required" }, { status: 400 });
  }

  const thread = mockStore.createThread({
    id: generateUUID(),
    chatId,
    parentThreadId: parentThreadId ?? null,
    sourceQuoteId: sourceQuoteId ?? null,
    forkedMessageId: forkedMessageId ?? null,
    title: title ?? null,
  });

  return Response.json({ thread });
}
