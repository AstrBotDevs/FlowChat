"use client";

import { useCallback, useRef, useState } from "react";
import { generateUUID } from "@/lib/utils";

export type ThreadMessageItem = {
  id: string;
  threadId: string;
  role: string;
  content: string;
  createdAt: string;
};

export type ThreadChatStatus = "idle" | "streaming" | "error";

export function useThreadChat({
  chatId,
  sourceMessageId,
  quoteText,
  sourceThreadId,
  existingThreadId,
  selectedChatModel,
}: {
  chatId: string;
  sourceMessageId: string;
  quoteText: string;
  sourceThreadId: string | null;
  existingThreadId?: string;
  selectedChatModel: string;
}) {
  const [messages, setMessages] = useState<ThreadMessageItem[]>([]);
  const [status, setStatus] = useState<ThreadChatStatus>("idle");
  const [threadId, setThreadId] = useState<string | null>(
    existingThreadId ?? null
  );
  const abortRef = useRef<AbortController | null>(null);

  const loadHistory = useCallback(
    async (tid: string) => {
      try {
        const res = await fetch(
          `/api/thread/messages?threadId=${encodeURIComponent(tid)}`
        );
        if (!res.ok) return null;

        const data = await res.json();
        setMessages(data.messages ?? []);
        setThreadId(tid);
        return data;
      } catch (_error) {
        return null;
      }
    },
    []
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const currentThreadId = threadId ?? generateUUID();
      const isNewThread = !threadId;
      if (!threadId) {
        setThreadId(currentThreadId);
      }

      const userMsg: ThreadMessageItem = {
        id: generateUUID(),
        threadId: currentThreadId,
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setStatus("streaming");

      const assistantMsg: ThreadMessageItem = {
        id: generateUUID(),
        threadId: currentThreadId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const payload = {
          threadId: currentThreadId,
          chatId,
          message: text,
          selectedChatModel,
          ...(isNewThread
            ? { sourceMessageId, quoteText, sourceThreadId }
            : {}),
        };

        const res = await fetch("/api/thread", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          setStatus("error");
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));

              if (data.text) {
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      content: last.content + data.text,
                    };
                  }
                  return updated;
                });
              }

              if (data.done && data.threadId) {
                setThreadId(data.threadId);
              }
            } catch (_) {
              // skip malformed SSE lines
            }
          }
        }

        setStatus("idle");
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          setStatus("idle");
        } else {
          setStatus("error");
        }
      } finally {
        abortRef.current = null;
      }
    },
    [
      threadId,
      chatId,
      selectedChatModel,
      sourceMessageId,
      quoteText,
      sourceThreadId,
    ]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setThreadId(null);
    setStatus("idle");
  }, []);

  return {
    messages,
    status,
    threadId,
    sendMessage,
    loadHistory,
    stop,
    setMessages,
    reset,
  };
}
