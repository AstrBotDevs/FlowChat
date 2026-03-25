import { auth } from "@/app/(auth)/auth";
import { getChatById, getMessagesByChatId } from "@/lib/db/queries";
import { isMockMode } from "@/lib/mock/index";
import { mockStore } from "@/lib/mock/store";
import { convertToUIMessages } from "@/lib/utils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chatId");

  if (!chatId) {
    return Response.json({ error: "chatId required" }, { status: 400 });
  }

  if (isMockMode) {
    const chat = mockStore.getChatById(chatId!);
    if (!chat) {
      return Response.json({ messages: [], visibility: "private", userId: null, isReadonly: false });
    }
    // Get root thread messages as the default
    const rootThread = mockStore.getRootThread(chatId!);
    const messages = rootThread
      ? mockStore.getMessagesByThreadId(rootThread.id).map(m => ({
          id: m.id,
          role: m.role,
          parts: m.parts,
          metadata: { createdAt: m.createdAt.toISOString() },
        }))
      : [];
    return Response.json({ messages, visibility: chat.visibility, userId: chat.userId, isReadonly: false });
  }

  const [session, chat, messages] = await Promise.all([
    auth(),
    getChatById({ id: chatId }),
    getMessagesByChatId({ id: chatId }),
  ]);

  if (!chat) {
    return Response.json({
      messages: [],
      visibility: "private",
      userId: null,
      isReadonly: false,
    });
  }

  if (
    chat.visibility === "private" &&
    (!session?.user || session.user.id !== chat.userId)
  ) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const isReadonly = !session?.user || session.user.id !== chat.userId;

  return Response.json({
    messages: convertToUIMessages(messages),
    visibility: chat.visibility,
    userId: chat.userId,
    isReadonly,
  });
}
