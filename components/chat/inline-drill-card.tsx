"use client";

import {
  ArrowUpIcon,
  ChevronRightIcon,
  CornerDownRightIcon,
  XIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useActiveChat } from "@/hooks/use-active-chat";
import { type DrillMessage, useThreadAPI } from "@/hooks/use-thread";
import { cn, generateUUID, sanitizeText } from "@/lib/utils";
import { MessageResponse } from "../ai-elements/message";
import { Shimmer } from "../ai-elements/shimmer";
import { SparklesIcon } from "./icons";

// ── Types ──────────────────────────────────────────────

interface DrillLevel {
  threadId: string;
  quoteText: string;
  messages: DrillMessage[];
}

interface AnchorRect {
  top: number;
  left: number;
  width: number;
  bottom: number;
}

const MOCK_ROOT_THREAD_ID = "00000000-0000-4000-8000-000000000100";
const CARD_WIDTH = 420;
const CARD_MAX_HEIGHT = 440;
const CARD_GAP = 8;

// ── Positioning ────────────────────────────────────────

function computePosition(anchor: AnchorRect | null): React.CSSProperties {
  if (!anchor) {
    // Fallback: center of viewport
    return {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    };
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Try to position below the anchor
  let top = anchor.bottom + CARD_GAP;
  let left = anchor.left;

  // If it would overflow bottom, position above
  if (top + CARD_MAX_HEIGHT > vh - 16) {
    top = anchor.top - CARD_MAX_HEIGHT - CARD_GAP;
    // If that's also off-screen, just pin to bottom
    if (top < 16) {
      top = Math.max(16, vh - CARD_MAX_HEIGHT - 16);
    }
  }

  // Clamp horizontal
  if (left + CARD_WIDTH > vw - 16) {
    left = vw - CARD_WIDTH - 16;
  }
  if (left < 16) {
    left = 16;
  }

  return {
    position: "fixed",
    top,
    left,
    width: CARD_WIDTH,
  };
}

// ── InlineDrillCard ────────────────────────────────────

export function InlineDrillCard({
  sourceMessageId,
  initialQuoteText,
  existingThreadId,
  anchorRect,
  onClose,
}: {
  sourceMessageId: string;
  initialQuoteText: string;
  existingThreadId?: string;
  anchorRect?: AnchorRect | null;
  onClose: () => void;
}) {
  const { chatId } = useActiveChat();
  const api = useThreadAPI();
  const [drillStack, setDrillStack] = useState<DrillLevel[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const currentLevel = drillStack[drillStack.length - 1] ?? null;

  // ── Initialize thread ──
  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (existingThreadId) {
        const messages = await api.getThreadMessages(existingThreadId);
        if (!cancelled) {
          setDrillStack([
            { threadId: existingThreadId, quoteText: initialQuoteText, messages },
          ]);
          setIsInitializing(false);
        }
        return;
      }

      const result = await api.createDrillThread({
        chatId,
        parentThreadId: MOCK_ROOT_THREAD_ID,
        sourceMessageId,
        quoteText: initialQuoteText,
      });

      if (cancelled || !result) {
        setIsInitializing(false);
        return;
      }

      const messages = await api.getThreadMessages(result.threadId);
      if (!cancelled) {
        setDrillStack([
          { threadId: result.threadId, quoteText: initialQuoteText, messages },
        ]);
        setIsInitializing(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, [api, chatId, sourceMessageId, initialQuoteText, existingThreadId]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [currentLevel?.messages.length]);

  // Auto-focus input
  useEffect(() => {
    if (!isInitializing) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isInitializing, drillStack.length]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        // Don't close if clicking on a quote highlight mark
        const target = e.target as HTMLElement;
        if (target.closest?.("mark.quote-highlight")) return;
        onClose();
      }
    };
    // Use setTimeout to avoid immediate close from the same click
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handler);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  // ── Send message ──
  const handleSend = useCallback(async () => {
    if (!input.trim() || !currentLevel || isLoading) return;
    const text = input.trim();
    setInput("");
    setIsLoading(true);

    const userMsg: DrillMessage = {
      id: generateUUID(),
      role: "user",
      parts: [{ type: "text", text }],
    };

    setDrillStack((prev) => {
      const next = [...prev];
      const lvl = { ...next[next.length - 1] };
      lvl.messages = [...lvl.messages, userMsg];
      next[next.length - 1] = lvl;
      return next;
    });

    const responseText = await api.sendDrillMessage({
      threadId: currentLevel.threadId,
      chatId,
      text,
    });

    if (responseText) {
      const assistantMsg: DrillMessage = {
        id: generateUUID(),
        role: "assistant",
        parts: [{ type: "text", text: responseText }],
      };
      setDrillStack((prev) => {
        const next = [...prev];
        const lvl = { ...next[next.length - 1] };
        lvl.messages = [...lvl.messages, assistantMsg];
        next[next.length - 1] = lvl;
        return next;
      });
    }

    setIsLoading(false);
  }, [input, currentLevel, isLoading, api, chatId]);

  // ── Sub-drill ──
  const handleSubDrill = useCallback(
    async (quoteText: string, msgId: string) => {
      if (!currentLevel) return;
      setIsLoading(true);

      const result = await api.createDrillThread({
        chatId,
        parentThreadId: currentLevel.threadId,
        sourceMessageId: msgId,
        quoteText,
      });

      if (result) {
        const messages = await api.getThreadMessages(result.threadId);
        setDrillStack((prev) => [
          ...prev,
          { threadId: result.threadId, quoteText, messages },
        ]);
      }
      setIsLoading(false);
    },
    [currentLevel, api, chatId]
  );

  const navigateTo = useCallback(
    (index: number) => {
      if (index < drillStack.length - 1) {
        setDrillStack((prev) => prev.slice(0, index + 1));
      }
    },
    [drillStack.length]
  );

  // ── Render ──
  const posStyle = computePosition(anchorRect ?? null);

  const card = (
    <div
      ref={cardRef}
      className={cn(
        "z-50 flex flex-col overflow-hidden rounded-xl",
        "border border-border/50 bg-card",
        "shadow-[var(--shadow-float)]",
        "animate-[fade-up_0.15s_var(--ease-spring)]"
      )}
      style={{ ...posStyle, maxHeight: CARD_MAX_HEIGHT }}
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-1.5 border-b border-border/30 px-3 py-2">
        <CornerDownRightIcon className="size-3 shrink-0 text-muted-foreground/50" />

        <div className="flex min-w-0 flex-1 items-center gap-1 text-[11px]">
          <button
            className="shrink-0 text-muted-foreground/60 transition-colors hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            主线
          </button>
          {drillStack.map((level, i) => (
            <span key={level.threadId} className="flex items-center gap-1 min-w-0">
              <ChevronRightIcon className="size-2.5 shrink-0 text-muted-foreground/30" />
              <button
                className={cn(
                  "truncate max-w-[100px] transition-colors",
                  i === drillStack.length - 1
                    ? "text-foreground/80 font-medium"
                    : "text-muted-foreground/60 hover:text-foreground"
                )}
                onClick={() => navigateTo(i)}
                type="button"
              >
                {level.quoteText.length > 18
                  ? `${level.quoteText.slice(0, 18)}...`
                  : level.quoteText}
              </button>
            </span>
          ))}
        </div>

        <button
          className="shrink-0 rounded-sm p-0.5 text-muted-foreground/40 transition-colors hover:text-foreground"
          onClick={onClose}
          type="button"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>

      {/* ── Messages ── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ scrollbarWidth: "thin" }}
      >
        {isInitializing ? (
          <div className="flex items-center px-3 py-4 text-[12px]">
            <Shimmer className="text-muted-foreground" duration={1}>
              加载中...
            </Shimmer>
          </div>
        ) : currentLevel ? (
          <div
            key={currentLevel.threadId}
            className="flex flex-col gap-0 animate-[fade-up_0.12s_ease-out]"
          >
            {/* Quote anchor */}
            <div className="flex items-start gap-2 bg-muted/30 px-3 py-2">
              <div className="mt-0.5 h-full w-0.5 shrink-0 rounded-full bg-foreground/10" />
              <p className="text-[12px] leading-relaxed text-muted-foreground/70 italic">
                &ldquo;{currentLevel.quoteText}&rdquo;
              </p>
            </div>

            {/* Message list */}
            <div className="flex flex-col">
              {currentLevel.messages.map((msg) => (
                <DrillMessageRow
                  key={msg.id}
                  message={msg}
                  onSubDrill={(qt) => handleSubDrill(qt, msg.id)}
                />
              ))}

              {isLoading && (
                <div className="flex items-center gap-2 px-3 py-2.5 text-[12px]">
                  <div className="flex size-4 shrink-0 items-center justify-center rounded bg-muted/60 ring-1 ring-border/40">
                    <SparklesIcon size={8} />
                  </div>
                  <Shimmer className="text-muted-foreground" duration={1}>
                    思考中...
                  </Shimmer>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Input ── */}
      {currentLevel && !isInitializing && (
        <div className="border-t border-border/30 px-3 py-2">
          <div className="flex items-end gap-1.5">
            <textarea
              ref={inputRef}
              className={cn(
                "min-h-[28px] max-h-[72px] flex-1 resize-none rounded-md px-2.5 py-1.5",
                "bg-muted/40 text-[12px] leading-relaxed text-foreground",
                "placeholder:text-muted-foreground/35",
                "transition-colors focus:bg-muted/60 focus:outline-none"
              )}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="继续追问..."
              rows={1}
              value={input}
            />
            <button
              className={cn(
                "flex size-[26px] shrink-0 items-center justify-center rounded-md transition-all duration-150",
                input.trim()
                  ? "bg-foreground text-background hover:opacity-80 active:scale-95"
                  : "bg-muted/60 text-muted-foreground/20 cursor-not-allowed"
              )}
              disabled={!input.trim() || isLoading}
              onClick={handleSend}
              type="button"
            >
              <ArrowUpIcon className="size-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(card, document.body);
}

// ── Message Row ────────────────────────────────────────

function DrillMessageRow({
  message,
  onSubDrill,
}: {
  message: DrillMessage;
  onSubDrill: (quoteText: string) => void;
}) {
  const textContent = message.parts
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text as string)
    .join("");

  if (message.role === "user") {
    return (
      <div className="px-3 py-2">
        <div className="ml-6 w-fit max-w-[80%] rounded-lg rounded-br-sm bg-gradient-to-br from-secondary to-muted px-2.5 py-1.5 text-[12px] leading-relaxed text-foreground/80 border border-border/20">
          {textContent}
        </div>
      </div>
    );
  }

  return (
    <div className="group/drill-msg px-3 py-2 hover:bg-muted/20 transition-colors">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded bg-muted/60 ring-1 ring-border/40">
          <SparklesIcon size={8} />
        </div>
        <DrillAssistantContent
          messageId={message.id}
          onSubDrill={onSubDrill}
          text={textContent}
        />
      </div>
    </div>
  );
}

// ── Assistant Content (with sub-selection) ─────────────

function DrillAssistantContent({
  messageId,
  text,
  onSubDrill,
}: {
  messageId: string;
  text: string;
  onSubDrill: (quoteText: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<{
    text: string;
    top: number;
    left: number;
  } | null>(null);

  const handleMouseUp = useCallback(() => {
    requestAnimationFrame(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) return;
      if (containerRef.current && !containerRef.current.contains(selection.anchorNode)) return;

      const selText = selection.toString().trim();
      if (selText.length < 2 || selText.length > 500) return;

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const cRect = containerRef.current!.getBoundingClientRect();

      setSel({
        text: selText,
        top: rect.top - cRect.top - 32,
        left: rect.left - cRect.left + rect.width / 2,
      });
    });
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setSel(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1" onMouseUp={handleMouseUp}>
      <div className="text-[12px] leading-relaxed [&_p]:my-0.5">
        <MessageResponse>{sanitizeText(text)}</MessageResponse>
      </div>

      {sel && (
        <div
          ref={popoverRef}
          className={cn(
            "absolute z-50 rounded-md border border-border/50",
            "bg-card/95 px-2 py-1 shadow-[var(--shadow-float)] backdrop-blur-md",
            "animate-[fade-up_0.1s_ease-out]"
          )}
          style={{ top: sel.top, left: sel.left, transform: "translateX(-50%)" }}
        >
          <button
            className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => {
              onSubDrill(sel.text);
              setSel(null);
              window.getSelection()?.removeAllRanges();
            }}
            type="button"
          >
            <CornerDownRightIcon className="size-3" />
            <span>深入</span>
          </button>
        </div>
      )}
    </div>
  );
}
