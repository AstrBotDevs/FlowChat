"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageResponse } from "@/components/ai-elements/message";

export type AnnotatedQuote = {
  id: string;
  childThreadId: string;
  quoteText: string;
};

export function AnnotatedText({
  text,
  quotes,
  onAnchorClick,
  onUnlink,
}: {
  text: string;
  quotes: AnnotatedQuote[];
  onAnchorClick: (threadId: string, quoteId: string) => void;
  onUnlink?: (quoteId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callbacksRef = useRef({ onAnchorClick, onUnlink });
  callbacksRef.current = { onAnchorClick, onUnlink };

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    quoteId: string;
  } | null>(null);

  const quotesKey = quotes.map((q) => q.id).join(",");

  useEffect(() => {
    const container = containerRef.current;
    if (!container || quotes.length === 0) return;

    for (const existing of container.querySelectorAll("[data-anchor-quote-id]")) {
      const parent = existing.parentNode;
      if (parent) {
        while (existing.firstChild) parent.insertBefore(existing.firstChild, existing);
        parent.removeChild(existing);
      }
    }

    const treeWalker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT
    );
    const textNodes: Text[] = [];
    let node: Node | null;
    while ((node = treeWalker.nextNode())) {
      textNodes.push(node as Text);
    }

    const fullText = textNodes.map((n) => n.textContent ?? "").join("");

    for (const q of quotes) {
      const searchIdx = fullText.indexOf(q.quoteText);
      if (searchIdx === -1) continue;

      const freshWalker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT
      );
      const freshNodes: Text[] = [];
      let fn: Node | null;
      while ((fn = freshWalker.nextNode())) {
        freshNodes.push(fn as Text);
      }
      const freshFull = freshNodes.map((n) => n.textContent ?? "").join("");
      const freshIdx = freshFull.indexOf(q.quoteText);
      if (freshIdx === -1) continue;

      let charOffset = 0;
      const range = document.createRange();
      let startSet = false;

      for (const tn of freshNodes) {
        const len = tn.textContent?.length ?? 0;
        const nodeStart = charOffset;
        const nodeEnd = charOffset + len;

        if (!startSet && freshIdx < nodeEnd) {
          range.setStart(tn, freshIdx - nodeStart);
          startSet = true;
        }

        const endIdx = freshIdx + q.quoteText.length;
        if (startSet && endIdx <= nodeEnd) {
          range.setEnd(tn, endIdx - nodeStart);
          break;
        }

        charOffset = nodeEnd;
      }

      if (!startSet) continue;

      const wrapper = document.createElement("span");
      wrapper.setAttribute("data-anchor-quote-id", q.id);
      wrapper.setAttribute("data-anchor-thread-id", q.childThreadId);
      wrapper.className =
        "cursor-pointer underline decoration-primary/40 decoration-dotted underline-offset-4 transition-all hover:decoration-primary hover:decoration-solid";

      try {
        range.surroundContents(wrapper);
      } catch {
        continue;
      }
    }

    const handleClick = (e: Event) => {
      const target = (e.target as HTMLElement).closest("[data-anchor-quote-id]");
      if (!target) return;
      const qid = target.getAttribute("data-anchor-quote-id") ?? "";
      const tid = target.getAttribute("data-anchor-thread-id") ?? "";
      callbacksRef.current.onAnchorClick(tid, qid);
    };

    const handleCtx = (e: Event) => {
      if (!callbacksRef.current.onUnlink) return;
      const target = (e.target as HTMLElement).closest("[data-anchor-quote-id]");
      if (!target) return;
      e.preventDefault();
      const qid = target.getAttribute("data-anchor-quote-id") ?? "";
      const me = e as MouseEvent;
      setContextMenu({ x: me.clientX, y: me.clientY, quoteId: qid });
    };

    container.addEventListener("click", handleClick);
    container.addEventListener("contextmenu", handleCtx);

    return () => {
      container.removeEventListener("click", handleClick);
      container.removeEventListener("contextmenu", handleCtx);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotesKey]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [contextMenu]);

  return (
    <div ref={containerRef}>
      <MessageResponse>{text}</MessageResponse>

      {contextMenu &&
        callbacksRef.current.onUnlink &&
        createPortal(
          <div
            className="fixed z-[10000] min-w-[140px] rounded-lg border border-border/60 bg-background py-1 shadow-lg"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="w-full px-3 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-muted"
              onClick={() => {
                callbacksRef.current.onUnlink?.(contextMenu.quoteId);
                setContextMenu(null);
              }}
              type="button"
            >
              解除追问标记
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}
