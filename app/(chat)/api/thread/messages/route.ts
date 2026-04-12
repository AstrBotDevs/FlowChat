import { auth } from "@/app/(auth)/auth";
import {
  getQuoteById,
  getThreadById,
  getThreadMessagesByThreadId,
} from "@/lib/db/queries-thread";
import { getChatById } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const threadId = searchParams.get("threadId");

    if (!threadId) {
      return new ChatbotError("bad_request:api").toResponse();
    }

    const session = await auth();
    if (!session?.user) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    const userId = session.user.id!;

    const threadRecord = await getThreadById({ id: threadId });
    if (!threadRecord) {
      return new ChatbotError("not_found:chat").toResponse();
    }

    const chat = await getChatById({ id: threadRecord.chatId });
    if (!chat || chat.userId !== userId) {
      return new ChatbotError("forbidden:chat").toResponse();
    }

    const messages = await getThreadMessagesByThreadId({ threadId });

    let quoteText = "";
    let sourceMessageId = "";
    if (threadRecord.sourceQuoteId) {
      const quoteRecord = await getQuoteById({ id: threadRecord.sourceQuoteId });
      if (quoteRecord) {
        quoteText = quoteRecord.quoteText;
        sourceMessageId = quoteRecord.sourceMessageId;
      }
    }

    // Build breadcrumb path by walking up parentThreadId
    const breadcrumbs: Array<{ threadId: string; quoteText: string }> = [];
    let walkThread = threadRecord;

    while (walkThread.parentThreadId) {
      const parentThread = await getThreadById({ id: walkThread.parentThreadId });
      if (!parentThread) break;

      let parentQuoteText = "";
      if (walkThread.sourceQuoteId) {
        const q = await getQuoteById({ id: walkThread.sourceQuoteId });
        if (q) parentQuoteText = q.quoteText;
      }

      breadcrumbs.unshift({
        threadId: walkThread.id,
        quoteText: parentQuoteText,
      });

      walkThread = parentThread;
    }

    return Response.json({
      messages,
      quoteText,
      sourceMessageId,
      breadcrumbs,
    });
  } catch (error) {
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }
    return new ChatbotError("bad_request:api").toResponse();
  }
}
