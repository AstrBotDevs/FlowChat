import { mockStore } from "@/lib/mock/store";

// GET /api/threads/[threadId]/messages — get messages for a thread
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const thread = mockStore.getThreadById(threadId);

  if (!thread) {
    return Response.json({ error: "Thread not found" }, { status: 404 });
  }

  const messages = mockStore.getMessagesByThreadId(threadId);
  const quotes = messages.flatMap((m) =>
    mockStore.getQuotesByMessageId(m.id)
  );

  // Format messages like the existing API
  const formattedMessages = messages.map((m) => ({
    id: m.id,
    role: m.role,
    parts: m.parts,
    metadata: { createdAt: m.createdAt.toISOString() },
  }));

  return Response.json({
    thread,
    messages: formattedMessages,
    quotes,
  });
}
