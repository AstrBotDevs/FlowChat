"use client";

import {
  autoUpdate,
  flip,
  hide,
  inline,
  offset,
  shift,
  size,
  useFloating,
} from "@floating-ui/react-dom";
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
import { type ThreadMessageItem, useThreadChat } from "@/hooks/use-thread-chat";
import type { ModelSelection } from "@/lib/ai/model-selection";
import { cn, fetcher } from "@/lib/utils";
import { type AnnotatedQuote, AnnotatedText } from "./annotated-text";

type QuoteWithRounds = AnnotatedQuote & {
  sourceMessageId: string;
};

export type PopoverBreadcrumb = {
  quoteText: string;
  threadId: string;
};

const POPOVER_WIDTH = 380;
const POPOVER_MAX_HEIGHT = 400;

export type FollowUpPopoverAnchor =
  | { kind: "range"; range: Range }
  | { kind: "quoteId"; quoteId: string };

function getThreadMessageText(message: ThreadMessageItem) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function FollowUpPopover({
  chatId,
  sourceMessageId,
  quoteText,
  sourceThreadId,
  existingThreadId,
  modelSelection,
  anchor,
  onClose,
  breadcrumbs: externalBreadcrumbs,
}: {
  chatId: string;
  sourceMessageId: string;
  quoteText: string;
  sourceThreadId: string | null;
  existingThreadId?: string;
  modelSelection: ModelSelection;
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
  const [currentSourceThreadId, setCurrentSourceThreadId] = useState<
    string | null
  >(sourceThreadId);
  const [currentExistingThreadId, setCurrentExistingThreadId] = useState<
    string | undefined
  >(existingThreadId);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);

  const { refs, floatingStyles, middlewareData, isPositioned } = useFloating({
    placement: "bottom",
    strategy: "fixed",
    transform: false,
    middleware: [
      inline(),
      offset(8),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      hide(),
      size({
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.min(
            POPOVER_MAX_HEIGHT,
            Math.max(180, availableHeight - 8)
          )}px`;
        },
        padding: 8,
      }),
    ],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    if (anchor.kind === "range") {
      const { range } = anchor;
      refs.setReference({
        getBoundingClientRect: () => range.getBoundingClientRect(),
        getClientRects: () => range.getClientRects(),
      });
      return;
    }
    const el = document.querySelector(
      `[data-anchor-quote-id="${anchor.quoteId}"]`
    );
    if (el) {
      refs.setReference(el as HTMLElement);
    }
  }, [anchor, refs]);

  const {
    messages,
    status,
    threadId,
    sendMessage,
    loadHistory,
    stop,
    reset: resetChat,
  } = useThreadChat({
    chatId,
    sourceMessageId: currentSourceMessageId,
    quoteText: currentQuoteText,
    sourceThreadId: currentSourceThreadId,
    existingThreadId: currentExistingThreadId,
    modelSelection,
  });

  useEffect(() => {
    if (currentExistingThreadId) {
      loadHistory(currentExistingThreadId);
    }
  }, [currentExistingThreadId, loadHistory]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  if (conversationRef.current) {
    conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
  }

  useEffect(() => {
    const handleEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose(messages.length > 0);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      const floating = refs.floating.current;
      if (floating && !floating.contains(e.target as Node)) {
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
  }, [onClose, messages.length, refs.floating]);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text || status === "streaming") {
      return;
    }
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
    if (breadcrumbs.length === 0) {
      return;
    }
    const prev = breadcrumbs.at(-1);
    if (!prev) {
      return;
    }
    setBreadcrumbs((bc) => bc.slice(0, -1));
    setCurrentQuoteText(prev.quoteText);
    if (prev.threadId) {
      setCurrentExistingThreadId(prev.threadId);
    }
  }, [breadcrumbs]);

  const [nestedSelection, setNestedSelection] = useState<{
    text: string;
    msgId: string;
    range: Range;
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
      const bubble =
        (range.startContainer as HTMLElement).closest?.(
          "[data-thread-msg-id]"
        ) ??
        range.startContainer.parentElement?.closest?.("[data-thread-msg-id]");
      if (!bubble) {
        setNestedSelection(null);
        return;
      }
      const msgId = bubble.getAttribute("data-thread-msg-id") ?? "";
      setNestedSelection({ text, msgId, range: range.cloneRange() });
    }, 100);
  }, []);

  const hasConversation = messages.length > 0;
  const referenceHidden = middlewareData.hide?.referenceHidden;

  const popoverContent = (
    <motion.div
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="flex flex-col overflow-hidden rounded-xl border border-border/60 bg-background shadow-xl"
      exit={{ opacity: 0, y: 4, scale: 0.98 }}
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      ref={refs.setFloating}
      style={{
        ...floatingStyles,
        width: POPOVER_WIDTH,
        zIndex: 9999,
        visibility: referenceHidden ? "hidden" : "visible",
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
      {/* biome-ignore lint/a11y/noStaticElementInteractions: mouse selection inside this scroll region opens nested follow-up actions. */}
      <div
        className="overflow-y-auto"
        onMouseUp={handleNestedMouseUp}
        ref={conversationRef}
        style={{
          maxHeight: POPOVER_MAX_HEIGHT - 120,
          minHeight: hasConversation ? 60 : 0,
          display: hasConversation ? "block" : "none",
        }}
        tabIndex={-1}
      >
        <div className="relative flex flex-col gap-3 p-3">
          {messages.map((msg, index) => (
            <ThreadMessageBubble
              isLatestAssistant={
                msg.role === "assistant" && index === messages.length - 1
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
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-border/40 p-2">
        <div className="flex items-end gap-2">
          <textarea
            className="max-h-20 min-h-[36px] flex-1 resize-none rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
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

  return createPortal(
    <>
      {isPositioned && popoverContent}
      {nestedSelection && status !== "streaming" && (
        <NestedFollowUpButton
          onConfirm={() => {
            handleNestedFollowUp(nestedSelection.text, nestedSelection.msgId);
            setNestedSelection(null);
            window.getSelection()?.removeAllRanges();
          }}
          range={nestedSelection.range}
        />
      )}
    </>,
    document.body
  );
}

function NestedFollowUpButton({
  range,
  onConfirm,
}: {
  range: Range;
  onConfirm: () => void;
}) {
  const { refs, floatingStyles, middlewareData } = useFloating({
    placement: "bottom",
    strategy: "fixed",
    transform: false,
    middleware: [
      inline(),
      offset(4),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      hide(),
    ],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    refs.setReference({
      getBoundingClientRect: () => range.getBoundingClientRect(),
      getClientRects: () => range.getClientRects(),
    });
  }, [range, refs]);

  if (middlewareData.hide?.referenceHidden) {
    return null;
  }

  return (
    <button
      className="flex items-center gap-1 rounded-md border border-border/50 bg-background px-2 py-1 text-[10px] font-medium text-foreground shadow-md hover:bg-accent"
      onClick={onConfirm}
      ref={refs.setFloating}
      style={{ ...floatingStyles, zIndex: 10_000 }}
      type="button"
    >
      <MessageSquareQuote className="size-3" />
      追问
    </button>
  );
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
                if (!q || !onAnchorClick) {
                  return;
                }
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
