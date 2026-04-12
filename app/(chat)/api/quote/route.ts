import { auth } from "@/app/(auth)/auth";
import {
  getQuotesByMessageId,
  getThreadMessageCountByThreadId,
  unlinkAllQuotesByMessageId,
  unlinkQuote,
} from "@/lib/db/queries-thread";
import { getChatById, getMessageById } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get("messageId");

    if (!messageId) {
      return new ChatbotError("bad_request:api").toResponse();
    }

    const session = await auth();
    if (!session?.user) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    const [msg] = await getMessageById({ id: messageId });
    if (!msg) {
      return Response.json([]);
    }

    const chat = await getChatById({ id: msg.chatId });
    if (!chat || chat.userId !== session.user.id) {
      return new ChatbotError("forbidden:chat").toResponse();
    }

    const quotes = await getQuotesByMessageId({ messageId });

    const quotesWithRounds = await Promise.all(
      quotes.map(async (q) => {
        const roundCount = await getThreadMessageCountByThreadId({
          threadId: q.childThreadId,
        });
        return {
          ...q,
          roundCount: Math.floor(roundCount / 2),
        };
      })
    );

    return Response.json(quotesWithRounds);
  } catch (error) {
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }
    return new ChatbotError("bad_request:api").toResponse();
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();

    const session = await auth();
    if (!session?.user) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    if (body.quoteId) {
      await unlinkQuote({ id: body.quoteId });
      return Response.json({ success: true });
    }

    if (body.messageId) {
      await unlinkAllQuotesByMessageId({ messageId: body.messageId });
      return Response.json({ success: true });
    }

    return new ChatbotError("bad_request:api").toResponse();
  } catch (error) {
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }
    return new ChatbotError("bad_request:api").toResponse();
  }
}
