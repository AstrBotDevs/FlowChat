"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PopoverPosition {
  top: number;
  left: number;
}

export function TextSelectionPopover({
  children,
  onDrillStart,
}: {
  children: ReactNode;
  onDrillStart?: (quoteText: string) => void;
}) {
  const [selectedText, setSelectedText] = useState("");
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const enabled = !!onDrillStart;

  const handleMouseUp = useCallback(() => {
    if (!enabled) return;
    requestAnimationFrame(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        return;
      }

      if (
        containerRef.current &&
        !containerRef.current.contains(selection.anchorNode)
      ) {
        return;
      }

      const text = selection.toString().trim();
      if (text.length < 2 || text.length > 500) return;

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      setSelectedText(text);
      setPosition({
        top: rect.top + window.scrollY - 44,
        left: rect.left + window.scrollX + rect.width / 2,
      });
    });
  }, [enabled]);

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setPosition(null);
        setSelectedText("");
      }
    },
    []
  );

  useEffect(() => {
    if (!enabled) return;
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [handleClickOutside, enabled]);

  const handleDeepDive = useCallback(() => {
    if (!selectedText || !onDrillStart) return;
    onDrillStart(selectedText);
    setPosition(null);
    setSelectedText("");
    window.getSelection()?.removeAllRanges();
  }, [selectedText, onDrillStart]);

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <>
      <div
        ref={containerRef}
        className="contents"
        onMouseUp={handleMouseUp}
        role="presentation"
      >
        {children}
      </div>
      {position &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            className={cn(
              "fixed z-50 flex items-center gap-1.5 rounded-lg border border-border/50",
              "bg-card/95 px-2.5 py-1.5 shadow-[var(--shadow-float)] backdrop-blur-lg",
              "animate-[fade-up_0.15s_ease-out]"
            )}
            style={{
              top: position.top,
              left: position.left,
              transform: "translateX(-50%)",
            }}
          >
            <button
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
              onClick={handleDeepDive}
              type="button"
            >
              <SearchIcon className="size-3.5" />
              <span>深入探究</span>
            </button>
            <div className="h-3 w-px bg-border/50" />
            <span className="max-w-[120px] truncate text-[11px] text-muted-foreground">
              &ldquo;{selectedText.slice(0, 30)}
              {selectedText.length > 30 ? "..." : ""}&rdquo;
            </span>
          </div>,
          document.body
        )}
    </>
  );
}
