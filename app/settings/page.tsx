"use client";

import {
  CheckCircleIcon,
  ChevronLeftIcon,
  DownloadIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  SaveIcon,
  TrashIcon,
  XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { ModelSelectorLogo } from "@/components/ai-elements/model-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  discoveredModels: string[];
  apiKeyMasked: string;
};

type EditingProvider =
  | {
      mode: "official";
      providerId: string;
      providerType: ProviderType;
      apiKey: string;
      enabledModels: string[];
    }
  | {
      mode: "custom";
      providerId?: string;
      displayName: string;
      baseUrl: string;
      apiKey: string;
      discoveredModels: string[];
      enabledModels: string[];
    };

type SettingsTab = "model" | "account";

const OFFICIAL_PROVIDER_IDS = [...DIRECT_PROVIDER_IDS, GATEWAY_PROVIDER_ID];

function joinModelList(models: string[]): string[] {
  return Array.from(
    new Set(models.map((model) => model.trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
}

function toggleModel(models: string[], modelId: string): string[] {
  return models.includes(modelId)
    ? models.filter((model) => model !== modelId)
    : joinModelList([...models, modelId]);
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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
  const [refreshingModels, setRefreshingModels] = useState<string | null>(null);
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
              ...(editingProvider.apiKey
                ? { apiKey: editingProvider.apiKey }
                : {}),
              baseUrl: editingProvider.baseUrl,
              enabledModels: editingProvider.enabledModels,
              providerType: "openai-compatible",
            }
          : {
              providerId: editingProvider.providerId,
              ...(editingProvider.apiKey
                ? { apiKey: editingProvider.apiKey }
                : {}),
              enabledModels: editingProvider.enabledModels,
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

  const handleTestModel = async (providerId: string, modelId: string) => {
    const key = `model:${providerId}:${modelId}`;
    setTesting(key);
    try {
      const res = await fetch(`${basePath}/api/providers/test-model`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId, modelId }),
      });
      const data = await res.json().catch(() => null);
      if (data?.success) {
        toast.success(`${modelId} is available`);
      } else {
        toast.error(data?.error || "Model test failed");
      }
    } catch {
      toast.error("Model test failed");
    } finally {
      setTesting(null);
    }
  };

  const handleRefreshModels = async (providerId: string) => {
    setRefreshingModels(providerId);
    try {
      const res = await fetch(`${basePath}/api/providers/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId }),
      });
      const data = await res.json().catch(() => null);

      if (res.ok) {
        await fetchProviders();
        const count = Array.isArray(data?.discoveredModels)
          ? data.discoveredModels.length
          : 0;
        if (data?.warning) {
          toast.warning(`Model discovery failed: ${data.warning}`);
        } else {
          toast.success(`Found ${count} models`);
        }
      } else {
        toast.error(data?.message ?? "Failed to fetch models");
      }
    } catch {
      toast.error("Failed to fetch models");
    } finally {
      setRefreshingModels(null);
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
    const saved = savedProviders.find(
      (provider) => provider.providerId === providerId
    );
    setEditingProvider({
      mode: "official",
      providerId,
      providerType,
      apiKey: "",
      enabledModels: saved?.models ?? [],
    });
  };

  const startCustomEditing = (provider?: SavedProvider) => {
    setEditingProvider({
      mode: "custom",
      providerId: provider?.providerId,
      displayName: provider?.displayName ?? "",
      baseUrl: provider?.baseUrl ?? "",
      apiKey: "",
      discoveredModels: provider?.discoveredModels ?? [],
      enabledModels: provider?.models ?? [],
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
                                <ModelSelectorLogo provider={providerId} />
                              </div>
                              <div>
                                <div className="flex items-center gap-2 text-[13px] font-medium">
                                  {known?.name ?? providerId}
                                  {isConfigured && (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                                      <CheckCircleIcon className="size-3" />
                                      Configured
                                    </span>
                                  )}
                                </div>
                                {isConfigured && saved && (
                                  <div className="text-[11px] text-muted-foreground">
                                    {providerId === GATEWAY_PROVIDER_ID
                                      ? "Gateway models enabled"
                                      : `${saved.models.length} enabled / ${saved.discoveredModels.length} discovered`}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {isConfigured && (
                                <>
                                  {providerId !== GATEWAY_PROVIDER_ID && (
                                    <Button
                                      className="h-7 px-2 text-[11px]"
                                      disabled={
                                        refreshingModels === providerId
                                      }
                                      onClick={() =>
                                        handleRefreshModels(providerId)
                                      }
                                      variant="ghost"
                                    >
                                      {refreshingModels === providerId ? (
                                        <Loader2Icon className="mr-1 size-3 animate-spin" />
                                      ) : (
                                        <RefreshCwIcon className="mr-1 size-3" />
                                      )}
                                      Refresh models
                                    </Button>
                                  )}
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
                              {providerId !== GATEWAY_PROVIDER_ID && (
                                <ModelCheckList
                                  enabledModels={editingProvider.enabledModels}
                                  models={saved?.discoveredModels ?? []}
                                  onAddManual={(modelId) =>
                                    setEditingProvider({
                                      ...editingProvider,
                                      enabledModels: joinModelList([
                                        ...editingProvider.enabledModels,
                                        modelId,
                                      ]),
                                    })
                                  }
                                  onTest={(modelId) =>
                                    handleTestModel(providerId, modelId)
                                  }
                                  onToggle={(modelId) =>
                                    setEditingProvider({
                                      ...editingProvider,
                                      enabledModels: toggleModel(
                                        editingProvider.enabledModels,
                                        modelId
                                      ),
                                    })
                                  }
                                  testingModel={testing}
                                  title="Discovered models"
                                />
                              )}
                              <div className="flex justify-end">
                                <Button
                                  className="h-8 px-4 text-[12px]"
                                  disabled={
                                    saving ||
                                    (!isConfigured &&
                                      !editingProvider.apiKey)
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
                              <div className="flex items-center gap-2 text-[13px] font-medium">
                                {provider.displayName ?? provider.providerId}
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                                  <CheckCircleIcon className="size-3" />
                                  Configured
                                </span>
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {provider.models.length} enabled /{" "}
                                {provider.discoveredModels.length} discovered
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
                                className="h-7 px-2 text-[11px]"
                                disabled={
                                  refreshingModels === provider.providerId
                                }
                                onClick={() =>
                                  handleRefreshModels(provider.providerId)
                                }
                                variant="ghost"
                              >
                                {refreshingModels === provider.providerId ? (
                                  <Loader2Icon className="mr-1 size-3 animate-spin" />
                                ) : (
                                  <RefreshCwIcon className="mr-1 size-3" />
                                )}
                                Refresh candidates
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
                              basePath={basePath}
                              editingProvider={editingProvider}
                              isConfigured
                              onSave={handleSave}
                              onTestModel={handleTestModel}
                              saving={saving}
                              setEditingProvider={setEditingProvider}
                              testing={testing}
                            />
                          )}
                        </div>
                      );
                    })}

                    {editingProvider?.mode === "custom" &&
                      !editingProvider.providerId && (
                        <div className="rounded-lg border border-border/50 bg-card/50">
                          <CustomEditor
                            basePath={basePath}
                            editingProvider={editingProvider}
                            onSave={handleSave}
                            onTestModel={handleTestModel}
                            saving={saving}
                            setEditingProvider={setEditingProvider}
                            testing={testing}
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
  basePath,
  isConfigured = false,
  onTestModel,
  saving,
  setEditingProvider,
  testing,
  onSave,
}: {
  editingProvider: Extract<EditingProvider, { mode: "custom" }>;
  basePath: string;
  isConfigured?: boolean;
  onTestModel: (providerId: string, modelId: string) => void;
  saving: boolean;
  setEditingProvider: Dispatch<SetStateAction<EditingProvider | null>>;
  testing: string | null;
  onSave: () => void;
}) {
  const [discovering, setDiscovering] = useState(false);
  const [discoveryStatus, setDiscoveryStatus] = useState<string | null>(null);
  const [hasAttemptedDiscovery, setHasAttemptedDiscovery] = useState(
    editingProvider.discoveredModels.length > 0
  );
  const discoveryRequestId = useRef(0);

  const canDiscover = Boolean(
    isValidHttpUrl(editingProvider.baseUrl.trim()) &&
      editingProvider.apiKey.trim()
  );

  const discoverModels = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      const baseUrl = editingProvider.baseUrl.trim();
      const apiKey = editingProvider.apiKey.trim();
      const requestKey = `${baseUrl}::${apiKey}`;
      const requestId = discoveryRequestId.current + 1;

      if (!baseUrl || !apiKey) {
        if (!silent) {
          toast.error("Enter Base URL and API Key first");
        }
        return;
      }

      discoveryRequestId.current = requestId;
      setDiscovering(true);
      setDiscoveryStatus(null);

      try {
        const res = await fetch(`${basePath}/api/providers/discover`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baseUrl, apiKey }),
        });
        const data = await res.json().catch(() => null);

        if (
          discoveryRequestId.current !== requestId ||
          `${editingProvider.baseUrl.trim()}::${editingProvider.apiKey.trim()}` !==
            requestKey
        ) {
          return;
        }

        setHasAttemptedDiscovery(true);

        if (!res.ok) {
          const message = data?.message ?? "Failed to read model list";
          setDiscoveryStatus(message);
          if (!silent) {
            toast.error(message);
          }
          return;
        }

        const discoveredModels: string[] = Array.isArray(data?.models)
          ? data.models
          : Array.isArray(data?.discoveredModels)
            ? data.discoveredModels
          : [];
        if (discoveredModels.length === 0) {
          const message = data?.warning ?? "No models found from this endpoint";
          setDiscoveryStatus(message);
          if (!silent) {
            toast.warning(message);
          }
          return;
        }

        setEditingProvider((current) => {
          if (
            current?.mode !== "custom" ||
            `${current.baseUrl.trim()}::${current.apiKey.trim()}` !== requestKey
          ) {
            return current;
          }

          return {
            ...current,
            discoveredModels,
          };
        });
        setDiscoveryStatus(`Found ${discoveredModels.length} models`);
        if (!silent) {
          toast.success(`Found ${discoveredModels.length} models`);
        }
      } catch {
        setHasAttemptedDiscovery(true);
        setDiscoveryStatus("Failed to read model list");
        if (!silent) {
          toast.error("Failed to read model list");
        }
      } finally {
        if (discoveryRequestId.current === requestId) {
          setDiscovering(false);
        }
      }
    },
    [basePath, editingProvider, setEditingProvider]
  );

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
        <div className="flex items-center justify-between gap-3">
          <Label className="text-[12px]">Models</Label>
          {hasAttemptedDiscovery && (
            <Button
              className="h-7 px-2 text-[11px]"
              disabled={!canDiscover || discovering}
              onClick={() => discoverModels()}
              type="button"
              variant="ghost"
            >
              {discovering ? (
                <Loader2Icon className="mr-1 size-3 animate-spin" />
              ) : (
                <RefreshCwIcon className="mr-1 size-3" />
              )}
              Fetch models
            </Button>
          )}
        </div>
        {hasAttemptedDiscovery ? (
          <ModelCheckList
            enabledModels={editingProvider.enabledModels}
            models={editingProvider.discoveredModels}
            onAddManual={(modelId) =>
              setEditingProvider({
                ...editingProvider,
                enabledModels: joinModelList([
                  ...editingProvider.enabledModels,
                  modelId,
                ]),
                discoveredModels: joinModelList([
                  ...editingProvider.discoveredModels,
                  modelId,
                ]),
              })
            }
            onTest={(modelId) =>
              editingProvider.providerId
                ? onTestModel(editingProvider.providerId, modelId)
                : undefined
            }
            onToggle={(modelId) =>
              setEditingProvider({
                ...editingProvider,
                enabledModels: toggleModel(
                  editingProvider.enabledModels,
                  modelId
                ),
              })
            }
            testingModel={testing}
            title="Discovered models"
          />
        ) : (
          <div className="flex min-h-24 items-center justify-center rounded-lg bg-card shadow-[0_0_0_1px_rgba(0,0,0,0.08)]">
            <Button
              className="h-8 px-3 text-[12px]"
              disabled={!canDiscover || discovering}
              onClick={() => discoverModels()}
              type="button"
            >
              {discovering ? (
                <Loader2Icon className="mr-1 size-3 animate-spin" />
              ) : (
                <RefreshCwIcon className="mr-1 size-3" />
              )}
              Fetch models
            </Button>
          </div>
        )}
        {discoveryStatus && (
          <div className="text-[11px] text-muted-foreground">
            {discoveryStatus}
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <Button
          className="h-8 px-4 text-[12px]"
          disabled={
            saving ||
            !editingProvider.displayName ||
            !editingProvider.baseUrl ||
            (!isConfigured && !editingProvider.apiKey)
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

function ModelCheckList({
  enabledModels,
  models,
  onAddManual,
  onTest,
  onToggle,
  testingModel,
  title,
}: {
  enabledModels: string[];
  models: string[];
  onAddManual: (modelId: string) => void;
  onTest?: (modelId: string) => void;
  onToggle: (modelId: string) => void;
  testingModel: string | null;
  title: string;
}) {
  const [manualModelId, setManualModelId] = useState("");
  const enabled = new Set(enabledModels);
  const allModels = joinModelList([...models, ...enabledModels]);

  const handleAdd = () => {
    const modelId = manualModelId.trim();
    if (!modelId) {
      return;
    }
    onAddManual(modelId);
    setManualModelId("");
  };

  return (
    <div className="overflow-hidden rounded-lg bg-card shadow-[0_0_0_1px_rgba(0,0,0,0.08)]">
      <div className="border-border/40 border-b px-3 py-2 text-[12px] text-muted-foreground">
        {title}
      </div>
      <div className="max-h-56 overflow-y-auto">
        {allModels.length > 0 ? (
          allModels.map((modelId) => {
            const isTesting = testingModel?.endsWith(`:${modelId}`);
            return (
              <div
                className="flex min-h-9 items-center gap-2 border-border/30 border-b px-3 last:border-b-0 hover:bg-muted/30"
                key={modelId}
              >
                <input
                  checked={enabled.has(modelId)}
                  className="size-3.5 accent-primary"
                  onChange={() => onToggle(modelId)}
                  type="checkbox"
                />
                <span className="min-w-0 flex-1 truncate font-mono text-[12px]">
                  {modelId}
                </span>
                {onTest && (
                  <Button
                    className="h-6 px-2 text-[11px]"
                    disabled={isTesting}
                    onClick={() => onTest(modelId)}
                    type="button"
                    variant="ghost"
                  >
                    {isTesting ? (
                      <Loader2Icon className="mr-1 size-3 animate-spin" />
                    ) : null}
                    Test
                  </Button>
                )}
              </div>
            );
          })
        ) : (
          <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
            Fetch models or add one manually.
          </div>
        )}
      </div>
      <div className="flex gap-2 border-border/40 border-t p-2">
        <Input
          className="h-8 rounded-md font-mono text-[12px]"
          onChange={(event) => setManualModelId(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleAdd();
            }
          }}
          placeholder="Add model ID"
          value={manualModelId}
        />
        <Button
          className="h-8 px-3 text-[12px]"
          disabled={!manualModelId.trim()}
          onClick={handleAdd}
          type="button"
          variant="outline"
        >
          <PlusIcon className="mr-1 size-3" />
          Add
        </Button>
      </div>
    </div>
  );
}
