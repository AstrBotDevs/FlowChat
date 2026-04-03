"use client";

import {
  CheckCircleIcon,
  ChevronLeftIcon,
  Loader2Icon,
  PlusIcon,
  TrashIcon,
  XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  KNOWN_PROVIDERS,
  type ProviderType,
} from "@/lib/ai/provider-registry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SavedProvider = {
  id: string;
  providerId: string;
  providerType: string;
  baseUrl: string | null;
  apiKeyMasked: string;
};

type EditingProvider = {
  providerId: string;
  apiKey: string;
  baseUrl: string;
  providerType: ProviderType;
};

const PROVIDER_ORDER = [
  "openai",
  "anthropic",
  "google",
  "deepseek",
  "mistral",
  "xai",
  "moonshotai",
  "alibaba",
  "minimax",
  "cohere",
  "perplexity",
  "nvidia",
  "meta",
];

function getOrderedProviderIds(): string[] {
  const allIds = Object.keys(KNOWN_PROVIDERS);
  const ordered = PROVIDER_ORDER.filter((id) => allIds.includes(id));
  const remaining = allIds.filter((id) => !PROVIDER_ORDER.includes(id)).sort();
  return [...ordered, ...remaining];
}

export default function SettingsPage() {
  const [savedProviders, setSavedProviders] = useState<SavedProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProvider, setEditingProvider] = useState<EditingProvider | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch(`${basePath}/api/providers`);
      if (res.ok) {
        const data = await res.json();
        setSavedProviders(data);
      }
    } catch {
      toast.error("Failed to load provider settings");
    } finally {
      setLoading(false);
    }
  }, [basePath]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const handleSave = async () => {
    if (!editingProvider) return;

    setSaving(true);
    try {
      const res = await fetch(`${basePath}/api/providers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: editingProvider.providerId,
          apiKey: editingProvider.apiKey,
          baseUrl: editingProvider.baseUrl || null,
          providerType: editingProvider.providerType,
        }),
      });

      if (res.ok) {
        toast.success(
          `${KNOWN_PROVIDERS[editingProvider.providerId]?.name ?? editingProvider.providerId} saved`
        );
        setEditingProvider(null);
        await fetchProviders();
      } else {
        toast.error("Failed to save provider");
      }
    } catch {
      toast.error("Failed to save provider");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (providerId: string) => {
    try {
      const res = await fetch(`${basePath}/api/providers`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId }),
      });

      if (res.ok) {
        toast.success("Provider removed");
        await fetchProviders();
      }
    } catch {
      toast.error("Failed to delete provider");
    }
  };

  const handleTestConnection = async (providerId: string) => {
    setTesting(providerId);
    try {
      const res = await fetch(`${basePath}/api/providers/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Connection successful");
      } else {
        toast.error(data.error || "Connection test failed");
      }
    } catch {
      toast.error("Connection test failed");
    } finally {
      setTesting(null);
    }
  };

  const savedProviderIds = new Set(savedProviders.map((p) => p.providerId));
  const orderedIds = getOrderedProviderIds();

  const startEditing = (providerId: string) => {
    const existing = savedProviders.find((p) => p.providerId === providerId);
    const known = KNOWN_PROVIDERS[providerId];
    setEditingProvider({
      providerId,
      apiKey: "",
      baseUrl: existing?.baseUrl ?? known?.defaultBaseUrl ?? "",
      providerType:
        (existing?.providerType as ProviderType) ??
        known?.type ??
        "openai-compatible",
    });
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <Link href="/">
          <Button className="size-8 p-0" variant="ghost">
            <ChevronLeftIcon className="size-4" />
          </Button>
        </Link>
        <h1 className="text-[15px] font-medium">Provider Settings</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <p className="text-[13px] text-muted-foreground">
            Configure your AI provider API keys. Your keys are stored securely
            and used to connect directly to the provider&apos;s API.
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2">
              {orderedIds.map((providerId) => {
                const known = KNOWN_PROVIDERS[providerId];
                const saved = savedProviders.find(
                  (p) => p.providerId === providerId
                );
                const isConfigured = savedProviderIds.has(providerId);
                const isEditing =
                  editingProvider?.providerId === providerId;

                return (
                  <div
                    className="rounded-lg border border-border/50 bg-card/50 transition-colors"
                    key={providerId}
                  >
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 items-center justify-center rounded-md bg-muted text-xs font-bold uppercase text-muted-foreground">
                          {known?.name?.charAt(0) ?? providerId.charAt(0)}
                        </div>
                        <div>
                          <div className="text-[13px] font-medium">
                            {known?.name ?? providerId}
                          </div>
                          {isConfigured && saved && (
                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <CheckCircleIcon className="size-3 text-emerald-500" />
                              <span className="font-mono">
                                {saved.apiKeyMasked}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {isConfigured && (
                          <>
                            <Button
                              className="h-7 px-2 text-[11px]"
                              disabled={testing === providerId}
                              onClick={() => handleTestConnection(providerId)}
                              variant="ghost"
                            >
                              {testing === providerId ? (
                                <Loader2Icon className="mr-1 size-3 animate-spin" />
                              ) : null}
                              Test
                            </Button>
                            <Button
                              className="size-7 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDelete(providerId)}
                              variant="ghost"
                            >
                              <TrashIcon className="size-3.5" />
                            </Button>
                          </>
                        )}
                        <Button
                          className="h-7 px-2 text-[11px]"
                          onClick={() =>
                            isEditing
                              ? setEditingProvider(null)
                              : startEditing(providerId)
                          }
                          variant={isEditing ? "secondary" : "outline"}
                        >
                          {isEditing ? (
                            <>
                              <XCircleIcon className="mr-1 size-3" />
                              Cancel
                            </>
                          ) : isConfigured ? (
                            "Edit"
                          ) : (
                            <>
                              <PlusIcon className="mr-1 size-3" />
                              Configure
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    {isEditing && editingProvider && (
                      <div className="space-y-3 border-t border-border/30 px-4 py-3">
                        <div className="space-y-1.5">
                          <Label className="text-[12px]">API Key</Label>
                          <Input
                            className="h-8 font-mono text-[12px]"
                            onChange={(e) =>
                              setEditingProvider({
                                ...editingProvider,
                                apiKey: e.target.value,
                              })
                            }
                            placeholder={
                              isConfigured
                                ? "Enter new key to update..."
                                : "sk-..."
                            }
                            type="password"
                            value={editingProvider.apiKey}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-[12px]">Protocol Type</Label>
                          <Select
                            onValueChange={(val: ProviderType) =>
                              setEditingProvider({
                                ...editingProvider,
                                providerType: val,
                              })
                            }
                            value={editingProvider.providerType}
                          >
                            <SelectTrigger className="h-8 text-[12px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="openai-compatible">
                                OpenAI Compatible
                              </SelectItem>
                              <SelectItem value="anthropic">
                                Anthropic Native
                              </SelectItem>
                              <SelectItem value="google">
                                Google Native
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-[12px]">
                            Base URL{" "}
                            <span className="text-muted-foreground">
                              (optional — leave empty for official endpoint)
                            </span>
                          </Label>
                          <Input
                            className="h-8 font-mono text-[12px]"
                            onChange={(e) =>
                              setEditingProvider({
                                ...editingProvider,
                                baseUrl: e.target.value,
                              })
                            }
                            placeholder={
                              known?.defaultBaseUrl ?? "https://..."
                            }
                            value={editingProvider.baseUrl}
                          />
                        </div>

                        <div className="flex justify-end pt-1">
                          <Button
                            className="h-8 px-4 text-[12px]"
                            disabled={
                              saving ||
                              (!isConfigured && !editingProvider.apiKey)
                            }
                            onClick={handleSave}
                          >
                            {saving ? (
                              <Loader2Icon className="mr-1 size-3 animate-spin" />
                            ) : null}
                            {isConfigured ? "Update" : "Save"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
