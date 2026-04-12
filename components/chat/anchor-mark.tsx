"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";

export function AnchorMark({
  quoteText,
  roundCount,
  quoteId,
  threadId,
  onClick,
  onUnlink,
}: {
  quoteText: string;
  roundCount: number;
  quoteId: string;
  threadId: string;
  onClick: (threadId: string) => void;
  onUnlink: (quoteId: string) => void;
}) {
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setMenuPos({ x: e.clientX, y: e.clientY });
      setShowContextMenu(true);

      const close = () => {
        setShowContextMenu(false);
        document.removeEventListener("click", close);
      };
      setTimeout(() => document.addEventListener("click", close), 0);
    },
    []
  );

  return (
    <>
      <span
        className="cursor-pointer underline decoration-primary/40 decoration-dotted underline-offset-4 transition-all hover:decoration-primary hover:decoration-solid"
        data-anchor-quote-id={quoteId}
        onClick={() => onClick(threadId)}
        onContextMenu={handleContextMenu}
      >
        {quoteText}
        {roundCount > 0 && (
          <sup className="ml-0.5 inline-flex size-4 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary">
            {roundCount}
          </sup>
        )}
      </span>

      {showContextMenu &&
        createPortal(
          <div
            className="fixed z-[10000] min-w-[140px] rounded-lg border border-border/60 bg-background py-1 shadow-lg"
            style={{ left: menuPos.x, top: menuPos.y }}
          >
            <button
              className="w-full px-3 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-muted"
              onClick={() => {
                onUnlink(quoteId);
                setShowContextMenu(false);
              }}
              type="button"
            >
              解除追问标记
            </button>
          </div>,
          document.body
        )}
    </>
  );
}
