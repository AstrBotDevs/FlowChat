"use client";
import type { UseChatHelpers } from "@ai-sdk/react";
import { useCallback, useRef, useState } from "react";
import useSWR from "swr";
import { useTextSelection } from "@/hooks/use-text-selection";
import {
  DEFAULT_MODEL_SELECTION,
  type ModelSelection,
} from "@/lib/ai/model-selection";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { cn, fetcher, sanitizeText } from "@/lib/utils";
import { MessageContent, MessageResponse } from "../ai-elements/message";
import { Shimmer } from "../ai-elements/shimmer";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "../ai-elements/tool";
import { AnchorIndex, type AnchorIndexItem } from "./anchor-index";
import { AnnotatedText } from "./annotated-text";
import { useDataStream } from "./data-stream-provider";
import { DocumentToolResult } from "./document";
import { DocumentPreview } from "./document-preview";
import { FollowUpButton } from "./follow-up-button";
import {
  FollowUpPopover,
  type FollowUpPopoverAnchor,
} from "./follow-up-popover";
import { SparklesIcon } from "./icons";
import { MessageActions } from "./message-actions";
import { MessageReasoning } from "./message-reasoning";
import { PreviewAttachment } from "./preview-attachment";
import { Weather } from "./weather";

type QuoteWithRounds = {
  id: string;
  sourceThreadId: string;
  sourceMessageId: string;
  quoteText: string;
  childThreadId: string;
  isUnlinked: boolean;
  createdAt: string;
};

type ActivePopoverState = {
  quoteText: string;
  sourceMessageId: string;
  sourceThreadId: string | null;
  existingThreadId?: string;
  anchor: FollowUpPopoverAnchor;
} | null;

