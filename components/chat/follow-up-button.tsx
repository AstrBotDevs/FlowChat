"use client";

import { AnimatePresence, motion } from "framer-motion";
import { MessageSquareQuote } from "lucide-react";
import { createPortal } from "react-dom";

export function FollowUpButton({
  selectionRect,
  onFollowUp,
  visible,
}: {
  selectionRect: DOMRect;
  onFollowUp: () => void;
  visible: boolean;
}) {
  const top = selectionRect.bottom + 6;
  const left = selectionRect.left + selectionRect.width / 2;

  const content = (
    <AnimatePresence>
      {visible && (
        <motion.button
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs font-medium text-foreground shadow-md transition-colors hover:bg-accent"
          data-follow-up-button
          exit={{ opacity: 0, y: -4 }}
          initial={{ opacity: 0, y: 4 }}
          onClick={(e) => {
            e.stopPropagation();
            onFollowUp();
          }}
          style={{
            position: "fixed",
            top,
            left,
            transform: "translateX(-50%)",
            zIndex: 9998,
          }}
          transition={{ duration: 0.15 }}
          type="button"
        >
          <MessageSquareQuote className="size-3.5" />
          <span>追问</span>
        </motion.button>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}
