import { streamText } from "ai";
import { sheetPrompt, updateDocumentPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { createDocumentHandler } from "@/lib/artifacts/server";

function getSessionUserId(session: { user?: { id?: string | null } }) {
  if (!session.user?.id) {
    throw new Error("Unauthorized");
  }
  return session.user.id;
}

export const sheetDocumentHandler = createDocumentHandler<"sheet">({
  kind: "sheet",
  onCreateDocument: async ({ title, dataStream, modelSelection, session }) => {
    let draftContent = "";
    const userId = getSessionUserId(session);

    const { fullStream } = streamText({
      model: await getLanguageModel(modelSelection, userId),
      system: `${sheetPrompt}\n\nOutput ONLY the raw CSV data. No explanations, no markdown fences.`,
      prompt: title,
    });

    for await (const delta of fullStream) {
      if (delta.type === "text-delta") {
        draftContent += delta.text;
        dataStream.write({
          type: "data-sheetDelta",
          data: draftContent,
          transient: true,
        });
      }
    }

    return draftContent;
  },
  onUpdateDocument: async ({
    document,
    description,
    dataStream,
    modelSelection,
    session,
  }) => {
    let draftContent = "";
    const userId = getSessionUserId(session);

    const { fullStream } = streamText({
      model: await getLanguageModel(modelSelection, userId),
      system: `${updateDocumentPrompt(document.content, "sheet")}\n\nOutput ONLY the raw CSV data. No explanations, no markdown fences.`,
      prompt: description,
    });

    for await (const delta of fullStream) {
      if (delta.type === "text-delta") {
        draftContent += delta.text;
        dataStream.write({
          type: "data-sheetDelta",
          data: draftContent,
          transient: true,
        });
      }
    }

    return draftContent;
  },
});
