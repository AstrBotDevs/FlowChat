import { auth } from "@/app/(auth)/auth";
import { getChatById, getMessageById } from "@/lib/db/queries";
import {
  getQuoteById,
  getQuotesByMessageId,
  getThreadById,
  getThreadMessageById,
  unlinkAllQuotesByMessageId,
  unlinkQuote,
} from "@/lib/db/queries-thread";
import { ChatbotError } from "@/lib/errors";

async function getChatIdForMessageId(messageId: string) {
  const [msg] = await getMessageById({ id: messageId });
  if (msg) {
    return msg.chatId;
  }

  const threadMsg = await getThreadMessageById({ id: messageId });
  if (!threadMsg) {
    return null;
  }

  const threadRecord = await getThreadById({ id: threadMsg.threadId });
  return threadRecord?.chatId ?? null;
}

async function assertOwnsMessage({
  messageId,
  userId,
}: {
  messageId: string;
  userId: string;
}) {
  const chatId = await getChatIdForMessageId(messageId);
  if (!chatId) {
    return false;
  }

  const chat = await getChatById({ id: chatId });
  return Boolean(chat && chat.userId === userId);
}

async function assertOwnsQuote({
  quoteId,
  userId,
}: {
  quoteId: string;
  userId: string;
}) {
  const quote = await getQuoteById({ id: quoteId });
  if (!quote) {
    return { ok: false, status: "not_found" as const };
  }

  const childThread = await getThreadById({ id: quote.childThreadId });
  if (!childThread) {
    return { ok: false, status: "not_found" as const };
  }

  const chat = await getChatById({ id: childThread.chatId });
  if (!chat || chat.userId !== userId) {
    return { ok: false, status: "forbidden" as const };
  }

  return { ok: true, status: "ok" as const };
}

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

    let chatId: string | undefined;
    const [msg] = await getMessageById({ id: messageId });
    if (msg) {
      chatId = msg.chatId;
    } else {
      const threadMsg = await getThreadMessageById({ id: messageId });
      if (!threadMsg) {
        return Response.json([]);
      }
      const threadRecord = await getThreadById({ id: threadMsg.threadId });
      if (!threadRecord) {
        return Response.json([]);
      }
      chatId = threadRecord.chatId;
    }

    const chat = await getChatById({ id: chatId });
    if (!chat || chat.userId !== session.user.id) {
      return new ChatbotError("forbidden:chat").toResponse();
    }

    const quotes = await getQuotesByMessageId({ messageId });

    return Response.json(quotes);
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
      const ownership = await assertOwnsQuote({
        quoteId: body.quoteId,
        userId: session.user.id,
      });

      if (!ownership.ok) {
        return new ChatbotError(
          ownership.status === "not_found" ? "not_found:chat" : "forbidden:chat"
        ).toResponse();
      }

      await unlinkQuote({ id: body.quoteId });
      return Response.json({ success: true });
    }

    if (body.messageId) {
      const ownsMessage = await assertOwnsMessage({
        messageId: body.messageId,
        userId: session.user.id,
      });

      if (!ownsMessage) {
        return new ChatbotError("forbidden:chat").toResponse();
      }

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