const PurePreviewMessage = ({
  addToolApprovalResponse,
  chatId,
  message,
  vote,
  isLoading,
  setMessages: _setMessages,
  regenerate: _regenerate,
  requiresScrollPadding: _requiresScrollPadding,
  onEdit,
  modelSelection,
}: {
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  chatId: string;
  message: ChatMessage;
  vote: Vote | undefined;
  isLoading: boolean;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  requiresScrollPadding: boolean;
  onEdit?: (message: ChatMessage) => void;
  modelSelection?: ModelSelection;
}) => {
  const attachmentsFromMessage = message.parts.filter(
    (part) => part.type === "file"
  );

  useDataStream();

  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  const hasAnyContent = message.parts?.some(
    (part) =>
      (part.type === "text" && part.text?.trim().length > 0) ||
      (part.type === "reasoning" &&
        "text" in part &&
        part.text?.trim().length > 0) ||
      part.type.startsWith("tool-")
  );
  const isThinking = isAssistant && isLoading && !hasAnyContent;

  const textContainerRef = useRef<HTMLDivElement>(null);
  const { selection, clearSelection } = useTextSelection(textContainerRef);

  const [activePopover, setActivePopover] = useState<ActivePopoverState>(null);

  const { data: quotesData, mutate: mutateQuotes } = useSWR<QuoteWithRounds[]>(
    isAssistant
      ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/quote?messageId=${message.id}`
      : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const quotes = quotesData ?? [];

  const handleFollowUp = useCallback(() => {
    if (!selection) {
      return;
    }

    const range = selection.range.cloneRange();
    window.getSelection()?.removeAllRanges();

    setActivePopover({
      quoteText: selection.text,
      sourceMessageId: message.id,
      sourceThreadId: null,
      anchor: { kind: "range", range },
    });
    clearSelection();
  }, [selection, message.id, clearSelection]);

  const handleAnchorClick = useCallback(
    (threadId: string, quoteId: string) => {
      setActivePopover({
        quoteText:
          quotes.find((q) => q.childThreadId === threadId)?.quoteText ?? "",
        sourceMessageId: message.id,
        sourceThreadId: null,
        existingThreadId: threadId,
        anchor: { kind: "quoteId", quoteId },
      });
    },
    [quotes, message.id]
  );

  const handleUnlink = useCallback(
    async (quoteId: string) => {
      await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/quote`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId }),
      });
      mutateQuotes();
    },
    [mutateQuotes]
  );

  const handleUnlinkAll = useCallback(async () => {
    await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/quote`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: message.id }),
    });
    mutateQuotes();
  }, [message.id, mutateQuotes]);

  const handlePopoverClose = useCallback(
    (hasMessages: boolean) => {
      setActivePopover(null);
      if (hasMessages) {
        mutateQuotes();
      }
    },
    [mutateQuotes]
  );

  const anchorIndexItems: AnchorIndexItem[] = quotes.map((q) => ({
    id: q.id,
    quoteText: q.quoteText,
    threadId: q.childThreadId,
  }));

  const attachments = attachmentsFromMessage.length > 0 && (
    <div
      className="flex flex-row justify-end gap-2"
      data-testid={"message-attachments"}
    >
      {attachmentsFromMessage.map((attachment) => (
        <PreviewAttachment
          attachment={{
            name: attachment.filename ?? "file",
            contentType: attachment.mediaType,
            url: attachment.url,
          }}
          key={attachment.url}
        />
      ))}
    </div>
  );

  const mergedReasoning = message.parts?.reduce(
    (acc, part) => {
      if (part.type === "reasoning" && part.text?.trim().length > 0) {
        return {
          text: acc.text ? `${acc.text}\n\n${part.text}` : part.text,
          isStreaming: "state" in part ? part.state === "streaming" : false,
          rendered: false,
        };
      }
      return acc;
    },
    { text: "", isStreaming: false, rendered: false }
  ) ?? { text: "", isStreaming: false, rendered: false };

  const parts = message.parts?.map((part, index) => {
    const { type } = part;
    const key = `message-${message.id}-part-${index}`;

    if (type === "reasoning") {
      if (!mergedReasoning.rendered && mergedReasoning.text) {
        mergedReasoning.rendered = true;
        return (
          <MessageReasoning
            isLoading={isLoading || mergedReasoning.isStreaming}
            key={key}
            reasoning={mergedReasoning.text}
          />
        );
      }
      return null;
    }

    if (type === "text") {
      const sanitized = sanitizeText(part.text);
      const hasQuotes = isAssistant && quotes.length > 0;

      return (
        <MessageContent
          className={cn("text-[13px] leading-[1.65]", {
            "w-fit max-w-[min(80%,56ch)] overflow-hidden break-words rounded-2xl rounded-br-lg border border-border/30 bg-gradient-to-br from-secondary to-muted px-3.5 py-2 shadow-[var(--shadow-card)]":
              message.role === "user",
          })}
          data-testid="message-content"
          key={key}
        >
          {hasQuotes ? (
            <AnnotatedText
              onAnchorClick={handleAnchorClick}
              onUnlink={handleUnlink}
              quotes={quotes}
              text={sanitized}
            />
          ) : (
            <MessageResponse>{sanitized}</MessageResponse>
          )}
        </MessageContent>
      );
    }

    if (type === "tool-getWeather") {
      const { toolCallId, state } = part;
      const approvalId = (part as { approval?: { id: string } }).approval?.id;
      const isDenied =
        state === "output-denied" ||
        (state === "approval-responded" &&
          (part as { approval?: { approved?: boolean } }).approval?.approved ===
            false);
      const widthClass = "w-[min(100%,450px)]";

      if (state === "output-available") {
        return (
          <div className={widthClass} key={toolCallId}>
            <Weather weatherAtLocation={part.output} />
          </div>
        );
      }

      if (isDenied) {
        return (
          <div className={widthClass} key={toolCallId}>
            <Tool className="w-full" defaultOpen={true}>
              <ToolHeader state="output-denied" type="tool-getWeather" />
              <ToolContent>
                <div className="px-4 py-3 text-muted-foreground text-sm">
                  Weather lookup was denied.
                </div>
              </ToolContent>
            </Tool>
          </div>
        );
      }

      if (state === "approval-responded") {
        return (
          <div className={widthClass} key={toolCallId}>
            <Tool className="w-full" defaultOpen={true}>
              <ToolHeader state={state} type="tool-getWeather" />
              <ToolContent>
                <ToolInput input={part.input} />
              </ToolContent>
            </Tool>
          </div>
        );
      }

      return (
        <div className={widthClass} key={toolCallId}>
          <Tool className="w-full" defaultOpen={true}>
            <ToolHeader state={state} type="tool-getWeather" />
            <ToolContent>
              {(state === "input-available" ||
                state === "approval-requested") && (
                <ToolInput input={part.input} />
              )}
              {state === "approval-requested" && approvalId && (
                <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
                  <button
                    className="rounded-md px-3 py-1.5 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() => {
                      addToolApprovalResponse({
                        id: approvalId,
                        approved: false,
                        reason: "User denied weather lookup",
                      });
                    }}
                    type="button"
                  >
                    Deny
                  </button>
                  <button
                    className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground text-sm transition-colors hover:bg-primary/90"
                    onClick={() => {
                      addToolApprovalResponse({
                        id: approvalId,
                        approved: true,
                      });
                    }}
                    type="button"
                  >
                    Allow
                  </button>
                </div>
              )}
            </ToolContent>
          </Tool>
        </div>
      );
    }

    if (type === "tool-createDocument") {
      const { toolCallId } = part;

      if (part.output && "error" in part.output) {
        return (
          <div
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 dark:bg-red-950/50"
            key={toolCallId}
          >
            Error creating document: {String(part.output.error)}
          </div>
        );
      }

      return <DocumentPreview key={toolCallId} result={part.output} />;
    }

    if (type === "tool-updateDocument") {
      const { toolCallId } = part;

      if (part.output && "error" in part.output) {
        return (
          <div
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 dark:bg-red-950/50"
            key={toolCallId}
          >
            Error updating document: {String(part.output.error)}
          </div>
        );
      }

      return (
        <div className="relative" key={toolCallId}>
          <DocumentPreview
            args={{ ...part.output, isUpdate: true }}
            result={part.output}
          />
        </div>
      );
    }

    if (type === "tool-requestSuggestions") {
      const { toolCallId, state } = part;

      return (
        <Tool
          className="w-[min(100%,450px)]"
          defaultOpen={true}
          key={toolCallId}
        >
          <ToolHeader state={state} type="tool-requestSuggestions" />
          <ToolContent>
            {state === "input-available" && <ToolInput input={part.input} />}
            {state === "output-available" && (
              <ToolOutput
                errorText={undefined}
                output={
                  "error" in part.output ? (
                    <div className="rounded border p-2 text-red-500">
                      Error: {String(part.output.error)}
                    </div>
                  ) : (
                    <DocumentToolResult
                      result={part.output}
                      type="request-suggestions"
                    />
                  )
                }
              />
            )}
          </ToolContent>
        </Tool>
      );
    }

    return null;
  });

  const actions = (
    <MessageActions
      chatId={chatId}
      isLoading={isLoading}
      key={`action-${message.id}`}
      message={message}
      onEdit={onEdit ? () => onEdit(message) : undefined}
      vote={vote}
    />
  );

  const followUpOverlay = isAssistant && (
    <>
      {selection?.isActive && (
        <FollowUpButton
          onFollowUp={handleFollowUp}
          range={selection.range}
          visible
        />
      )}

      {activePopover && (
        <FollowUpPopover
          anchor={activePopover.anchor}
          chatId={chatId}
          existingThreadId={activePopover.existingThreadId}
          modelSelection={modelSelection ?? DEFAULT_MODEL_SELECTION}
          onClose={handlePopoverClose}
          quoteText={activePopover.quoteText}
          sourceMessageId={activePopover.sourceMessageId}
          sourceThreadId={activePopover.sourceThreadId}
        />
      )}

      {anchorIndexItems.length >= 2 && (
        <AnchorIndex
          onJump={(quoteId) => {
            const el = document.querySelector(
              `[data-anchor-quote-id="${quoteId}"]`
            );
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
          onUnlink={handleUnlink}
          onUnlinkAll={handleUnlinkAll}
          quotes={anchorIndexItems}
        />
      )}
    </>
  );

  const content = isThinking ? (
    <div className="flex h-[calc(13px*1.65)] items-center text-[13px] leading-[1.65]">
      <Shimmer className="font-medium" duration={1}>
        Thinking...
      </Shimmer>
    </div>
  ) : (
    <>
      {attachments}
      {parts}
      {followUpOverlay}
      {actions}
    </>
  );

  return (
    <div
      className={cn(
        "group/message w-full",
        !isAssistant && "animate-[fade-up_0.25s_cubic-bezier(0.22,1,0.36,1)]"
      )}
      data-message-id={message.id}
      data-role={message.role}
      data-testid={`message-${message.role}`}
    >
      <div
        className={cn(
          isUser ? "flex flex-col items-end gap-2" : "flex items-start gap-3"
        )}
      >
        {isAssistant && (
          <div className="flex h-[calc(13px*1.65)] shrink-0 items-center">
            <div className="flex size-7 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground ring-1 ring-border/50">
              <SparklesIcon size={13} />
            </div>
          </div>
        )}
        {isAssistant ? (
          <div
            className="relative flex min-w-0 flex-1 flex-col gap-2"
            ref={textContainerRef}
          >
            {content}
          </div>
        ) : (
          content
        )}
      </div>
    </div>
  );
};

export const PreviewMessage = PurePreviewMessage;

export const ThinkingMessage = () => {
  return (
    <div
      className="group/message w-full"
      data-role="assistant"
      data-testid="message-assistant-loading"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-[calc(13px*1.65)] shrink-0 items-center">
          <div className="flex size-7 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground ring-1 ring-border/50">
            <SparklesIcon size={13} />
          </div>
        </div>

        <div className="flex h-[calc(13px*1.65)] items-center text-[13px] leading-[1.65]">
          <Shimmer className="font-medium" duration={1}>
            Thinking...
          </Shimmer>
        </div>
      </div>
    </div>
  );
};
