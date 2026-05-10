export function normalizeModelIds(models: string[]): string[] {
  return Array.from(
    new Set(models.map((model) => model.trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
}

export async function discoverOpenAICompatibleModels({
  baseUrl,
  apiKey,
}: {
  baseUrl: string;
  apiKey: string;
}): Promise<{ models: string[]; warning?: string }> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return {
        models: [],
        warning: `Model discovery failed with ${res.status}`,
      };
    }

    const json = await res.json();
    const models = Array.isArray(json.data)
      ? json.data
          .map((model: { id?: unknown }) =>
            typeof model.id === "string" ? model.id : null
          )
          .filter((id: string | null): id is string => Boolean(id))
      : [];

    return { models: normalizeModelIds(models) };
  } catch (error) {
    return {
      models: [],
      warning:
        error instanceof Error ? error.message : "Model discovery failed",
    };
  }
}
