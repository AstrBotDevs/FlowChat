"use client";

import {
  CheckCircleIcon,
  ChevronLeftIcon,
  DownloadIcon,
  Loader2Icon,
  PlusIcon,
  SaveIcon,
  TrashIcon,
  XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
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
import { KNOWN_PROVIDERS, type ProviderType } from "@/lib/ai/provider-registry";

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

type SettingsTab = "model" | "account";

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
  const { data: session, status: sessionStatus } = useSession();
  const [activeTab, setActiveTab] = useState<SettingsTab>("model");
  const [savedProviders, setSavedProviders] = useState<SavedProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProvider, setEditingProvider] =
    useState<EditingProvider | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const isGuest = session?.user?.type === "guest";
  const isSessionLoading = sessionStatus === "loading";

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
    if (!editingProvider) {
      return;
    }

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

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setChangingPassword(true);
    try {
      const res = await fetch(`${basePath}/api/account`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (res.ok) {
        toast.success("Password updated");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        toast.error("Failed to update password");
      }
    } catch {
      toast.error("Failed to update password");
    } finally {
      setChangingPassword(false);
    }
  };

  const handleExportData = () => {
    window.location.href = `${basePath}/api/account`;
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== "DELETE") {
      toast.error("Type DELETE to confirm");
      return;
    }

    setDeletingAccount(true);
    try {
      const res = await fetch(`${basePath}/api/account`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: deletePassword }),
      });

      if (res.ok) {
        toast.success("Account deleted");
        await signOut({ redirectTo: "/" });
      } else {
        toast.error("Failed to delete account");
      }
    } catch {
      toast.error("Failed to delete account");
    } finally {
      setDeletingAccount(false);
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
        <h1 className="text-[15px] font-medium">Settings</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <div
            aria-label="Settings sections"
            className="inline-flex rounded-lg border border-border bg-muted/40 p-1"
            role="tablist"
          >
            <Button
              aria-selected={activeTab === "model"}
              className="h-8 px-3 text-[12px]"
              onClick={() => setActiveTab("model")}
              role="tab"
              type="button"
              variant={activeTab === "model" ? "secondary" : "ghost"}
            >
              Model Settings
            </Button>
            <Button
              aria-selected={activeTab === "account"}
              className="h-8 px-3 text-[12px]"
              onClick={() => setActiveTab("account")}
              role="tab"
              type="button"
              variant={activeTab === "account" ? "secondary" : "ghost"}
            >
              Account Settings
            </Button>
          </div>

          {activeTab === "account" ? (
            <section className="space-y-3" role="tabpanel">
              <div>
                <h2 className="text-[14px] font-medium">Account</h2>
                <p className="text-[12px] text-muted-foreground">
                  Manage your password and account data.
                </p>
              </div>

              {isSessionLoading ? (
                <div className="flex items-center justify-center rounded-lg border border-border/50 bg-card/50 py-8">
                  <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
                </div>
              ) : isGuest || !session?.user ? (
                <div className="rounded-lg border border-border/50 bg-card/50 p-4">
                  <div className="text-[13px] text-muted-foreground">
                    Sign in or create an account to manage account settings.
                  </div>
                  <Link href="/login">
                    <Button className="mt-3 h-8 px-3 text-[12px]">
                      Sign in
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg border border-border/50 bg-card/50 p-4">
                    <div className="mb-3 text-[13px] font-medium">
                      Change password
                    </div>
                    <div className="grid gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-[12px]">Current password</Label>
                        <Input
                          className="h-8 text-[12px]"
                          onChange={(event) =>
                            setCurrentPassword(event.target.value)
                          }
                          type="password"
                          value={currentPassword}
                        />
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-[12px]">New password</Label>
                          <Input
                            className="h-8 text-[12px]"
                            onChange={(event) =>
                              setNewPassword(event.target.value)
                            }
                            type="password"
                            value={newPassword}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[12px]">
                            Confirm new password
                          </Label>
                          <Input
                            className="h-8 text-[12px]"
                            onChange={(event) =>
                              setConfirmPassword(event.target.value)
                            }
                            type="password"
                            value={confirmPassword}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <Button
                          className="h-8 px-3 text-[12px]"
                          disabled={
                            changingPassword ||
                            !currentPassword ||
                            !newPassword ||
                            !confirmPassword
                          }
                          onClick={handleChangePassword}
                        >
                          {changingPassword ? (
                            <Loader2Icon className="mr-1 size-3 animate-spin" />
                          ) : (
                            <SaveIcon className="mr-1 size-3" />
                          )}
                          Update password
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/50 bg-card/50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[13px] font-medium">
                          Export account data
                        </div>
                        <div className="text-[12px] text-muted-foreground">
                          Download chats, documents, threads, and saved provider
                          metadata.
                        </div>
                      </div>
                      <Button
                        className="h-8 px-3 text-[12px]"
                        onClick={handleExportData}
                        variant="outline"
                      >
                        <DownloadIcon className="mr-1 size-3" />
                        Export
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                    <div className="mb-3">
                      <div className="text-[13px] font-medium text-destructive">
                        Delete account
                      </div>
                      <div className="text-[12px] text-muted-foreground">
                        Permanently delete your account, chats, documents, and
                        provider settings.
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-[12px]">Current password</Label>
                        <Input
                          className="h-8 text-[12px]"
                          onChange={(event) =>
                            setDeletePassword(event.target.value)
                          }
                          type="password"
                          value={deletePassword}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[12px]">Type DELETE</Label>
                        <Input
                          className="h-8 text-[12px]"
                          onChange={(event) =>
                            setDeleteConfirmation(event.target.value)
                          }
                          value={deleteConfirmation}
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Button
                        className="h-8 px-3 text-[12px]"
                        disabled={
                          deletingAccount ||
                          !deletePassword ||
                          deleteConfirmation !== "DELETE"
                        }
                        onClick={handleDeleteAccount}
                        variant="destructive"
                      >
                        {deletingAccount ? (
                          <Loader2Icon className="mr-1 size-3 animate-spin" />
                        ) : (
                          <TrashIcon className="mr-1 size-3" />
                        )}
                        Delete account
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          ) : (
            <section className="space-y-3" role="tabpanel">
              <div>
                <h2 className="text-[14px] font-medium">Provider Settings</h2>
                <p className="text-[12px] text-muted-foreground">
                  Configure your AI provider API keys. Your keys are stored
                  securely and used to connect directly to the provider&apos;s
                  API.
                </p>
              </div>

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
                                  onClick={() =>
                                    handleTestConnection(providerId)
                                  }
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
                              <Label className="text-[12px]">
                                Protocol Type
                              </Label>
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
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
