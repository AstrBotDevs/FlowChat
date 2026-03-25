"use client";

import { useCallback, useEffect, useRef } from "react";

interface QuoteMarker {
  id: string;
  quoteText: string;
  childThreadId: string;
}

const HIGHLIGHT_ATTR = "data-quote-id";
const HIGHLIGHT_CLASS = "quote-highlight";
const HIGHLIGHT_ACTIVE_CLASS = "quote-highlight-active";

/**
 * Walks text nodes inside a container and wraps occurrences of `text`
 * with a <mark> element. Returns the created <mark> or null.
 */
function highlightTextInDOM(
  container: HTMLElement,
  text: string,
  quoteId: string
): HTMLElement | null {
  // Skip if already highlighted
  if (container.querySelector(`[${HIGHLIGHT_ATTR}="${quoteId}"]`)) {
    return container.querySelector(
      `[${HIGHLIGHT_ATTR}="${quoteId}"]`
    ) as HTMLElement;
  }

  const treeWalker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null
  );

  // Collect all text nodes
  const textNodes: Text[] = [];
  let node: Text | null;
  while ((node = treeWalker.nextNode() as Text | null)) {
    textNodes.push(node);
  }

  // Build a concatenated string with node boundaries
  // so we can find cross-node matches
  let fullText = "";
  const nodeMap: Array<{ node: Text; start: number; end: number }> = [];
  for (const tn of textNodes) {
    const content = tn.textContent ?? "";
    nodeMap.push({ node: tn, start: fullText.length, end: fullText.length + content.length });
    fullText += content;
  }

  // Normalize whitespace for matching
  const normalizedFull = fullText.replace(/\s+/g, " ");
  const normalizedQuery = text.replace(/\s+/g, " ");
  const matchIndex = normalizedFull.indexOf(normalizedQuery);
  if (matchIndex === -1) return null;

  // Map normalized match back to original positions
  // Walk through original text to find the original char positions
  let normalIdx = 0;
  let origStartIdx = -1;
  let origEndIdx = -1;
  for (let i = 0; i < fullText.length && origEndIdx === -1; i++) {
    if (normalIdx === matchIndex && origStartIdx === -1) {
      origStartIdx = i;
    }
    if (normalIdx === matchIndex + normalizedQuery.length) {
      origEndIdx = i;
      break;
    }
    // Advance normalized index: collapse whitespace
    if (/\s/.test(fullText[i])) {
      // Skip all consecutive whitespace in original
      while (i + 1 < fullText.length && /\s/.test(fullText[i + 1])) {
        i++;
      }
      normalIdx++; // one space in normalized
    } else {
      normalIdx++;
    }
  }
  if (origEndIdx === -1) origEndIdx = fullText.length;
  if (origStartIdx === -1) return null;

  // Find which text nodes the match spans
  const startNodeInfo = nodeMap.find(
    (n) => origStartIdx >= n.start && origStartIdx < n.end
  );
  const endNodeInfo = nodeMap.find(
    (n) => origEndIdx > n.start && origEndIdx <= n.end
  );

  if (!startNodeInfo || !endNodeInfo) return null;

  // Simple case: match is within a single text node
  if (startNodeInfo.node === endNodeInfo.node) {
    const tn = startNodeInfo.node;
    const localStart = origStartIdx - startNodeInfo.start;
    const localEnd = origEndIdx - startNodeInfo.start;

    const range = document.createRange();
    range.setStart(tn, localStart);
    range.setEnd(tn, localEnd);

    const mark = document.createElement("mark");
    mark.className = HIGHLIGHT_CLASS;
    mark.setAttribute(HIGHLIGHT_ATTR, quoteId);
    range.surroundContents(mark);
    return mark;
  }

  // Multi-node case: wrap each affected text node segment
  // Use a simpler approach - wrap the first node's portion as the anchor
  const tn = startNodeInfo.node;
  const localStart = origStartIdx - startNodeInfo.start;
  const content = tn.textContent ?? "";

  const range = document.createRange();
  range.setStart(tn, localStart);
  range.setEnd(tn, content.length);

  const mark = document.createElement("mark");
  mark.className = HIGHLIGHT_CLASS;
  mark.setAttribute(HIGHLIGHT_ATTR, quoteId);

  try {
    range.surroundContents(mark);
  } catch {
    // If surroundContents fails (e.g. cross-element), fall back
    // to wrapping just the visible portion
    return null;
  }

  // Also highlight remaining nodes in the match (visual only, no extra mark)
  for (const info of nodeMap) {
    if (info.start >= startNodeInfo.end && info.end <= origEndIdx) {
      const wrapper = document.createElement("mark");
      wrapper.className = HIGHLIGHT_CLASS;
      wrapper.setAttribute(`${HIGHLIGHT_ATTR}-cont`, quoteId);
      if (info.node.parentNode) {
        info.node.parentNode.replaceChild(wrapper, info.node);
        wrapper.appendChild(info.node);
      }
    }
  }

  return mark;
}

function clearHighlights(container: HTMLElement) {
  const marks = container.querySelectorAll(
    `mark.${HIGHLIGHT_CLASS}, mark[${HIGHLIGHT_ATTR}-cont]`
  );
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
    parent.normalize(); // merge adjacent text nodes
  });
}

export function useQuoteHighlighter(
  quotes: QuoteMarker[],
  onQuoteClick: (quote: QuoteMarker) => void
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const clickHandlersRef = useRef<Map<string, EventListener>>(new Map());

  // Apply/update highlights when quotes or container content changes
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Clear previous
    clearHighlights(el);
    clickHandlersRef.current.clear();

    // Apply new highlights
    for (const quote of quotes) {
      const mark = highlightTextInDOM(el, quote.quoteText, quote.id);
      if (mark) {
        const handler = (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          onQuoteClick(quote);
        };
        mark.addEventListener("click", handler);
        clickHandlersRef.current.set(quote.id, handler);
      }
    }

    return () => {
      // Cleanup
      if (el) {
        clearHighlights(el);
      }
      clickHandlersRef.current.clear();
    };
  }, [quotes, onQuoteClick]);

  // Set active highlight
  const setActiveQuote = useCallback((quoteId: string | null) => {
    const el = containerRef.current;
    if (!el) return;

    el.querySelectorAll(`mark.${HIGHLIGHT_ACTIVE_CLASS}`).forEach((m) =>
      m.classList.remove(HIGHLIGHT_ACTIVE_CLASS)
    );

    if (quoteId) {
      const mark = el.querySelector(`[${HIGHLIGHT_ATTR}="${quoteId}"]`);
      mark?.classList.add(HIGHLIGHT_ACTIVE_CLASS);
    }
  }, []);

  /** Get the DOM element for a specific quote mark */
  const getMarkElement = useCallback((quoteId: string): HTMLElement | null => {
    const el = containerRef.current;
    if (!el) return null;
    return el.querySelector(`[${HIGHLIGHT_ATTR}="${quoteId}"]`) as HTMLElement | null;
  }, []);

  return { containerRef, setActiveQuote, getMarkElement };
}
