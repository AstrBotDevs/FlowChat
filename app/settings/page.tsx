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
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DIRECT_PROVIDER_IDS,
  GATEWAY_PROVIDER_ID,
  KNOWN_PROVIDERS,
  type ProviderType,
} from "@/lib/ai/provider-registry";

type SavedProvider = {
  id: string;
  providerId: string;
  displayName: string | null;
  providerType: ProviderType;
  baseUrl: string | null;
  models: string[];
  apiKeyMasked: string;
};

type EditingProvider =
  | {
      mode: "official";
      providerId: string;
      providerType: ProviderType;
      apiKey: string;
    }
  | {
      mode: "custom";
      providerId?: string;
      displayName: string;
      baseUrl: string;
      apiKey: string;
      manualModels: string;
    };

type SettingsTab = "model" | "account";

const OFFICIAL_PROVIDER_IDS = [...DIRECT_PROVIDER_IDS, GATEWAY_PROVIDER_ID];

function splitModels(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((model) => model.trim())
    .filter(Boolean);
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

  const savedProviderIds = useMemo(
    () => new Set(savedProviders.map((provider) => provider.providerId)),
    [savedProviders]
  );
  const customProviders = savedProviders.filter(
    (provider) => provider.providerType === "openai-compatible"
  );

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
      const body =
        editingProvider.mode === "custom"
          ? {
              providerId: editingProvider.providerId,
              displayName: editingProvider.displayName,
              apiKey: editingProvider.apiKey,
              baseUrl: editingProvider.baseUrl,
              providerType: "openai-compatible",
              manualModels: splitModels(editingProvider.manualModels),
            }
          : {
              providerId: editingProvider.providerId,
              apiKey: editingProvider.apiKey,
              providerType: editingProvider.providerType,
            };

      const res = await fetch(`${basePath}/api/providers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        const name =
          editingProvider.mode === "custom"
            ? editingProvider.displayName
            : KNOWN_PROVIDERS[editingProvider.providerId]?.name;
        toast.success(`${name ?? "Provider"} saved`);
        if (data?.warning) {
          toast.warning(`Saved, but model discovery failed: ${data.warning}`);
        }
        setEditingProvider(null);
        await fetchProviders();
      } else {
        toast.error(data?.message ?? "Failed to save provider");
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

  const startOfficialEditing = (providerId: string) => {
    const providerType =
      providerId === GATEWAY_PROVIDER_ID
        ? "gateway"
        : (providerId as ProviderType);
    setEditingProvider({
      mode: "official",
      providerId,
      providerType,
      apiKey: "",
    });
  };

  const startCustomEditing = (provider?: SavedProvider) => {
    setEditingProvider({
      mode: "custom",
      providerId: provider?.providerId,
      displayName: provider?.displayName ?? "",
      baseUrl: provider?.baseUrl ?? "",
      apiKey: "",
      manualModels: provider?.models?.join("\n") ?? "",
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
            <section className="space-y-5" role="tabpanel">
              <div>
                <h2 className="text-[14px] font-medium">Provider Settings</h2>
                <p className="text-[12px] text-muted-foreground">
                  Configure direct AI SDK providers, AI Gateway, and custom
                  OpenAI-compatible endpoints.
                </p>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="text-[12px] font-medium text-muted-foreground">
                      Official providers
                    </div>
                    {OFFICIAL_PROVIDER_IDS.map((providerId) => {
                      const known = KNOWN_PROVIDERS[providerId];
                      const saved = savedProviders.find(
                        (provider) => provider.providerId === providerId
                      );
                      const isConfigured = savedProviderIds.has(providerId);
                      const isEditing =
                        editingProvider?.mode === "official" &&
                        editingProvider.providerId === providerId;

                      return (
                        <div
                          className="rounded-lg border border-border/50 bg-card/50"
                          key={providerId}
                        >
                          <div className="flex items-center justify-between gap-3 px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex size-8 items-center justify-center rounded-md bg-muted text-xs font-bold uppercase text-muted-foreground">
                                {known?.name?.charAt(0) ?? providerId.charAt(0)}
                              </div>
                              <div>
                                <div className="flex items-center gap-2 text-[13px] font-medium">
                                  {known?.name ?? providerId}
                                  {providerId === GATEWAY_PROVIDER_ID && (
                                    <Badge
                                      className="h-4 px-1.5 text-[10px]"
                                      variant="outline"
                                    >
                                      Gateway
                                    </Badge>
                                  )}
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
                                    : startOfficialEditing(providerId)
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

                          {isEditing && editingProvider.mode === "official" && (
                            <div className="space-y-3 border-t border-border/30 px-4 py-3">
                              <div className="space-y-1.5">
                                <Label className="text-[12px]">API Key</Label>
                                <Input
                                  className="h-8 font-mono text-[12px]"
                                  onChange={(event) =>
                                    setEditingProvider({
                                      ...editingProvider,
                                      apiKey: event.target.value,
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
                              <div className="flex justify-end">
                                <Button
                                  className="h-8 px-4 text-[12px]"
                                  disabled={saving || !editingProvider.apiKey}
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

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-[12px] font-medium text-muted-foreground">
                        Custom OpenAI-compatible
                      </div>
                      <Button
                        className="h-7 px-2 text-[11px]"
                        onClick={() =>
                          editingProvider?.mode === "custom" &&
                          !editingProvider.providerId
                            ? setEditingProvider(null)
                            : startCustomEditing()
                        }
                        variant="outline"
                      >
                        <PlusIcon className="mr-1 size-3" />
                        Add custom
                      </Button>
                    </div>

                    {customProviders.map((provider) => {
                      const isEditing =
                        editingProvider?.mode === "custom" &&
                        editingProvider.providerId === provider.providerId;

                      return (
                        <div
                          className="rounded-lg border border-border/50 bg-card/50"
                          key={provider.providerId}
                        >
                          <div className="flex items-center justify-between gap-3 px-4 py-3">
                            <div>
                              <div className="text-[13px] font-medium">
                                {provider.displayName ?? provider.providerId}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                                <span className="font-mono">
                                  {provider.apiKeyMasked}
                                </span>
                                <span>{provider.models.length} models</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Button
                                className="h-7 px-2 text-[11px]"
                                disabled={testing === provider.providerId}
                                onClick={() =>
                                  handleTestConnection(provider.providerId)
                                }
                                variant="ghost"
                              >
                                {testing === provider.providerId ? (
                                  <Loader2Icon className="mr-1 size-3 animate-spin" />
                                ) : null}
                                Test
                              </Button>
                              <Button
                                className="size-7 p-0 text-muted-foreground hover:text-destructive"
                                onClick={() =>
                                  handleDelete(provider.providerId)
                                }
                                variant="ghost"
                              >
                                <TrashIcon className="size-3.5" />
                              </Button>
                              <Button
                                className="h-7 px-2 text-[11px]"
                                onClick={() =>
                                  isEditing
                                    ? setEditingProvider(null)
                                    : startCustomEditing(provider)
                                }
                                variant={isEditing ? "secondary" : "outline"}
                              >
                                {isEditing ? "Cancel" : "Edit"}
                              </Button>
                            </div>
                          </div>

                          {isEditing && editingProvider.mode === "custom" && (
                            <CustomEditor
                              editingProvider={editingProvider}
                              isConfigured
                              onSave={handleSave}
                              saving={saving}
                              setEditingProvider={setEditingProvider}
                            />
                          )}
                        </div>
                      );
                    })}

                    {editingProvider?.mode === "custom" &&
                      !editingProvider.providerId && (
                        <div className="rounded-lg border border-border/50 bg-card/50">
                          <CustomEditor
                            editingProvider={editingProvider}
                            onSave={handleSave}
                            saving={saving}
                            setEditingProvider={setEditingProvider}
                          />
                        </div>
                      )}
                  </div>
                </>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function CustomEditor({
  editingProvider,
  isConfigured = false,
  saving,
  setEditingProvider,
  onSave,
}: {
  editingProvider: Extract<EditingProvider, { mode: "custom" }>;
  isConfigured?: boolean;
  saving: boolean;
  setEditingProvider: (provider: EditingProvider) => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-3 border-t border-border/30 px-4 py-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-[12px]">Name</Label>
          <Input
            className="h-8 text-[12px]"
            onChange={(event) =>
              setEditingProvider({
                ...editingProvider,
                displayName: event.target.value,
              })
            }
            placeholder="My router"
            value={editingProvider.displayName}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[12px]">API Key</Label>
          <Input
            className="h-8 font-mono text-[12px]"
            onChange={(event) =>
              setEditingProvider({
                ...editingProvider,
                apiKey: event.target.value,
              })
            }
            placeholder={isConfigured ? "Enter new key to update..." : "sk-..."}
            type="password"
            value={editingProvider.apiKey}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-[12px]">Base URL</Label>
        <Input
          className="h-8 font-mono text-[12px]"
          onChange={(event) =>
            setEditingProvider({
              ...editingProvider,
              baseUrl: event.target.value,
            })
          }
          placeholder="https://api.example.com/v1"
          value={editingProvider.baseUrl}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[12px]">Model IDs</Label>
        <Textarea
          className="min-h-24 font-mono text-[12px]"
          onChange={(event) =>
            setEditingProvider({
              ...editingProvider,
              manualModels: event.target.value,
            })
          }
          placeholder={"model-a\nprovider/model-b"}
          value={editingProvider.manualModels}
        />
      </div>
      <div className="flex justify-end">
        <Button
          className="h-8 px-4 text-[12px]"
          disabled={
            saving ||
            !editingProvider.displayName ||
            !editingProvider.baseUrl ||
            !editingProvider.apiKey
          }
          onClick={onSave}
        >
          {saving ? <Loader2Icon className="mr-1 size-3 animate-spin" /> : null}
          {isConfigured ? "Update" : "Save"}
        </Button>
      </div>
    </div>
  );
}
