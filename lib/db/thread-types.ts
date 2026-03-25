export type ThreadType = "root" | "microscope" | "parallel";

export interface Thread {
  id: string;
  chatId: string;
  parentThreadId: string | null;
  sourceQuoteId: string | null;
  forkedMessageId: string | null;
  title: string | null;
  createdAt: Date;
}

export interface ThreadMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  parts: unknown[];
  attachments: unknown[];
  createdAt: Date;
}

export interface Quote {
  id: string;
  sourceThreadId: string;
  sourceMessageId: string;
  quoteText: string;
  childThreadId: string;
  createdAt: Date;
}

export function getThreadType(thread: Thread): ThreadType {
  if (!thread.parentThreadId) return "root";
  if (thread.sourceQuoteId) return "microscope";
  return "parallel";
}
