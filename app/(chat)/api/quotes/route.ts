import { mockStore } from "@/lib/mock/store";
import { generateUUID } from "@/lib/utils";

// GET /api/quotes?messageId=xxx — get quotes for a message
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const messageId = searchParams.get("messageId");

  if (!messageId) {
    return Response.json({ error: "messageId required" }, { status: 400 });
  }

  const quotes = mockStore.getQuotesByMessageId(messageId);
  return Response.json({ quotes });
}

// POST /api/quotes — create a quote + thread atomically
export async function POST(request: Request) {
  const body = await request.json();
  const { sourceThreadId, sourceMessageId, quoteText, chatId, parentThreadId } = body;

  if (!sourceThreadId || !sourceMessageId || !quoteText || !chatId) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Create child thread
  const childThreadId = generateUUID();
  const thread = mockStore.createThread({
    id: childThreadId,
    chatId,
    parentThreadId: parentThreadId ?? sourceThreadId,
    sourceQuoteId: generateUUID(), // will be set below
    forkedMessageId: null,
    title: `显微镜: "${quoteText.slice(0, 20)}"`,
  });

  // Create quote
  const quote = mockStore.createQuote({
    id: generateUUID(),
    sourceThreadId,
    sourceMessageId,
    quoteText,
    childThreadId,
  });

  // Update thread's sourceQuoteId
  thread.sourceQuoteId = quote.id;

  return Response.json({ quote, thread });
}
