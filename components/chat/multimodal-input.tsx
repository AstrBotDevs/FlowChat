"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import equal from "fast-deep-equal";
import {
  ArrowUpIcon,
  BrainIcon,
  EyeIcon,
  KeyIcon,
  LockIcon,
  WrenchIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  type ChangeEvent,
  type Dispatch,
  memo,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { useLocalStorage, useWindowSize } from "usehooks-ts";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import type { ModelSelection } from "@/lib/ai/model-selection";
import {
  type ChatModel,
  DEFAULT_CHAT_MODEL,
  type ModelCapabilities,
} from "@/lib/ai/models";
import {
  DIRECT_PROVIDER_IDS,
  GATEWAY_PROVIDER_ID,
  KNOWN_PROVIDERS,
} from "@/lib/ai/provider-registry";
import type { Attachment, ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "../ai-elements/prompt-input";
import { Button } from "../ui/button";
import { PaperclipIcon, StopIcon } from "./icons";
import { PreviewAttachment } from "./preview-attachment";
import {
  type SlashCommand,
  SlashCommandMenu,
  slashCommands,
} from "./slash-commands";
import { SuggestedActions } from "./suggested-actions";

function setCookie(name: string, value: string) {
  const maxAge = 60 * 60 * 24 * 365;
  // biome-ignore lint/suspicious/noDocumentCookie: needed for client-side cookie setting
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}`;
}

function PureMultimodalInput({
  chatId,
  input,
  setInput,
  status,
  stop,
  attachments,
  setAttachments,
  messages,
  setMessages,
  sendMessage,
  className,
  modelSelection,
  onModelChange,
  editingMessage,
  onCancelEdit,
  isLoading,
}: {
  chatId: string;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  status: UseChatHelpers<ChatMessage>["status"];
  stop: () => void;
  attachments: Attachment[];
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  messages: UIMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  sendMessage:
    | UseChatHelpers<ChatMessage>["sendMessage"]
    | (() => Promise<void>);
  className?: string;
  modelSelection: ModelSelection;
  onModelChange?: (selection: ModelSelection) => void;
  editingMessage?: ChatMessage | null;
  onCancelEdit?: () => void;
  isLoading?: boolean;
}) {
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();

  const { data: modelsData } = useSWR(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/models`,
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: false, dedupingInterval: 3_600_000 }
  );
  const { data: providersData } = useSWR(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/providers`,
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: true, dedupingInterval: 30_000 }
  );
  const hasConfiguredProviders = (providersData?.length ?? 0) > 0;
  const hasAutoFocused = useRef(false);
  useEffect(() => {
    if (!hasAutoFocused.current && width) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
        hasAutoFocused.current = true;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [width]);

  const [localStorageInput, setLocalStorageInput] = useLocalStorage(
    "input",
    ""
  );

  useEffect(() => {
    if (textareaRef.current) {
      const domValue = textareaRef.current.value;
      const finalValue = domValue || localStorageInput || "";
      setInput(finalValue);
    }
  }, [localStorageInput, setInput]);

  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = event.target.value;
    setInput(val);

    if (val.startsWith("/") && !val.includes(" ")) {
      setSlashOpen(true);
      setSlashQuery(val.slice(1));
      setSlashIndex(0);
    } else {
      setSlashOpen(false);
    }
  };

  const handleSlashSelect = (cmd: SlashCommand) => {
    setSlashOpen(false);
    setInput("");
    switch (cmd.action) {
      case "new":
        router.push("/");
        break;
      case "clear":
        setMessages(() => []);
        break;
      case "rename":
        toast("Rename is available from the sidebar chat menu.");
        break;
      case "model": {
        const modelBtn = document.querySelector<HTMLButtonElement>(
          "[data-testid='model-selector']"
        );
        modelBtn?.click();
        break;
      }
      case "theme":
        setTheme(resolvedTheme === "dark" ? "light" : "dark");
        break;
      case "delete":
        toast("Delete this chat?", {
          action: {
            label: "Delete",
            onClick: () => {
              fetch(
                `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/chat?id=${chatId}`,
                { method: "DELETE" }
              );
              router.push("/");
              toast.success("Chat deleted");
            },
          },
        });
        break;
      case "purge":
        toast("Delete all chats?", {
          action: {
            label: "Delete all",
            onClick: () => {
              fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/history`, {
                method: "DELETE",
              });
              router.push("/");
              toast.success("All chats deleted");
            },
          },
        });
        break;
      default:
        break;
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);

  const submitForm = useCallback(() => {
    window.history.pushState(
      {},
      "",
      `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/chat/${chatId}`
    );

    sendMessage({
      role: "user",
      parts: [
        ...attachments.map((attachment) => ({
          type: "file" as const,
          url: attachment.url,
          name: attachment.name,
          mediaType: attachment.contentType,
        })),
        {
          type: "text",
          text: input,
        },
      ],
    });

    setAttachments([]);
    setLocalStorageInput("");
    setInput("");

    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [
    input,
    setInput,
    attachments,
    sendMessage,
    setAttachments,
    setLocalStorageInput,
    width,
    chatId,
  ]);

  const uploadFile = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/files/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (response.ok) {
        const data = await response.json();
        const { url, pathname, contentType } = data;

        return {
          url,
          name: pathname,
          contentType,
        };
      }
      const { error } = await response.json();
      toast.error(error);
    } catch (_error) {
      toast.error("Failed to upload file, please try again!");
    }
  }, []);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);

      setUploadQueue(files.map((file) => file.name));

      try {
        const uploadPromises = files.map((file) => uploadFile(file));
        const uploadedAttachments = await Promise.all(uploadPromises);
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment) => attachment !== undefined
        );

        setAttachments((currentAttachments) => [
          ...currentAttachments,
          ...successfullyUploadedAttachments,
        ]);
      } catch (_error) {
        toast.error("Failed to upload files");
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments, uploadFile]
  );

  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) {
        return;
      }

      const imageItems = Array.from(items).filter((item) =>
        item.type.startsWith("image/")
      );

      if (imageItems.length === 0) {
        return;
      }

      event.preventDefault();

      setUploadQueue((prev) => [...prev, "Pasted image"]);

      try {
        const uploadPromises = imageItems
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null)
          .map((file) => uploadFile(file));

        const uploadedAttachments = await Promise.all(uploadPromises);
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment) =>
            attachment !== undefined &&
            attachment.url !== undefined &&
            attachment.contentType !== undefined
        );

        setAttachments((curr) => [
          ...curr,
          ...(successfullyUploadedAttachments as Attachment[]),
        ]);
      } catch (_error) {
        toast.error("Failed to upload pasted image(s)");
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments, uploadFile]
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.addEventListener("paste", handlePaste);
    return () => textarea.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  return (
    <div className={cn("relative flex w-full flex-col gap-4", className)}>
      {editingMessage && onCancelEdit && (
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <span>Editing message</span>
          <button
            className="rounded px-1.5 py-0.5 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
            onMouseDown={(e) => {
              e.preventDefault();
              onCancelEdit();
            }}
            type="button"
          >
            Cancel
          </button>
        </div>
      )}

      {!editingMessage &&
        !isLoading &&
        messages.length === 0 &&
        attachments.length === 0 &&
        uploadQueue.length === 0 && (
          <SuggestedActions chatId={chatId} sendMessage={sendMessage} />
        )}

      <input
        className="pointer-events-none fixed -top-4 -left-4 size-0.5 opacity-0"
        multiple
        onChange={handleFileChange}
        ref={fileInputRef}
        tabIndex={-1}
        type="file"
      />

      <div className="relative">
        {slashOpen && (
          <SlashCommandMenu
            onClose={() => setSlashOpen(false)}
            onSelect={handleSlashSelect}
            query={slashQuery}
            selectedIndex={slashIndex}
          />
        )}
      </div>

      {modelsData && !hasConfiguredProviders && (
        <div className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-card/60 px-4 py-3 text-[13px] text-muted-foreground">
          <KeyIcon className="size-4 shrink-0" />
          <span>
            Please configure an API Key first.{" "}
            <Link
              className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
              href="/settings"
            >
              Go to Settings
            </Link>
          </span>
        </div>
      )}

      <PromptInput
        className="[&>div]:rounded-2xl [&>div]:border [&>div]:border-border/30 [&>div]:bg-card/70 [&>div]:shadow-[var(--shadow-composer)]"
        onSubmit={() => {
          if (input.startsWith("/")) {
            const query = input.slice(1).trim();
            const cmd = slashCommands.find((c) => c.name === query);
            if (cmd) {
              handleSlashSelect(cmd);
            }
            return;
          }
          if (!input.trim() && attachments.length === 0) {
            return;
          }
          if (status === "ready" || status === "error") {
            submitForm();
          } else {
            toast.error("Please wait for the model to finish its response!");
          }
        }}
      >
        {(attachments.length > 0 || uploadQueue.length > 0) && (
          <div
            className="flex w-full self-start flex-row gap-2 overflow-x-auto px-3 pt-3 no-scrollbar"
            data-testid="attachments-preview"
          >
            {attachments.map((attachment) => (
              <PreviewAttachment
                attachment={attachment}
                key={attachment.url}
                onRemove={() => {
                  setAttachments((currentAttachments) =>
                    currentAttachments.filter((a) => a.url !== attachment.url)
                  );
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
              />
            ))}

            {uploadQueue.map((filename) => (
              <PreviewAttachment
                attachment={{
                  url: "",
                  name: filename,
                  contentType: "",
                }}
                isUploading={true}
                key={filename}
              />
            ))}
          </div>
        )}
        <PromptInputTextarea
          className="min-h-24 text-[13px] leading-relaxed px-4 pt-3.5 pb-1.5 placeholder:text-muted-foreground/35"
          data-testid="multimodal-input"
          onChange={handleInput}
          onKeyDown={(e) => {
            if (slashOpen) {
              const filtered = slashCommands.filter((cmd) =>
                cmd.name.startsWith(slashQuery.toLowerCase())
              );
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSlashIndex((i) => Math.min(i + 1, filtered.length - 1));
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSlashIndex((i) => Math.max(i - 1, 0));
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                if (filtered[slashIndex]) {
                  handleSlashSelect(filtered[slashIndex]);
                }
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setSlashOpen(false);
                return;
              }
            }
            if (e.key === "Escape" && editingMessage && onCancelEdit) {
              e.preventDefault();
              onCancelEdit();
            }
          }}
          placeholder={
            editingMessage ? "Edit your message..." : "Ask anything..."
          }
          ref={textareaRef}
          value={input}
        />
        <PromptInputFooter className="px-3 pb-3">
          <PromptInputTools>
            <AttachmentsButton
              fileInputRef={fileInputRef}
              selectedModelId={modelSelection.modelId}
              status={status}
            />
            <ModelSelectorCompact
              onModelChange={onModelChange}
              selectedSelection={modelSelection}
            />
          </PromptInputTools>

          {status === "submitted" ? (
            <StopButton setMessages={setMessages} stop={stop} />
          ) : (
            <PromptInputSubmit
              className={cn(
                "h-7 w-7 rounded-xl transition-all duration-200",
                input.trim()
                  ? "bg-foreground text-background hover:opacity-85 active:scale-95"
                  : "bg-muted text-muted-foreground/25 cursor-not-allowed"
              )}
              data-testid="send-button"
              disabled={!input.trim() || uploadQueue.length > 0}
              status={status}
              variant="secondary"
            >
              <ArrowUpIcon className="size-4" />
            </PromptInputSubmit>
          )}
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}

export const MultimodalInput = memo(
  PureMultimodalInput,
  (prevProps, nextProps) => {
    if (prevProps.input !== nextProps.input) {
      return false;
    }
    if (prevProps.status !== nextProps.status) {
      return false;
    }
    if (!equal(prevProps.attachments, nextProps.attachments)) {
      return false;
    }
    if (prevProps.modelSelection !== nextProps.modelSelection) {
      return false;
    }
    if (prevProps.editingMessage !== nextProps.editingMessage) {
      return false;
    }
    if (prevProps.isLoading !== nextProps.isLoading) {
      return false;
    }
    if (prevProps.messages.length !== nextProps.messages.length) {
      return false;
    }

    return true;
  }
);

function PureAttachmentsButton({
  fileInputRef,
  status,
  selectedModelId,
}: {
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  status: UseChatHelpers<ChatMessage>["status"];
  selectedModelId: string;
}) {
  const { data: modelsResponse } = useSWR(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/models`,
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: false, dedupingInterval: 3_600_000 }
  );

  const caps: Record<string, ModelCapabilities> | undefined =
    modelsResponse?.capabilities;
  const hasVision = caps?.[selectedModelId]?.vision ?? false;

  return (
    <Button
      className={cn(
        "h-7 w-7 rounded-lg border border-border/40 p-1 transition-colors",
        hasVision
          ? "text-foreground hover:border-border hover:text-foreground"
          : "text-muted-foreground/30 cursor-not-allowed"
      )}
      data-testid="attachments-button"
      disabled={status !== "ready" || !hasVision}
      onClick={(event) => {
        event.preventDefault();
        fileInputRef.current?.click();
      }}
      variant="ghost"
    >
      <PaperclipIcon size={14} style={{ width: 14, height: 14 }} />
    </Button>
  );
}

const AttachmentsButton = memo(PureAttachmentsButton);

type SavedProvider = {
  providerId: string;
  displayName: string | null;
  providerType: string;
  baseUrl: string | null;
  models: string[];
};

type SelectableModel = {
  key: string;
  selection: ModelSelection;
  modelId: string;
  name: string;
  provider: string;
  sourceLabel: string;
  logoProvider: string;
};

function PureModelSelectorCompact({
  selectedSelection,
  onModelChange,
}: {
  selectedSelection: ModelSelection;
  onModelChange?: (selection: ModelSelection) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const { data: modelsData } = useSWR(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/models`,
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: false, dedupingInterval: 3_600_000 }
  );
  const { data: providersData } = useSWR(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/providers`,
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: true, dedupingInterval: 30_000 }
  );

  const capabilities: Record<string, ModelCapabilities> | undefined =
    modelsData?.capabilities;
  const allModels: ChatModel[] = modelsData?.models ?? [];
  const providers: SavedProvider[] = providersData ?? [];
  const { availableModels, unavailableModels } = useMemo(() => {
    const gatewayConfigured = providers.some(
      (provider) => provider.providerId === GATEWAY_PROVIDER_ID
    );
    const directProviderIds = new Set(
      providers
        .filter((provider) =>
          DIRECT_PROVIDER_IDS.includes(
            provider.providerId as (typeof DIRECT_PROVIDER_IDS)[number]
          )
        )
        .map((provider) => provider.providerId)
    );
    const customProviders = providers.filter(
      (provider) => provider.providerType === "openai-compatible"
    );
    const modelNameById = new Map(
      allModels.map((model) => [model.id, model.name])
    );

    const directModels: SelectableModel[] = allModels
      .filter((model) => directProviderIds.has(model.provider))
      .map((model) => ({
        key: `direct:${model.provider}:${model.id}`,
        selection: {
          source: "direct",
          providerId: model.provider,
          modelId: model.id,
        },
        modelId: model.id,
        name: model.name,
        provider: model.provider,
        sourceLabel: "Direct",
        logoProvider: model.id.split("/")[0],
      }));

    const gatewayModels: SelectableModel[] = gatewayConfigured
      ? allModels.map((model) => ({
          key: `gateway:${model.id}`,
          selection: {
            source: "gateway",
            modelId: model.id,
          },
          modelId: model.id,
          name: model.name,
          provider: model.provider,
          sourceLabel: "Gateway",
          logoProvider: model.id.split("/")[0],
        }))
      : [];

    const customModels: SelectableModel[] = customProviders.flatMap(
      (provider) =>
        (provider.models ?? []).map((modelId) => {
          const [prefix] = modelId.split("/");
          const inferredProvider =
            prefix && prefix !== modelId ? prefix : provider.providerId;
          return {
            key: `custom:${provider.providerId}:${modelId}`,
            selection: {
              source: "custom" as const,
              providerId: provider.providerId,
              modelId,
            },
            modelId,
            name:
              modelNameById.get(modelId) ?? modelId.split("/").pop() ?? modelId,
            provider: inferredProvider,
            sourceLabel: provider.displayName ?? "Custom",
            logoProvider: inferredProvider,
          };
        })
    );

    const available = [...directModels, ...gatewayModels, ...customModels];
    const unavailable: SelectableModel[] = allModels
      .filter(
        (model) =>
          !directProviderIds.has(model.provider) &&
          !gatewayConfigured &&
          !customModels.some((customModel) => customModel.modelId === model.id)
      )
      .map((model) => ({
        key: `unavailable:${model.id}`,
        selection: {
          source: "direct",
          providerId: model.provider,
          modelId: model.id,
        },
        modelId: model.id,
        name: model.name,
        provider: model.provider,
        sourceLabel: "Locked",
        logoProvider: model.id.split("/")[0],
      }));

    return { availableModels: available, unavailableModels: unavailable };
  }, [allModels, providers]);

  const selectedModel =
    availableModels.find(
      (model) => model.key === getModelSelectionKey(selectedSelection)
    ) ??
    availableModels.find(
      (model) => model.modelId === selectedSelection.modelId
    ) ??
    availableModels.find((model) => model.modelId === DEFAULT_CHAT_MODEL) ??
    availableModels[0];

  const displayName =
    selectedModel?.name ?? selectedSelection.modelId.split("/").pop();
  const provider =
    selectedModel?.logoProvider ?? selectedSelection.modelId.split("/")[0];

  useEffect(() => {
    if (availableModels.length === 0) {
      return;
    }
    if (
      availableModels.some(
        (model) => model.key === getModelSelectionKey(selectedSelection)
      )
    ) {
      return;
    }
    onModelChange?.(
      availableModels.find((model) => model.modelId === DEFAULT_CHAT_MODEL)
        ?.selection ?? availableModels[0].selection
    );
  }, [availableModels, selectedSelection, onModelChange]);

  const groupByProvider = (models: SelectableModel[]) => {
    const grouped: Record<string, SelectableModel[]> = {};
    for (const model of models) {
      if (!grouped[model.provider]) {
        grouped[model.provider] = [];
      }
      grouped[model.provider].push(model);
    }
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  };

  const renderModelItem = (model: SelectableModel, available: boolean) => {
    return (
      <ModelSelectorItem
        className={cn(
          "flex w-full",
          model.key === selectedModel?.key &&
            "border-b border-dashed border-foreground/50",
          !available && "opacity-40 cursor-default"
        )}
        key={model.key}
        onSelect={() => {
          if (!available) {
            toast(
              `Please configure ${KNOWN_PROVIDERS[model.provider]?.name ?? model.provider} API Key in Settings first`
            );
            return;
          }
          onModelChange?.(model.selection);
          setCookie("chat-model-selection", JSON.stringify(model.selection));
          setOpen(false);
          setTimeout(() => {
            document
              .querySelector<HTMLTextAreaElement>(
                "[data-testid='multimodal-input']"
              )
              ?.focus();
          }, 50);
        }}
        value={model.key}
      >
        <ModelSelectorLogo provider={model.logoProvider} />
        <ModelSelectorName>{model.name}</ModelSelectorName>
        <div className="ml-auto flex items-center gap-2 text-foreground/70">
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {model.sourceLabel}
          </span>
          {capabilities?.[model.modelId]?.tools && (
            <WrenchIcon className="size-3.5" />
          )}
          {capabilities?.[model.modelId]?.vision && (
            <EyeIcon className="size-3.5" />
          )}
          {capabilities?.[model.modelId]?.reasoning && (
            <BrainIcon className="size-3.5" />
          )}
          {!available && (
            <LockIcon className="size-3 text-muted-foreground/50" />
          )}
        </div>
      </ModelSelectorItem>
    );
  };

  return (
    <ModelSelector onOpenChange={setOpen} open={open}>
      <ModelSelectorTrigger asChild>
        <Button
          className="h-7 max-w-[200px] justify-between gap-1.5 rounded-lg px-2 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          data-testid="model-selector"
          variant="ghost"
        >
          {provider && <ModelSelectorLogo provider={provider} />}
          <ModelSelectorName>{displayName}</ModelSelectorName>
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent>
        <ModelSelectorInput placeholder="Search models..." />
        <ModelSelectorList>
          {availableModels.length > 0 ? (
            groupByProvider(availableModels).map(([prov, models]) => (
              <ModelSelectorGroup
                heading={KNOWN_PROVIDERS[prov]?.name ?? prov}
                key={prov}
              >
                {models.map((m) => renderModelItem(m, true))}
              </ModelSelectorGroup>
            ))
          ) : (
            <ModelSelectorGroup heading="No providers configured">
              <div className="px-3 py-2 text-[12px] text-muted-foreground">
                Go to Settings to add an API key
              </div>
            </ModelSelectorGroup>
          )}

          {unavailableModels.length > 0 && (
            <ModelSelectorGroup
              heading={
                <button
                  className="flex w-full items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-muted-foreground"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowMore(!showMore);
                  }}
                  type="button"
                >
                  {showMore ? "Hide" : "Show"} more models (
                  {unavailableModels.length})
                </button>
              }
            >
              {showMore &&
                groupByProvider(unavailableModels).map(([prov, models]) => (
                  <ModelSelectorGroup
                    heading={KNOWN_PROVIDERS[prov]?.name ?? prov}
                    key={`more-${prov}`}
                  >
                    {models.map((m) => renderModelItem(m, false))}
                  </ModelSelectorGroup>
                ))}
            </ModelSelectorGroup>
          )}
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  );
}

const ModelSelectorCompact = memo(PureModelSelectorCompact);

function getModelSelectionKey(selection: ModelSelection) {
  if (selection.source === "gateway") {
    return `gateway:${selection.modelId}`;
  }
  return `${selection.source}:${selection.providerId}:${selection.modelId}`;
}

function PureStopButton({
  stop,
  setMessages,
}: {
  stop: () => void;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
}) {
  return (
    <Button
      className="h-7 w-7 rounded-xl bg-foreground p-1 text-background transition-all duration-200 hover:opacity-85 active:scale-95 disabled:bg-muted disabled:text-muted-foreground/25 disabled:cursor-not-allowed"
      data-testid="stop-button"
      onClick={(event) => {
        event.preventDefault();
        stop();
        setMessages((messages) => messages);
      }}
    >
      <StopIcon size={14} />
    </Button>
  );
}

const StopButton = memo(PureStopButton);
