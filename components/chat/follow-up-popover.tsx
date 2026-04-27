"use client";

import { motion } from "framer-motion";
import {
  ArrowLeft,
  ChevronRight,
  MessageSquareQuote,
  Send,
  Square,
  X,
} from "lucide-react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import useSWR from "swr";
import { MessageResponse } from "@/components/ai-elements/message";
import { cn, fetcher } from "@/lib/utils";
import {
  useThreadChat,
  type ThreadMessageItem,
} from "@/hooks/use-thread-chat";
import { AnnotatedText, type AnnotatedQuote } from "./annotated-text";

type QuoteWithRounds = AnnotatedQuote & {
  sourceMessageId: string;
};

export type PopoverBreadcrumb = {
  quoteText: string;
  threadId: string;
};

const POPOVER_WIDTH = 380;
const POPOVER_MAX_HEIGHT = 400;
const GAP = 8;

export type FollowUpPopoverAnchor =
  | { kind: "range"; range: Range }
  | { kind: "quoteId"; quoteId: string };

function getThreadMessageText(message: ThreadMessageItem) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function getAnchorRect(anchor: FollowUpPopoverAnchor): DOMRect | null {
  if (anchor.kind === "range") {
    const r = anchor.range.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return r;
  }
  const el = document.querySelector(
    `[data-anchor-quote-id="${anchor.quoteId}"]`
  );
  return (el as HTMLElement | null)?.getBoundingClientRect() ?? null;
}

function useAnchorPosition(
  anchor: FollowUpPopoverAnchor,
  popoverEl: HTMLDivElement | null
) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    let raf = 0;

    const update = () => {
      const rect = getAnchorRect(anchor);
      if (!rect) return;

      const popoverRect = popoverEl?.getBoundingClientRect();
      const popoverHeight = popoverRect?.height ?? POPOVER_MAX_HEIGHT;
      const popoverWidth = popoverRect?.width ?? POPOVER_WIDTH;

      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const anchorCenterX = rect.left + rect.width / 2;
      const left = Math.max(
        GAP,
        Math.min(anchorCenterX - popoverWidth / 2, vw - popoverWidth - GAP)
      );

      const spaceBelow = vh - rect.bottom - GAP;
      const spaceAbove = rect.top - GAP;
      const flip = spaceBelow < popoverHeight && spaceAbove > spaceBelow;

      const top = flip
        ? Math.max(GAP, rect.top - popoverHeight - GAP)
        : Math.min(rect.bottom + GAP, vh - popoverHeight - GAP);

      setPos((prev) => {
        if (prev && prev.top === top && prev.left === left) return prev;
        return { top, left };
      });
    };

    const tick = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };

    update();

    document.addEventListener("scroll", tick, true);
    window.addEventListener("resize", tick);
    window.visualViewport?.addEventListener("resize", tick);

    let ro: ResizeObserver | null = null;
    if (popoverEl && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(tick);
      ro.observe(popoverEl);
    }

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("scroll", tick, true);
      window.removeEventListener("resize", tick);
      window.visualViewport?.removeEventListener("resize", tick);
      ro?.disconnect();
    };
  }, [anchor, popoverEl]);

  return pos;
}

