"use client";

import { useCallback } from "react";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export interface DrillMessage {
  id: string;
  role: "user" | "assistant";
  parts: Array<{ type: string; text?: string; [key: string]: unknown }>;
}

export function useThreadAPI() {
  /** Create a drill thread (quote + child thread atomically) */
  const createDrillThread = useCallback(
    async (params: {
      chatId: string;
      parentThreadId: string;
      sourceMessageId: string;
      quoteText: string;
    }): Promise<{
      threadId: string;
      quoteId: string;
    } | null> => {
      try {
        const res = await fetch(`${basePath}/api/quotes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceThreadId: params.parentThreadId,
            sourceMessageId: params.sourceMessageId,
            quoteText: params.quoteText,
            chatId: params.chatId,
            parentThreadId: params.parentThreadId,
          }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return {
          threadId: data.thread.id,
          quoteId: data.quote.id,
        };
      } catch {
        return null;
      }
    },
    []
  );

  /** Fetch messages for a thread */
  const getThreadMessages = useCallback(
    async (threadId: string): Promise<DrillMessage[]> => {
      try {
        const res = await fetch(
          `${basePath}/api/threads/${threadId}/messages`
        );
        if (!res.ok) return [];
        const data = await res.json();
        return (data.messages ?? []) as DrillMessage[];
      } catch {
        return [];
      }
    },
    []
  );

  /** Send a message in a drill thread and get mock streaming response */
  const sendDrillMessage = useCallback(
    async (params: {
      threadId: string;
      chatId: string;
      text: string;
    }): Promise<string> => {
      try {
        const messageId = crypto.randomUUID();
        const res = await fetch(`${basePath}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: params.chatId,
            message: {
              id: messageId,
              role: "user",
              parts: [{ type: "text", text: params.text }],
            },
            selectedChatModel: "mock",
            selectedVisibilityType: "private",
          }),
        });

        if (!res.ok || !res.body) return "";

        // Read the SSE stream and extract text
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          // Parse the data stream format: 2:[{type:"text",text:"x"}]
          for (const line of chunk.split("\n")) {
            if (line.startsWith("2:")) {
              try {
                const parts = JSON.parse(line.slice(2));
                for (const part of parts) {
                  if (part.type === "text" && part.text) {
                    fullText += part.text;
                  }
                }
              } catch {
                // skip malformed lines
              }
            }
          }
        }

        return fullText;
      } catch {
        return "";
      }
    },
    []
  );

  return { createDrillThread, getThreadMessages, sendDrillMessage };
}
