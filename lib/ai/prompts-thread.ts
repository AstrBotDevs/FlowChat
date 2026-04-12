import type { ThreadMessage } from "@/lib/db/schema";

export const threadSystemPrompt =
  "你是一个专注的 AI 学习助手。请结合上一段解释的语境，聚焦回答用户的当前问题，保持清晰、易懂的教学风格。";

/**
 * Build the message array sent to LLM for a follow-up Thread.
 *
 * Structure:
 * 1. System prompt
 * 2. Parent AI answer (fixed background, excluded from sliding window)
 * 3. Quoted text + first user question (merged into one user message)
 * 4. Remaining conversation history (subject to sliding window)
 */
export function buildThreadPrompt({
  sourceMessageContent,
  quoteText,
  threadMessages,
  slidingWindowSize = 40,
}: {
  sourceMessageContent: string;
  quoteText: string;
  threadMessages: ThreadMessage[];
  slidingWindowSize?: number;
}): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [];

  messages.push({ role: "system", content: threadSystemPrompt });

  messages.push({
    role: "user",
    content: `【这是你上一轮的解释】：\n${sourceMessageContent}`,
  });

  if (threadMessages.length === 0) {
    return messages;
  }

  const firstMessage = threadMessages[0];
  messages.push({
    role: "user",
    content: `【用户在上面的解释中选中了】：\n『${quoteText}』\n\n【用户的追问】：\n${firstMessage.content}`,
  });

  const restMessages = threadMessages.slice(1);
  const windowedMessages =
    restMessages.length > slidingWindowSize
      ? restMessages.slice(-slidingWindowSize)
      : restMessages;

  for (const msg of windowedMessages) {
    messages.push({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    });
  }

  return messages;
}
