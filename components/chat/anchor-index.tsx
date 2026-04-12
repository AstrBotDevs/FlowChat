"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Trash2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export type AnchorIndexItem = {
  id: string;
  quoteText: string;
  threadId: string;
  roundCount: number;
};

export function AnchorIndex({
  quotes,
  onJump,
  onUnlink,
  onUnlinkAll,
}: {
  quotes: AnchorIndexItem[];
  onJump: (quoteId: string) => void;
  onUnlink: (quoteId: string) => void;
  onUnlinkAll: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (quotes.length < 2) return null;

  return (
    <div className="mt-2 rounded-lg border border-border/30 bg-muted/20">
      <button
        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        <ChevronDown
          className={cn(
            "size-3 transition-transform",
            expanded && "rotate-180"
          )}
        />
        <span>{quotes.length} 个追问锚点</span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            animate={{ height: "auto", opacity: 1 }}
            className="overflow-hidden"
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="flex flex-col gap-1 px-3 pb-2">
              {quotes.map((q) => (
                <div
                  className="flex items-center gap-2 text-xs"
                  key={q.id}
                >
                  <button
                    className="min-w-0 flex-1 truncate text-left text-foreground/80 transition-colors hover:text-primary"
                    onClick={() => onJump(q.id)}
                    type="button"
                  >
                    「{q.quoteText}」
                  </button>
                  {q.roundCount > 0 && (
                    <span className="shrink-0 text-muted-foreground">
                      {q.roundCount}轮
                    </span>
                  )}
                  <button
                    className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                    onClick={() => onUnlink(q.id)}
                    type="button"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}

              <button
                className="mt-1 self-end text-[10px] text-muted-foreground transition-colors hover:text-destructive"
                onClick={onUnlinkAll}
                type="button"
              >
                全部清除
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