export function FollowUpPopover({
  chatId,
  sourceMessageId,
  quoteText,
  sourceThreadId,
  existingThreadId,
  selectedChatModel,
  anchor,
  onClose,
  breadcrumbs: externalBreadcrumbs,
}: {
  chatId: string;
  sourceMessageId: string;
  quoteText: string;
  sourceThreadId: string | null;
  existingThreadId?: string;
  selectedChatModel: string;
  anchor: FollowUpPopoverAnchor;
  onClose: (hasMessages: boolean) => void;
  breadcrumbs?: PopoverBreadcrumb[];
}) {
  const [inputValue, setInputValue] = useState("");
  const [breadcrumbs, setBreadcrumbs] = useState<PopoverBreadcrumb[]>(
    externalBreadcrumbs ?? []
  );
  const [currentQuoteText, setCurrentQuoteText] = useState(quoteText);
  const [currentSourceMessageId, setCurrentSourceMessageId] =
    useState(sourceMessageId);
  const [currentSourceThreadId, setCurrentSourceThreadId] =
    useState<string | null>(sourceThreadId);
  const [currentExistingThreadId, setCurrentExistingThreadId] =
    useState<string | undefined>(existingThreadId);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const [popoverEl, setPopoverEl] = useState<HTMLDivElement | null>(null);

  const pos = useAnchorPosition(anchor, popoverEl);

  const {
    messages,
    status,
    threadId,
    sendMessage,
    loadHistory,
    stop,
    setMessages,
    reset: resetChat,
  } = useThreadChat({
    chatId,
    sourceMessageId: currentSourceMessageId,
    quoteText: currentQuoteText,
    sourceThreadId: currentSourceThreadId,
    existingThreadId: currentExistingThreadId,
    selectedChatModel,
  });

  useEffect(() => {
    if (currentExistingThreadId) {
      loadHistory(currentExistingThreadId);
    }
  }, [currentExistingThreadId, loadHistory]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const handleEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose(messages.length > 0);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverEl && !popoverEl.contains(e.target as Node)) {
        onClose(messages.length > 0);
      }
    };

    document.addEventListener("keydown", handleEsc);
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 200);

    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.removeEventListener("mousedown", handleClickOutside);
      clearTimeout(timer);
    };
  }, [onClose, messages.length, popoverEl]);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text || status === "streaming") return;
    setInputValue("");
    sendMessage(text);
  }, [inputValue, status, sendMessage]);

  const handleInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleNestedFollowUp = useCallback(
    (nestedQuoteText: string, nestedSourceMsgId: string) => {
      setBreadcrumbs((prev) => [
        ...prev,
        { quoteText: currentQuoteText, threadId: threadId ?? "" },
      ]);
      setCurrentQuoteText(nestedQuoteText);
      setCurrentSourceMessageId(nestedSourceMsgId);
      setCurrentSourceThreadId(threadId ?? null);
      setCurrentExistingThreadId(undefined);
      resetChat();
    },
    [currentQuoteText, threadId, resetChat]
  );

  const handleExistingNestedAnchor = useCallback(
    (info: {
      quoteText: string;
      sourceMessageId: string;
      threadId: string;
    }) => {
      setBreadcrumbs((prev) => [
        ...prev,
        { quoteText: currentQuoteText, threadId: threadId ?? "" },
      ]);
      setCurrentQuoteText(info.quoteText);
      setCurrentSourceMessageId(info.sourceMessageId);
      setCurrentSourceThreadId(threadId ?? null);
      setCurrentExistingThreadId(info.threadId);
      resetChat();
    },
    [currentQuoteText, threadId, resetChat]
  );

  const handleBreadcrumbBack = useCallback(() => {
    if (breadcrumbs.length === 0) return;
    const prev = breadcrumbs[breadcrumbs.length - 1];
    setBreadcrumbs((bc) => bc.slice(0, -1));
    setCurrentQuoteText(prev.quoteText);
    if (prev.threadId) {
      setCurrentExistingThreadId(prev.threadId);
    }
  }, [breadcrumbs]);

  const [nestedSelection, setNestedSelection] = useState<{
    text: string;
    msgId: string;
    rect: DOMRect;
  } | null>(null);

  const handleNestedMouseUp = useCallback(() => {
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        setNestedSelection(null);
        return;
      }
      const text = sel.toString().trim();
      if (!text || text.length < 2) {
        setNestedSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const bubble = (range.startContainer as HTMLElement).closest?.("[data-thread-msg-id]")
        ?? (range.startContainer.parentElement)?.closest?.("[data-thread-msg-id]");
      if (!bubble) {
        setNestedSelection(null);
        return;
      }
      const msgId = bubble.getAttribute("data-thread-msg-id") ?? "";
      setNestedSelection({ text, msgId, rect: range.getBoundingClientRect() });
    }, 100);
  }, []);

  const hasConversation = messages.length > 0;

  if (!pos) return null;

  const popoverContent = (
    <motion.div
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="flex flex-col overflow-hidden rounded-xl border border-border/60 bg-background shadow-xl"
      exit={{ opacity: 0, y: 4, scale: 0.98 }}
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      ref={setPopoverEl}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        width: POPOVER_WIDTH,
        maxHeight: POPOVER_MAX_HEIGHT,
        zIndex: 9999,
      }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
        {breadcrumbs.length > 0 && (
          <button
            className="flex shrink-0 items-center text-muted-foreground transition-colors hover:text-foreground"
            onClick={handleBreadcrumbBack}
            type="button"
          >
            <ArrowLeft className="size-3.5" />
          </button>
        )}

        <MessageSquareQuote className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">追问</span>

        {breadcrumbs.length > 0 && (
          <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            {breadcrumbs.length > 2 && (
              <>
                <span>...</span>
                <ChevronRight className="size-3" />
              </>
            )}
            {breadcrumbs.slice(-2).map((bc, i) => (
              <span className="flex items-center gap-1" key={bc.threadId}>
                {i > 0 && <ChevronRight className="size-3" />}
                <span className="max-w-[60px] truncate">{bc.quoteText}</span>
              </span>
            ))}
            <ChevronRight className="size-3" />
          </div>
        )}

        <span className="min-w-0 flex-1 truncate text-xs text-foreground/80">
          {currentQuoteText}
        </span>

        <button
          className="shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => onClose(messages.length > 0)}
          type="button"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Conversation area */}
      <div
        className="overflow-y-auto"
        onMouseUp={handleNestedMouseUp}
        ref={conversationRef}
        style={{
          maxHeight: POPOVER_MAX_HEIGHT - 120,
          minHeight: hasConversation ? 60 : 0,
          display: hasConversation ? "block" : "none",
        }}
      >
        <div className="relative flex flex-col gap-3 p-3">
          {messages.map((msg, index) => (
            <ThreadMessageBubble
              isLatestAssistant={
                msg.role === "assistant" &&
                index === messages.length - 1
              }
              isStreaming={
                status === "streaming" &&
                msg.role === "assistant" &&
                index === messages.length - 1
              }
              key={msg.id}
              message={msg}
              onAnchorClick={handleExistingNestedAnchor}
            />
          ))}

          {nestedSelection && status !== "streaming" && (
            <button
              className="fixed z-[10000] flex items-center gap-1 rounded-md border border-border/50 bg-background px-2 py-1 text-[10px] font-medium text-foreground shadow-md hover:bg-accent"
              onClick={() => {
                handleNestedFollowUp(nestedSelection.text, nestedSelection.msgId);
                setNestedSelection(null);
                window.getSelection()?.removeAllRanges();
              }}
              style={{
                top: nestedSelection.rect.bottom + 4,
                left: nestedSelection.rect.left + nestedSelection.rect.width / 2,
                transform: "translateX(-50%)",
              }}
              type="button"
            >
              <MessageSquareQuote className="size-3" />
              追问
            </button>
          )}
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-border/40 p-2">
        <div className="flex items-end gap-2">
          <textarea
            className="max-h-20 min-h-[36px] flex-1 resize-none rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:border-border focus:outline-none"
            disabled={status === "streaming"}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="输入追问..."
            ref={inputRef}
            rows={1}
            value={inputValue}
          />
          {status === "streaming" ? (
            <button
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive transition-colors hover:bg-destructive/20"
              onClick={stop}
              type="button"
            >
              <Square className="size-3.5" />
            </button>
          ) : (
            <button
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                inputValue.trim()
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground"
              )}
              disabled={!inputValue.trim()}
              onClick={handleSend}
              type="button"
            >
              <Send className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );

  return createPortal(popoverContent, document.body);
}

