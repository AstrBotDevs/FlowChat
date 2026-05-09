import { smoothStream, streamText } from "ai";
import { updateDocumentPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { createDocumentHandler } from "@/lib/artifacts/server";

function getSessionUserId(session: { user?: { id?: string | null } }) {
  if (!session.user?.id) {
    throw new Error("Unauthorized");
  }
  return session.user.id;
}

export const textDocumentHandler = createDocumentHandler<"text">({
  kind: "text",
  onCreateDocument: async ({ title, dataStream, modelSelection, session }) => {
    let draftContent = "";
    const userId = getSessionUserId(session);

    const { fullStream } = streamText({
      model: await getLanguageModel(modelSelection, userId),
      system:
        "Write about the given topic. Markdown is supported. Use headings wherever appropriate.",
      experimental_transform: smoothStream({ chunking: "word" }),
      prompt: title,
    });

    for await (const delta of fullStream) {
      if (delta.type === "text-delta") {
        draftContent += delta.text;
        dataStream.write({
          type: "data-textDelta",
          data: delta.text,
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
      system: updateDocumentPrompt(document.content, "text"),
      experimental_transform: smoothStream({ chunking: "word" }),
      prompt: description,
    });

    for await (const delta of fullStream) {
      if (delta.type === "text-delta") {
        draftContent += delta.text;
        dataStream.write({
          type: "data-textDelta",
          data: delta.text,
          transient: true,
        });
      }
    }

    return draftContent;
  },
});
