"use client";

import { useCallback, useRef, useState } from "react";
import { generateUUID } from "@/lib/utils";
import type { UIMessage } from "ai";

export type ThreadMessageItem = UIMessage;

export type ThreadChatStatus = "idle" | "streaming" | "error";

function appendAssistantText(messages: UIMessage[], text: string) {
  const updated = [...messages];
  const last = updated[updated.length - 1];
  if (!last || last.role !== "assistant") {
    return updated;
  }

  const lastPart = last.parts[last.parts.length - 1];
  const nextParts = [...last.parts];
  if (lastPart && lastPart.type === "text") {
    nextParts[nextParts.length - 1] = {
      ...lastPart,
      text: lastPart.text + text,
    };
  } else {
    nextParts.push({
      type: "text",
      text,
    });
  }

  updated[updated.length - 1] = {
    ...last,
    parts: nextParts,
  };

  return updated;
}

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
  const [messages, setMessages] = useState<UIMessage[]>([]);
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

      const userMsg: UIMessage = {
        id: generateUUID(),
        role: "user",
        parts: [{ type: "text", text }],
      };

      setMessages((prev) => [...prev, userMsg]);
      setStatus("streaming");

      const assistantMsg: UIMessage = {
        id: generateUUID(),
        role: "assistant",
        parts: [],
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
          let errorText = "追问生成失败，请稍后重试。";
          try {
            const errorPayload = await res.json();
            errorText = errorPayload.message ?? errorPayload.error ?? errorText;
          } catch (_) {
            // keep fallback text
          }
          setMessages((prev) => appendAssistantText(prev, errorText));
          setStatus("error");
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let streamFailed = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.startsWith(":")) continue;
            if (!trimmedLine.startsWith("data:")) continue;

            const payload = trimmedLine.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;

            try {
              const parsed = JSON.parse(payload);

              if (parsed.type === "text-delta" && parsed.delta) {
                setMessages((prev) => appendAssistantText(prev, parsed.delta));
              }

              if (parsed.type === "error") {
                streamFailed = true;
                setMessages((prev) =>
                  appendAssistantText(
                    prev,
                    parsed.errorText ?? "追问生成失败，请稍后重试。"
                  )
                );
                setStatus("error");
              }
            } catch (_) {
              // skip malformed lines
            }
          }
        }

        setStatus(streamFailed ? "error" : "idle");
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
