"use client";

import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
} from "@floating-ui/react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { MessageSquareQuote } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

export function FollowUpButton({
  mouseClient,
  onFollowUp,
  visible,
}: {
  mouseClient: { x: number; y: number };
  onFollowUp: () => void;
  visible: boolean;
}) {
  const { refs, floatingStyles } = useFloating({
    placement: "top",
    strategy: "fixed",
    transform: false,
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    refs.setReference({
      getBoundingClientRect: () => ({
        x: mouseClient.x,
        y: mouseClient.y,
        top: mouseClient.y,
        left: mouseClient.x,
        right: mouseClient.x,
        bottom: mouseClient.y,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      }),
    });
  }, [mouseClient, refs]);

  return createPortal(
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
          ref={refs.setFloating}
          style={{ ...floatingStyles, zIndex: 9998 }}
          transition={{ duration: 0.15 }}
          type="button"
        >
          <MessageSquareQuote className="size-3.5" />
          <span>追问</span>
        </motion.button>
      )}
    </AnimatePresence>,
    document.body
  );
}
