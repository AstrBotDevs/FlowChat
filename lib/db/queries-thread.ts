import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ChatbotError } from "../errors";
import {
  quote,
  thread,
  threadMessage,
  type Quote,
  type Thread,
  type ThreadMessage,
} from "./schema";

const client = postgres(process.env.POSTGRES_URL ?? "");
const db = drizzle(client);

// ---- Thread ----

export async function createThread({
  id,
  chatId,
  parentThreadId,
  sourceQuoteId,
}: {
  id: string;
  chatId: string;
  parentThreadId: string | null;
  sourceQuoteId: string | null;
}): Promise<Thread> {
  try {
    const [created] = await db
      .insert(thread)
      .values({ id, chatId, parentThreadId, sourceQuoteId })
      .returning();
    return created;
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to create thread");
  }
}

export async function getThreadById({
  id,
}: { id: string }): Promise<Thread | null> {
  try {
    const [result] = await db.select().from(thread).where(eq(thread.id, id));
    return result ?? null;
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to get thread");
  }
}

// ---- Quote ----

export async function createQuote({
  id,
  sourceThreadId,
  sourceMessageId,
  quoteText,
  childThreadId,
}: {
  id: string;
  sourceThreadId: string | null;
  sourceMessageId: string;
  quoteText: string;
  childThreadId: string;
}): Promise<Quote> {
  try {
    const [created] = await db
      .insert(quote)
      .values({ id, sourceThreadId, sourceMessageId, quoteText, childThreadId })
      .returning();
    return created;
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to create quote");
  }
}

export async function getQuotesByMessageId({
  messageId,
}: {
  messageId: string;
}): Promise<Quote[]> {
  try {
    return await db
      .select()
      .from(quote)
      .where(
        and(
          eq(quote.sourceMessageId, messageId),
          eq(quote.isUnlinked, false)
        )
      )
      .orderBy(asc(quote.createdAt));
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to get quotes");
  }
}

export async function getQuoteById({
  id,
}: { id: string }): Promise<Quote | null> {
  try {
    const [result] = await db.select().from(quote).where(eq(quote.id, id));
    return result ?? null;
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to get quote");
  }
}

export async function unlinkQuote({ id }: { id: string }) {
  try {
    return await db
      .update(quote)
      .set({ isUnlinked: true })
      .where(eq(quote.id, id));
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to unlink quote");
  }
}

export async function unlinkAllQuotesByMessageId({
  messageId,
}: { messageId: string }) {
  try {
    return await db
      .update(quote)
      .set({ isUnlinked: true })
      .where(eq(quote.sourceMessageId, messageId));
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to unlink quotes");
  }
}

export async function updateThreadSourceQuoteId({
  threadId,
  sourceQuoteId,
}: {
  threadId: string;
  sourceQuoteId: string;
}) {
  try {
    return await db
      .update(thread)
      .set({ sourceQuoteId })
      .where(eq(thread.id, threadId));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to update thread sourceQuoteId"
    );
  }
}

// ---- ThreadMessage ----

export async function saveThreadMessage({
  id,
  threadId,
  role,
  parts,
  attachments,
}: {
  id: string;
  threadId: string;
  role: string;
  parts: unknown;
  attachments: unknown;
}): Promise<ThreadMessage> {
  try {
    const [created] = await db
      .insert(threadMessage)
      .values({ id, threadId, role, parts, attachments })
      .returning();
    return created;
  } catch (error) {
    console.error("Failed to save thread message:", error);
    throw new ChatbotError(
      "bad_request:database",
      "Failed to save thread message"
    );
  }
}

export async function getThreadMessageById({
  id,
}: { id: string }): Promise<ThreadMessage | null> {
  try {
    const [result] = await db
      .select()
      .from(threadMessage)
      .where(eq(threadMessage.id, id));
    return result ?? null;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get thread message"
    );
  }
}

export async function getThreadMessagesByThreadId({
  threadId,
}: {
  threadId: string;
}): Promise<ThreadMessage[]> {
  try {
    return await db
      .select()
      .from(threadMessage)
      .where(eq(threadMessage.threadId, threadId))
      .orderBy(asc(threadMessage.createdAt));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get thread messages"
    );
  }
}

export async function getThreadMessageCountByThreadId({
  threadId,
}: {
  threadId: string;
}): Promise<number> {
  try {
    const messages = await db
      .select({ id: threadMessage.id })
      .from(threadMessage)
      .where(eq(threadMessage.threadId, threadId));
    return messages.length;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to count thread messages"
    );
  }
}

// ---- Cascade delete (called by deleteChatById / deleteAllChatsByUserId) ----

export async function deleteThreadDataByChatId({
  chatId,
}: { chatId: string }) {
  try {
    const threads = await db
      .select({ id: thread.id })
      .from(thread)
      .where(eq(thread.chatId, chatId));

    if (threads.length === 0) return;

    const threadIds = threads.map((t) => t.id);

    for (const tid of threadIds) {
      await db.delete(threadMessage).where(eq(threadMessage.threadId, tid));
    }

    for (const tid of threadIds) {
      await db
        .update(thread)
        .set({ sourceQuoteId: null })
        .where(eq(thread.id, tid));
    }

    for (const tid of threadIds) {
      await db.delete(quote).where(eq(quote.sourceThreadId, tid));
      await db.delete(quote).where(eq(quote.childThreadId, tid));
    }

    await db.delete(thread).where(eq(thread.chatId, chatId));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete thread data"
    );
  }
}
