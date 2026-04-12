import { streamText } from "ai";
import { auth } from "@/app/(auth)/auth";
import { buildThreadPrompt } from "@/lib/ai/prompts-thread";
import { getLanguageModel } from "@/lib/ai/providers";
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
import { getChatById, getMessageById } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { generateUUID } from "@/lib/utils";

export const maxDuration = 60;

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

    const userId = session.user.id!;
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

    if (!currentThread) {
      if (!sourceMessageId || !quoteText) {
        return new ChatbotError(
          "bad_request:api",
          "sourceMessageId and quoteText are required for new threads"
        ).toResponse();
      }

      const newQuoteId = generateUUID();
      const parentId = sourceThreadId || null;

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
      content: userMessage,
    });

    const quoteId =
      resolvedQuoteId ?? currentThread.sourceQuoteId;

    if (!quoteId) {
      return new ChatbotError("not_found:chat").toResponse();
    }

    const quoteRecord = await getQuoteById({ id: quoteId });
    if (!quoteRecord) {
      return new ChatbotError("not_found:chat").toResponse();
    }

    let sourceMessageContent: string;

    if (quoteRecord.sourceThreadId) {
      const threadMsg = await getThreadMessageById({
        id: quoteRecord.sourceMessageId,
      });
      if (!threadMsg) {
        return new ChatbotError("not_found:chat").toResponse();
      }
      sourceMessageContent = threadMsg.content;
    } else {
      const [sourceMsg] = await getMessageById({
        id: quoteRecord.sourceMessageId,
      });
      if (!sourceMsg) {
        return new ChatbotError("not_found:chat").toResponse();
      }
      sourceMessageContent = (
        sourceMsg.parts as Array<{ type: string; text?: string }>
      )
        .filter((p) => p.type === "text" && p.text)
        .map((p) => p.text)
        .join("\n");
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

    const result = streamText({
      model,
      messages: promptMessages,
    });

    const encoder = new TextEncoder();
    let fullAssistantContent = "";

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.textStream) {
            fullAssistantContent += chunk;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`)
            );
          }

          await saveThreadMessage({
            id: generateUUID(),
            threadId: currentThread!.id,
            role: "assistant",
            content: fullAssistantContent,
          });

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ done: true, threadId: currentThread!.id })}\n\n`
            )
          );
          controller.close();
        } catch (_error) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: "Stream error" })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }
    console.error("Unhandled error in thread API:", error);
    return new ChatbotError("bad_request:api").toResponse();
  }
}
