import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
} from "ai";
import { auth } from "@/app/(auth)/auth";
import { buildThreadPrompt, threadSystemPrompt } from "@/lib/ai/prompts-thread";
import { getLanguageModel } from "@/lib/ai/providers";
import { getChatById, getMessageById } from "@/lib/db/queries";
import {
  createQuote,
  createThread,
  getQuoteById,
  getThreadById,
  getThreadMessageById,
  getThreadMessagesByThreadId,
  saveThreadMessage,
  updateThreadSourceQuoteId,
} from "@/lib/db/queries-thread";
import { ChatbotError } from "@/lib/errors";
import { generateUUID } from "@/lib/utils";

export const maxDuration = 60;

function getTextFromParts(parts: unknown) {
  return (parts as Array<{ type: string; text?: string }>)
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text)
    .join("\n");
}

async function getChatIdForSourceMessage({
  messageId,
  isThreadMessage,
}: {
  messageId: string;
  isThreadMessage: boolean;
}) {
  if (isThreadMessage) {
    const threadMsg = await getThreadMessageById({ id: messageId });
    if (!threadMsg) {
      return null;
    }

    const threadRecord = await getThreadById({ id: threadMsg.threadId });
    return threadRecord?.chatId ?? null;
  }

  const [sourceMsg] = await getMessageById({ id: messageId });
  return sourceMsg?.chatId ?? null;
}

export async function POST(request: Request) {
  let body: {
    threadId: string;
    chatId: string;
    message: string;
    selectedChatModel: string;
    sourceMessageId?: string;
    quoteText?: string;
    sourceThreadId?: string | null;
  };

  try {
    body = await request.json();
  } catch (_) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  try {
    const session = await auth();
    if (!session?.user) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    const userId = session.user.id;
    const {
      threadId,
      chatId,
      message: userMessage,
      selectedChatModel,
      sourceMessageId,
      quoteText,
      sourceThreadId,
    } = body;

    const chat = await getChatById({ id: chatId });
    if (!chat || chat.userId !== userId) {
      return new ChatbotError("forbidden:chat").toResponse();
    }

    let currentThread = await getThreadById({ id: threadId });
    let resolvedQuoteId: string | null = null;

    if (currentThread && currentThread.chatId !== chatId) {
      return new ChatbotError("forbidden:chat").toResponse();
    }

    if (!currentThread) {
      if (!sourceMessageId || !quoteText) {
        return new ChatbotError(
          "bad_request:api",
          "sourceMessageId and quoteText are required for new threads"
        ).toResponse();
      }

      const newQuoteId = generateUUID();
      const parentId = sourceThreadId || null;

      if (parentId) {
        const parentThread = await getThreadById({ id: parentId });
        if (!parentThread || parentThread.chatId !== chatId) {
          return new ChatbotError("forbidden:chat").toResponse();
        }
      }

      const sourceChatId = await getChatIdForSourceMessage({
        messageId: sourceMessageId,
        isThreadMessage: Boolean(parentId),
      });

      if (sourceChatId !== chatId) {
        return new ChatbotError("forbidden:chat").toResponse();
      }

      await createThread({
        id: threadId,
        chatId,
        parentThreadId: parentId,
        sourceQuoteId: null,
      });

      await createQuote({
        id: newQuoteId,
        sourceThreadId: parentId,
        sourceMessageId,
        quoteText,
        childThreadId: threadId,
      });

      await updateThreadSourceQuoteId({
        threadId,
        sourceQuoteId: newQuoteId,
      });

      currentThread = await getThreadById({ id: threadId });
      resolvedQuoteId = newQuoteId;
    }

    if (!currentThread) {
      return new ChatbotError("not_found:chat").toResponse();
    }

    await saveThreadMessage({
      id: generateUUID(),
      threadId: currentThread.id,
      role: "user",
      parts: [{ type: "text", text: userMessage }],
      attachments: [],
    });

    const quoteId = resolvedQuoteId ?? currentThread.sourceQuoteId;

    if (!quoteId) {
      return new ChatbotError("not_found:chat").toResponse();
    }

    const quoteRecord = await getQuoteById({ id: quoteId });
    if (!quoteRecord) {
      return new ChatbotError("not_found:chat").toResponse();
    }

    if (quoteRecord.childThreadId !== currentThread.id) {
      return new ChatbotError("forbidden:chat").toResponse();
    }

    const currentThreadId = currentThread.id;
    let sourceMessageContent: string;

    if (quoteRecord.sourceThreadId) {
      const sourceChatId = await getChatIdForSourceMessage({
        messageId: quoteRecord.sourceMessageId,
        isThreadMessage: true,
      });

      if (sourceChatId !== chatId) {
        return new ChatbotError("forbidden:chat").toResponse();
      }

      const threadMsg = await getThreadMessageById({
        id: quoteRecord.sourceMessageId,
      });
      if (!threadMsg) {
        return new ChatbotError("not_found:chat").toResponse();
      }
      sourceMessageContent = getTextFromParts(threadMsg.parts);
    } else {
      const sourceChatId = await getChatIdForSourceMessage({
        messageId: quoteRecord.sourceMessageId,
        isThreadMessage: false,
      });

      if (sourceChatId !== chatId) {
        return new ChatbotError("forbidden:chat").toResponse();
      }

      const [sourceMsg] = await getMessageById({
        id: quoteRecord.sourceMessageId,
      });
      if (!sourceMsg) {
        return new ChatbotError("not_found:chat").toResponse();
      }
      sourceMessageContent = getTextFromParts(sourceMsg.parts);
    }

    const threadMessages = await getThreadMessagesByThreadId({
      threadId: currentThread.id,
    });

    const promptMessages = buildThreadPrompt({
      sourceMessageContent,
      quoteText: quoteRecord.quoteText,
      threadMessages,
    });

    const model = await getLanguageModel(selectedChatModel, userId);

    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        const result = streamText({
          model,
          system: threadSystemPrompt,
          messages: promptMessages,
        });

        writer.merge(result.toUIMessageStream());
      },
      generateId: generateUUID,
      onFinish: async ({ responseMessage }) => {
        if (!responseMessage.parts.length) {
          return;
        }

        await saveThreadMessage({
          id: responseMessage.id,
          threadId: currentThreadId,
          role: "assistant",
          parts: responseMessage.parts,
          attachments: [],
        });
      },
      onError: (error) => {
        console.error("Unhandled error in thread stream:", error);
        return "追问生成失败，请稍后重试。";
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }
    console.error("Unhandled error in thread API:", error);
    return new ChatbotError("bad_request:api").toResponse();
  }
}