function ThreadMessageBubble({
  message,
  isStreaming,
  isLatestAssistant,
  onAnchorClick,
}: {
  message: ThreadMessageItem;
  isStreaming: boolean;
  isLatestAssistant: boolean;
  onAnchorClick?: (info: {
    quoteText: string;
    sourceMessageId: string;
    threadId: string;
  }) => void;
}) {
  const isUser = message.role === "user";
  const messageText = getThreadMessageText(message);

  const { data: quotesData, mutate: mutateQuotes } = useSWR<QuoteWithRounds[]>(
    !isUser && !isStreaming
      ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/quote?messageId=${message.id}`
      : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  const quotes = quotesData ?? [];

  const handleUnlink = useCallback(
    async (quoteId: string) => {
      await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/quote`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId }),
      });
      mutateQuotes();
    },
    [mutateQuotes]
  );

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-xl rounded-br-md bg-secondary px-3 py-1.5 text-xs leading-relaxed">
          {messageText}
        </div>
      </div>
    );
  }

  const content = messageText + (isStreaming && isLatestAssistant ? "▍" : "");
  const hasQuotes = !isStreaming && quotes.length > 0 && onAnchorClick;

  return (
    <div className="flex justify-start" data-thread-msg-id={message.id}>
      <div className="max-w-[95%] text-xs leading-relaxed">
        {content ? (
          hasQuotes ? (
            <AnnotatedText
              onAnchorClick={(threadId, quoteId) => {
                const q = quotes.find((item) => item.id === quoteId);
                if (!q || !onAnchorClick) return;
                onAnchorClick({
                  quoteText: q.quoteText,
                  sourceMessageId: q.sourceMessageId,
                  threadId,
                });
              }}
              onUnlink={handleUnlink}
              quotes={quotes}
              text={content}
            />
          ) : (
            <MessageResponse>{content}</MessageResponse>
          )
        ) : (
          <span className="text-muted-foreground">思考中...</span>
        )}
      </div>
    </div>
  );
}
