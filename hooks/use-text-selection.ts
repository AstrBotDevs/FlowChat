"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type TextSelectionState = {
  text: string;
  rect: DOMRect;
  messageId: string;
  isActive: boolean;
};

const SELECTION_DELAY_MS = 150;

function isInsideCodeBlock(node: Node): boolean {
  let current: Node | null = node;
  while (current) {
    if (current instanceof HTMLElement) {
      const tag = current.tagName.toLowerCase();
      if (tag === "pre" || tag === "code") return true;
    }
    current = current.parentNode;
  }
  return false;
}

export function useTextSelection(
  containerRef: React.RefObject<HTMLElement | null>
) {
  const [selection, setSelection] = useState<TextSelectionState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    setSelection(null);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseUp = () => {
      if (timerRef.current) clearTimeout(timerRef.current);

      timerRef.current = setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) {
          return;
        }

        const text = sel.toString().trim();
        if (!text) {
          return;
        }

        const range = sel.getRangeAt(0);

        if (
          !container.contains(range.startContainer) ||
          !container.contains(range.endContainer)
        ) {
          return;
        }

        if (
          isInsideCodeBlock(range.startContainer) ||
          isInsideCodeBlock(range.endContainer)
        ) {
          return;
        }

        const messageEl = container.closest("[data-role='assistant']");
        const messageId =
          messageEl?.getAttribute("data-message-id") ??
          container.getAttribute("data-message-id") ??
          "";

        const rect = range.getBoundingClientRect();

        setSelection({ text, rect, messageId, isActive: true });
      }, SELECTION_DELAY_MS);
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (
        selection?.isActive &&
        !(e.target as HTMLElement)?.closest("[data-follow-up-button]")
      ) {
        clear();
      }
    };

    const handleScroll = () => {
      if (selection?.isActive) clear();
    };

    container.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("scroll", handleScroll, true);

    return () => {
      container.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("scroll", handleScroll, true);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [containerRef, selection?.isActive, clear]);

  return { selection, clearSelection: clear };
}
