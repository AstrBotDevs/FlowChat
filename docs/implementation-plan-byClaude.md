# 划词追问 Inline Popover 全栈实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 FlowChat 实现树状划词追问核心交互——用户在 AI 回复中选中文字后，通过 Inline Popover 发起局部追问，形成可持久化、可再次进入的认知锚点。

**Architecture:** 在现有 Chat + Message 数据模型之上，新增 Thread 和 Quote 两张表来支撑树状对话分支。后端新增独立的 `/api/thread` 路由处理追问的流式对话，采用与主聊天相同的 AI SDK `streamText` 机制，但使用专门的短链 Prompt 拼装策略。前端在消息组件中集成文本选区检测、追问按钮、Popover 组件和锚点渲染。

**Tech Stack:** Next.js 16, React 19, Drizzle ORM (PostgreSQL), AI SDK (`ai` + `@ai-sdk/react`), Tailwind CSS, Framer Motion, Radix UI Popover

---

**相关文档（实施前必读）：**

- UI 交互设计：[docs/inline-popover-design.md](../inline-popover-design.md)
- 核心逻辑与数据结构：[docs/core-logic.md](../core-logic.md)
- 产品 PRD：[docs/product-prd.md](../product-prd.md)

---

## 文件结构总览

### 新增文件

| 文件 | 职责 |
|------|------|
| `lib/db/migrations/0002_add_thread_quote.sql` | Thread 和 Quote 表的数据库迁移 |
| `lib/db/schema-thread.ts` | Thread、Quote 表的 Drizzle schema 定义 |
| `lib/db/queries-thread.ts` | Thread/Quote/ThreadMessage 的 CRUD 查询函数 |
| `lib/ai/prompts-thread.ts` | 追问场景的 System Prompt 和上下文拼装逻辑 |
| `app/(chat)/api/thread/route.ts` | 追问对话的 POST（发送消息/流式回复）API |
| `app/(chat)/api/thread/messages/route.ts` | 获取某个 Thread 的消息列表 API |
| `app/(chat)/api/quote/route.ts` | Quote CRUD（创建、查询、软删除）API |
| `hooks/use-text-selection.ts` | 文本选区检测 hook：监听 mouseup，返回选区信息 |
| `hooks/use-thread-chat.ts` | 追问对话 hook：管理 Popover 内的流式对话状态 |
| `components/chat/follow-up-button.tsx` | 选区后浮现的"追问"迷你按钮 |
| `components/chat/follow-up-popover.tsx` | 追问 Popover 主组件（Header + 对话区 + 输入框） |
| `components/chat/anchor-mark.tsx` | 认知锚点的渲染组件（下划线 + 数字徽章 + hover tooltip） |
| `components/chat/anchor-index.tsx` | 消息底部的锚点索引栏 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `components/chat/message.tsx` | 在 assistant 消息的文本渲染中集成选区检测、锚点渲染、Popover 挂载 |
| `lib/db/schema.ts` | 导出新增的 schema（re-export from schema-thread.ts） |
| `lib/db/queries.ts` | 在 `deleteChatById` 中级联删除 Thread/Quote 数据 |

---

## Task 1: 数据库 Schema — Thread 和 Quote 表

**Files:**
- Create: `lib/db/schema-thread.ts`
- Create: `lib/db/migrations/0002_add_thread_quote.sql`
- Modify: `lib/db/schema.ts`

**上下文：** 参考 `docs/core-logic.md` 第二节的数据结构定义。当前项目使用 Drizzle ORM + PostgreSQL，迁移文件放在 `lib/db/migrations/`，通过 `pnpm db:generate` 生成或手写 SQL。现有 schema 在 `lib/db/schema.ts`，表名使用 PascalCase（如 `"Chat"`、`"Message_v2"`）。

- [ ] **Step 1: 创建 Thread 和 Quote 的 Drizzle schema**

创建 `lib/db/schema-thread.ts`：

```typescript
import type { InferSelectModel } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { chat, message } from "./schema";

export const thread = pgTable(
  "Thread",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    parentThreadId: uuid("parentThreadId"), // null = 主线 Thread
    sourceQuoteId: uuid("sourceQuoteId"),   // null = 主线 Thread
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    parentRef: foreignKey({
      columns: [table.parentThreadId],
      foreignColumns: [table.id],
    }),
  })
);

export type Thread = InferSelectModel<typeof thread>;

export const quote = pgTable(
  "Quote",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    sourceThreadId: uuid("sourceThreadId")
      .notNull()
      .references(() => thread.id),
    sourceMessageId: uuid("sourceMessageId")
      .notNull()
      .references(() => message.id),
    quoteText: text("quoteText").notNull(),
    childThreadId: uuid("childThreadId")
      .notNull()
      .references(() => thread.id),
    isUnlinked: boolean("isUnlinked").notNull().default(false), // 软删除：解除锚点可视化关联
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  }
);

export type Quote = InferSelectModel<typeof quote>;

export const threadMessage = pgTable("ThreadMessage", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  threadId: uuid("threadId")
    .notNull()
    .references(() => thread.id),
  role: text("role").notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type ThreadMessage = InferSelectModel<typeof threadMessage>;
```

- [ ] **Step 2: 在 `lib/db/schema.ts` 底部 re-export 新 schema**

在 `lib/db/schema.ts` 文件末尾追加：

```typescript
export {
  thread,
  quote,
  threadMessage,
  type Thread,
  type Quote,
  type ThreadMessage,
} from "./schema-thread";
```

- [ ] **Step 3: 手写迁移 SQL**

创建 `lib/db/migrations/0002_add_thread_quote.sql`：

```sql
CREATE TABLE IF NOT EXISTS "Thread" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "chatId" uuid NOT NULL REFERENCES "Chat"("id"),
  "parentThreadId" uuid REFERENCES "Thread"("id"),
  "sourceQuoteId" uuid,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "Quote" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sourceThreadId" uuid NOT NULL REFERENCES "Thread"("id"),
  "sourceMessageId" uuid NOT NULL REFERENCES "Message_v2"("id"),
  "quoteText" text NOT NULL,
  "childThreadId" uuid NOT NULL REFERENCES "Thread"("id"),
  "isUnlinked" boolean DEFAULT false NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "Thread" ADD CONSTRAINT "Thread_sourceQuoteId_fkey"
  FOREIGN KEY ("sourceQuoteId") REFERENCES "Quote"("id");

CREATE TABLE IF NOT EXISTS "ThreadMessage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "threadId" uuid NOT NULL REFERENCES "Thread"("id"),
  "role" text NOT NULL,
  "content" text NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "idx_thread_chatId" ON "Thread"("chatId");
CREATE INDEX "idx_quote_sourceMessageId" ON "Quote"("sourceMessageId");
CREATE INDEX "idx_quote_childThreadId" ON "Quote"("childThreadId");
CREATE INDEX "idx_threadMessage_threadId" ON "ThreadMessage"("threadId");
```

同时更新 `lib/db/migrations/meta/_journal.json`，在 `entries` 数组末尾追加新条目：

```json
{
  "idx": 2,
  "version": "7",
  "when": 1744329600000,
  "tag": "0002_add_thread_quote",
  "breakpoints": true
}
```

- [ ] **Step 4: 运行迁移验证**

```bash
pnpm db:migrate
```

预期输出：`Migrations completed in XXX ms`

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema-thread.ts lib/db/schema.ts lib/db/migrations/
git commit -m "feat: add Thread, Quote, ThreadMessage database tables for follow-up"
```

---

## Task 2: 数据库查询函数

**Files:**
- Create: `lib/db/queries-thread.ts`
- Modify: `lib/db/queries.ts`

**上下文：** 现有查询函数都在 `lib/db/queries.ts` 中，使用 Drizzle ORM 的 `eq`、`and`、`asc` 等操作符。新增查询单独放一个文件，避免原文件过大。需要在 `deleteChatById` 中级联删除新增表的数据。

- [ ] **Step 1: 创建 Thread/Quote 查询函数**

创建 `lib/db/queries-thread.ts`，包含以下函数：

```typescript
import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ChatbotError } from "../errors";
import {
  quote,
  thread,
  threadMessage,
  type Quote,
  type Thread,
  type ThreadMessage,
} from "./schema";

const client = postgres(process.env.POSTGRES_URL ?? "");
const db = drizzle(client);

// ---- Thread ----

export async function createThread({
  id,
  chatId,
  parentThreadId,
  sourceQuoteId,
}: {
  id: string;
  chatId: string;
  parentThreadId: string | null;
  sourceQuoteId: string | null;
}): Promise<Thread> {
  try {
    const [created] = await db
      .insert(thread)
      .values({ id, chatId, parentThreadId, sourceQuoteId })
      .returning();
    return created;
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to create thread");
  }
}

export async function getThreadById({ id }: { id: string }): Promise<Thread | null> {
  try {
    const [result] = await db.select().from(thread).where(eq(thread.id, id));
    return result ?? null;
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to get thread");
  }
}

// ---- Quote ----

export async function createQuote({
  id,
  sourceThreadId,
  sourceMessageId,
  quoteText,
  childThreadId,
}: {
  id: string;
  sourceThreadId: string;
  sourceMessageId: string;
  quoteText: string;
  childThreadId: string;
}): Promise<Quote> {
  try {
    const [created] = await db
      .insert(quote)
      .values({ id, sourceThreadId, sourceMessageId, quoteText, childThreadId })
      .returning();
    return created;
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to create quote");
  }
}

export async function getQuotesByMessageId({
  messageId,
}: {
  messageId: string;
}): Promise<Quote[]> {
  try {
    return await db
      .select()
      .from(quote)
      .where(and(eq(quote.sourceMessageId, messageId), eq(quote.isUnlinked, false)))
      .orderBy(asc(quote.createdAt));
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to get quotes");
  }
}

export async function getQuoteById({ id }: { id: string }): Promise<Quote | null> {
  try {
    const [result] = await db.select().from(quote).where(eq(quote.id, id));
    return result ?? null;
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to get quote");
  }
}

export async function unlinkQuote({ id }: { id: string }) {
  try {
    return await db
      .update(quote)
      .set({ isUnlinked: true })
      .where(eq(quote.id, id));
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to unlink quote");
  }
}

export async function unlinkAllQuotesByMessageId({ messageId }: { messageId: string }) {
  try {
    return await db
      .update(quote)
      .set({ isUnlinked: true })
      .where(eq(quote.sourceMessageId, messageId));
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to unlink quotes");
  }
}

// ---- ThreadMessage ----

export async function saveThreadMessage({
  id,
  threadId,
  role,
  content,
}: {
  id: string;
  threadId: string;
  role: string;
  content: string;
}): Promise<ThreadMessage> {
  try {
    const [created] = await db
      .insert(threadMessage)
      .values({ id, threadId, role, content })
      .returning();
    return created;
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save thread message");
  }
}

export async function getThreadMessagesByThreadId({
  threadId,
}: {
  threadId: string;
}): Promise<ThreadMessage[]> {
  try {
    return await db
      .select()
      .from(threadMessage)
      .where(eq(threadMessage.threadId, threadId))
      .orderBy(asc(threadMessage.createdAt));
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to get thread messages");
  }
}

// ---- 级联删除（供 deleteChatById 调用）----

export async function deleteThreadDataByChatId({ chatId }: { chatId: string }) {
  try {
    // 找出该 chat 下所有 thread
    const threads = await db
      .select({ id: thread.id })
      .from(thread)
      .where(eq(thread.chatId, chatId));

    if (threads.length === 0) return;

    const threadIds = threads.map((t) => t.id);

    // 先删 threadMessage（无外键依赖）
    for (const tid of threadIds) {
      await db.delete(threadMessage).where(eq(threadMessage.threadId, tid));
    }

    // 再清 thread.sourceQuoteId 引用以解除循环外键
    for (const tid of threadIds) {
      await db.update(thread).set({ sourceQuoteId: null }).where(eq(thread.id, tid));
    }

    // 删 quote
    for (const tid of threadIds) {
      await db.delete(quote).where(eq(quote.sourceThreadId, tid));
    }

    // 最后删 thread（子线程先删，靠 parentThreadId 无外键约束问题因为已经置空 sourceQuoteId）
    await db.delete(thread).where(eq(thread.chatId, chatId));
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to delete thread data");
  }
}
```

- [ ] **Step 2: 修改 `deleteChatById` 级联删除 Thread 数据**

在 `lib/db/queries.ts` 的 `deleteChatById` 函数中，在删除 vote/message/stream 之前，先调用级联删除：

```typescript
import { deleteThreadDataByChatId } from "./queries-thread";

// 在 deleteChatById 函数内，第一行添加：
await deleteThreadDataByChatId({ id });
```

- [ ] **Step 3: Commit**

```bash
git add lib/db/queries-thread.ts lib/db/queries.ts
git commit -m "feat: add Thread/Quote/ThreadMessage query functions"
```

---

## Task 3: 追问 Prompt 拼装

**Files:**
- Create: `lib/ai/prompts-thread.ts`

**上下文：** 参考 `docs/core-logic.md` 第三节的 Prompt 拼装策略。核心规则：追问只带直接父级的完整 AI 回答 + 划中文字 + 当前 Thread 内的对话历史。现有 `lib/ai/prompts.ts` 定义了主线的 systemPrompt 函数。

- [ ] **Step 1: 创建追问 Prompt 拼装模块**

创建 `lib/ai/prompts-thread.ts`：

```typescript
import type { ThreadMessage } from "@/lib/db/schema";

export const threadSystemPrompt =
  "你是一个专注的 AI 学习助手。请结合上一段解释的语境，聚焦回答用户的当前问题，保持清晰、易懂的教学风格。";

/**
 * 拼装追问 Thread 发送给 LLM 的消息数组。
 *
 * 结构：
 * 1. System prompt
 * 2. 父级 AI 回答的完整内容（作为 user 消息注入背景）
 * 3. 用户划选的文字 + 第一轮追问（合并为一条 user 消息）
 * 4. Thread 内后续的多轮对话历史
 *
 * @param sourceMessageContent - 被划词的那条 AI 回答的完整文本
 * @param quoteText - 用户选中的具体文字
 * @param threadMessages - 当前 Thread 内的所有消息（按时间排序）
 * @param slidingWindowSize - 滑动窗口大小，默认 20 轮（40 条消息）
 */
export function buildThreadPrompt({
  sourceMessageContent,
  quoteText,
  threadMessages,
  slidingWindowSize = 40,
}: {
  sourceMessageContent: string;
  quoteText: string;
  threadMessages: ThreadMessage[];
  slidingWindowSize?: number;
}): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

  // 1. System prompt
  messages.push({ role: "system", content: threadSystemPrompt });

  // 2. 父级背景（固定，不参与滑动窗口）
  messages.push({
    role: "user",
    content: `【这是你上一轮的解释】：\n${sourceMessageContent}`,
  });

  if (threadMessages.length === 0) {
    return messages;
  }

  // 3. 第一轮追问：合并划选文字 + 用户的追问内容
  const firstMessage = threadMessages[0];
  messages.push({
    role: "user",
    content: `【用户在上面的解释中选中了】：\n『${quoteText}』\n\n【用户的追问】：\n${firstMessage.content}`,
  });

  // 4. 后续对话历史（应用滑动窗口）
  const restMessages = threadMessages.slice(1);
  const windowedMessages =
    restMessages.length > slidingWindowSize
      ? restMessages.slice(-slidingWindowSize)
      : restMessages;

  for (const msg of windowedMessages) {
    messages.push({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    });
  }

  return messages;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/ai/prompts-thread.ts
git commit -m "feat: add thread prompt assembly with short-chain context strategy"
```

---

## Task 4: 追问 API 路由

**Files:**
- Create: `app/(chat)/api/thread/route.ts`
- Create: `app/(chat)/api/thread/messages/route.ts`
- Create: `app/(chat)/api/quote/route.ts`

**上下文：** 参考现有的 `app/(chat)/api/chat/route.ts` 的模式：auth 校验、获取 user providers、使用 `streamText` + `createUIMessageStream`。追问 API 需要额外的逻辑：根据 threadId 拼装上下文，使用 `prompts-thread.ts` 的 `buildThreadPrompt`。

**关于 ThreadMessage 与现有 Message_v2 的关系：** 现有 `Message_v2` 表存储主线消息，使用 `parts`（JSON，含 tool-call 等复杂结构）和 `attachments` 字段，与 AI SDK 的 UIMessage 格式强耦合。追问场景是纯文本对话（不使用 Artifact 等工具），因此使用独立的 `ThreadMessage` 表，字段更简洁（`content` 为纯文本字符串）。两张表通过 Quote 建立关联：`Quote.sourceMessageId` 指向 `Message_v2` 中被划词的那条 AI 消息。

- [ ] **Step 1: 创建 Thread 对话 API（POST — 发送追问消息并流式回复）**

创建 `app/(chat)/api/thread/route.ts`：

这个路由处理追问 Popover 内的消息发送。请求体包含：
- `threadId`: 追问所在的 Thread ID
- `chatId`: 所属的 Chat ID
- `message`: 用户发送的追问文本
- `selectedChatModel`: 当前选中的模型
- `sourceMessageId`: 被划词的 AI 消息 ID（仅创建新 Thread 时需要）
- `quoteText`: 划选的文字（仅创建新 Thread 时需要）
- `sourceThreadId`: 父 Thread ID（仅创建新 Thread 时需要）

核心流程：
1. 验证 auth，获取 userId
2. 验证 chatId 归属：通过 `getChatById` 检查 `chat.userId === userId`
3. 如果是新 Thread（threadId 对应的 Thread 不存在），先创建 Quote + Thread
4. 保存用户消息到 ThreadMessage
5. 获取 `sourceMessageContent`：通过 Quote → `sourceMessageId` → `getMessageById` 查到 `Message_v2`，提取其 `parts` 中 `type === "text"` 的文本拼接为字符串
6. 用 `buildThreadPrompt` 拼装上下文
7. 调用 `streamText`，流式返回
8. AI 回复完成后保存 assistant 消息到 ThreadMessage

具体实现参考现有 `api/chat/route.ts` 的 `streamText` + `createUIMessageStream` 模式，但不使用 tools（追问场景不需要 Artifact 等工具），只做纯文本对话。

- [ ] **Step 2: 创建 Thread 消息查询 API（GET）**

创建 `app/(chat)/api/thread/messages/route.ts`：

GET 请求，query 参数为 `threadId`。返回内容包括：

1. 该 Thread 下的所有 ThreadMessage（按 createdAt 升序）
2. Thread 的元信息：`quoteText`、`sourceMessageId`（从 `Thread.sourceQuoteId` → Quote 查出）
3. 面包屑路径数据：沿 `Thread.parentThreadId` 向上递归追溯，返回每一层的 `{ threadId, quoteText }` 数组（用于嵌套 Popover 的面包屑导航渲染）

权限验证：通过 `threadId → Thread.chatId → getChatById → chat.userId === userId` 链��验证归属。

- [ ] **Step 3: 创建 Quote CRUD API**

创建 `app/(chat)/api/quote/route.ts`：

- **GET**：query 参数 `messageId`，返回该消息上所有未 unlink 的 Quote 列表（含 childThreadId 和 quoteText），附带每个 Quote 对应 Thread 的消息数量（用于显示轮次徽章）
- **DELETE**：body 参数 `quoteId`，调用 `unlinkQuote` 软删除
- **DELETE（批量）**：body 参数 `messageId`，调用 `unlinkAllQuotesByMessageId`

- [ ] **Step 4: Commit**

```bash
git add app/(chat)/api/thread/ app/(chat)/api/quote/
git commit -m "feat: add thread and quote API routes"
```

---

## Task 5: 文本选区检测 Hook

**Files:**
- Create: `hooks/use-text-selection.ts`

**上下文：** 这个 hook 监听 assistant 消息文本区域内的 mouseup 事件，检测是否存在有效选区，返回选区信息供 FollowUpButton 定位使用。参考 UI 设计文档第二节的触发规则。

- [ ] **Step 1: 创建 `use-text-selection` hook**

创建 `hooks/use-text-selection.ts`：

功能：
- 监听指定容器 ref 内的 `mouseup` 事件
- mouseup 后延迟约 150ms 检查 `window.getSelection()`
- 验证选区非空、在 assistant 消息文本范围内、不在代码块内
- 返回 `{ text, rect, messageId, isActive }` 其中 rect 是选区的 `getBoundingClientRect()` 用于定位按钮
- 点击空白处、选区变化、页面滚动时清除状态（isActive 变 false）

- [ ] **Step 2: Commit**

```bash
git add hooks/use-text-selection.ts
git commit -m "feat: add useTextSelection hook for follow-up trigger"
```

---

## Task 6: 追问对话 Hook

**Files:**
- Create: `hooks/use-thread-chat.ts`

**上下文：** 这个 hook 管理 Popover 内的追问对话状态。它类似于 `useChat`（来自 `@ai-sdk/react`），但调用的是追问专用的 `/api/thread` 路由。需要处理：创建新 Thread、发送消息、接收流式回复、加载历史消息。

- [ ] **Step 1: 创建 `use-thread-chat` hook**

创建 `hooks/use-thread-chat.ts`：

功能：
- 接收参数：`chatId`, `sourceMessageId`, `quoteText`, `sourceThreadId`, `existingThreadId?`（re-entry 时传入）, `selectedChatModel`
- 状态：`messages: ThreadMessage[]`, `status: 'idle' | 'streaming' | 'error'`, `threadId: string | null`
- `sendMessage(text: string)` 方法：POST 到 `/api/thread`，处理流式响应（使用 fetch + ReadableStream 解析 SSE），将用户消息和 AI 回复追加到 messages
- `loadHistory(threadId: string)` 方法：GET `/api/thread/messages?threadId=xxx`，加载已有的对话
- `stop()` 方法：中断当前流式请求

- [ ] **Step 2: Commit**

```bash
git add hooks/use-thread-chat.ts
git commit -m "feat: add useThreadChat hook for popover conversation"
```

---

## Task 7: 追问按钮组件

**Files:**
- Create: `components/chat/follow-up-button.tsx`

**上下文：** 参考 UI 设计文档第二节。用户在 assistant 消息中选中文字后，在选区正下方居中浮现一个迷你追问按钮。按钮使用绝对定位，相对于消息容器。参考现有项目的组件模式（使用 `cn()` 工具函数、`lucide-react` 图标、`framer-motion` 动画）。

- [ ] **Step 1: 创建 FollowUpButton 组件**

创建 `components/chat/follow-up-button.tsx`：

Props：
- `selectionRect: DOMRect` — 选区位置
- `containerRef: RefObject<HTMLElement>` — 消息容器 ref，用于计算相对位置
- `onFollowUp: () => void` — 点击"追问"的回调
- `onDismiss: () => void` — 消失回调

行为：
- 绝对定位于选区正下方居中
- 带入场/出场动画（opacity + translateY）
- 包含一个按钮：对话气泡图标 + "追问"文字

- [ ] **Step 2: Commit**

```bash
git add components/chat/follow-up-button.tsx
git commit -m "feat: add FollowUpButton component"
```

---

## Task 8: 追问 Popover 组件

**Files:**
- Create: `components/chat/follow-up-popover.tsx`

**上下文：** 参考 UI 设计文档第三节和第五节。这是核心组件，承载 Header（引用文字 + 面包屑 + 关闭按钮）、对话区域（消息列表 + 历史折叠）、输入区域（输入框 + 发送/停止按钮）。使用 `use-thread-chat` hook 管理对话状态。

- [ ] **Step 1: 创建 FollowUpPopover 组件**

创建 `components/chat/follow-up-popover.tsx`：

Props：
- `chatId: string`
- `sourceMessageId: string` — 被划词的 AI 消息 ID
- `quoteText: string` — 用户选中的文字
- `sourceThreadId: string` — 父 Thread ID（主线或上层追问 Thread）
- `existingThreadId?: string` — 再次进入时传入的已有 Thread ID
- `selectedChatModel: string`
- `anchorRect: DOMRect` — 选区/锚点的位置，用于 Popover 定位
- `containerRef: RefObject<HTMLElement>` — 消息容器 ref
- `onClose: () => void`
- `breadcrumbs?: Array<{ quoteText: string; threadId: string }>` — 嵌套面包屑

结构：
- **Header**：左侧图标 + "追问" + 引用文字（truncate）+ 轮次徽章（messages > 2 时显示）。嵌套时显示面包屑导航（← 按钮 + 层级路径）。右侧 × 关闭按钮。
- **Conversation 区域**：初始隐藏，有消息后出现。使用内部滚动。超过 2 轮时历史 AI 回复折叠为单行摘要（点击展开）。最新一轮完整显示。
- **Input 区域**：textarea + 发送按钮。流式回复中禁用输入，发送按钮变停止按钮。

定位逻辑：
- 优先 anchorRect 正下方
- 空间不足时翻转到上方
- 水平修正防止超出视口

嵌套追问：
- Popover 内的 AI 回复也集成选区检测
- 用户在 Popover 内选中文字并追问时，Popover 内容平滑切换为新层级（替换 + 面包屑），不打开新 Popover
- 面包屑点击可回到上一层

关闭行为：
- × 按钮 / Esc / 点击外部 → 关闭
- 关闭时如果已发送过消息，通知父组件创建锚点

- [ ] **Step 2: Commit**

```bash
git add components/chat/follow-up-popover.tsx
git commit -m "feat: add FollowUpPopover component with conversation and nesting"
```

---

## Task 9: 认知锚点组件

**Files:**
- Create: `components/chat/anchor-mark.tsx`
- Create: `components/chat/anchor-index.tsx`

**上下文：** 参考 UI 设计文档第四节和第六节。锚点组件负责在 assistant 消息文本中渲染已追问过的文字标记。需要将 AI 回复的纯文本根据 Quote 数据拆分为：普通文本段 + 锚点标记段。

- [ ] **Step 1: 创建 AnchorMark 组件**

创建 `components/chat/anchor-mark.tsx`：

Props：
- `quoteText: string` — 锚点对应的原文
- `roundCount: number` — 追问轮数（显示为上标数字徽章）
- `quoteId: string`
- `threadId: string`
- `onClick: (threadId: string) => void` — 点击锚点打开 Popover
- `onUnlink: (quoteId: string) => void` — 右键解除锚点

行为：
- 渲染带虚线下划线的 `<span>`
- 文字后显示上标轮次数字
- Hover 时下划线变实线，显示 tooltip（第一轮 Q&A 摘要，可后续迭代）
- 右键菜单提供"解除追问标记"选项
- 点击打开对应的 Popover（调用 onClick）

- [ ] **Step 2: 创建 AnchorIndex 组件**

创建 `components/chat/anchor-index.tsx`：

Props：
- `quotes: Array<{ id: string; quoteText: string; threadId: string; roundCount: number }>`
- `onJump: (quoteId: string) => void` — 跳转到锚点位置
- `onUnlink: (quoteId: string) => void`
- `onUnlinkAll: () => void`

行为：
- 可折叠面板，默认收起
- 标题显示锚点数量
- 展开后列出每个锚点的引用文字和轮数
- 支持单个解除和全部清除

- [ ] **Step 3: Commit**

```bash
git add components/chat/anchor-mark.tsx components/chat/anchor-index.tsx
git commit -m "feat: add AnchorMark and AnchorIndex components"
```

---

## Task 10: 集成到消息组件

**Files:**
- Modify: `components/chat/message.tsx`

**上下文：** 现有的 `PurePreviewMessage` 组件在 `message.tsx` 中渲染每条消息。需要在 assistant 消息的文本渲染部分：1) 集成文本选区检测和追问按钮 2) 将含有锚点的文本拆分渲染 3) 挂载 Popover 4) 在消息底部添加锚点索引栏。

- [ ] **Step 1: 在 assistant 消息文本部分集成选区和锚点**

修改 `components/chat/message.tsx` 中的 `PurePreviewMessage` 组件：

关键改动点：

1. **数据获取**：用 `useSWR` 请求 `/api/quote?messageId=xxx` 获取当前消息的所有 Quote 锚点数据

2. **文本渲染改造**：对于 assistant 消息的 `type === "text"` 部分，将纯文本交给一个新的内部组件 `AnnotatedText` 处理。这个组件根据 Quote 数据中的 `quoteText`，将原文拆分为交替的普通文本段和 `<AnchorMark>` 段

3. **选区检测**：在 assistant 消息的文本容器上挂载 `useTextSelection` hook。选区激活时渲染 `<FollowUpButton>`

4. **Popover 管理**：维护 `activePopover` 状态（当前打开的 Popover 信息），渲染 `<FollowUpPopover>`。同一时刻只打开一个 Popover

5. **锚点索引**：当 Quote 数量 >= 2 时，在消息底部渲染 `<AnchorIndex>`

6. **锚点交互**：点击锚点 → 关闭当前 Popover → 打开新 Popover（传入 existingThreadId 加载历史）

需要传递给子组件的关键 props：`chatId`（从 PurePreviewMessage props 透传）、`selectedChatModel`（需要新增 prop 或从 context 获取）

- [ ] **Step 2: Commit**

```bash
git add components/chat/message.tsx
git commit -m "feat: integrate text selection, anchors, and popover into message component"
```

---

## Task 11: 端到端验收与边界处理

**Files:** 无新文件，可能需要微调上述文件

- [ ] **Step 1: 启动开发服务器，测试主路径**

```bash
pnpm dev
```

验证用户旅程 A（PRD 第 8 节）：
1. 在主线发送一个学习问题
2. AI 回复后，在回复文本中拖选一段文字
3. 追问按钮出现在选区下方
4. 点击追问按钮，Popover 展开
5. 输入追问问题，AI 流式回复
6. 关闭 Popover，锚点出现在原文中
7. 点击锚点，重新打开 Popover，历史对话已加载

- [ ] **Step 2: 测试用户旅程 B（多轮追问）**

1. 在 Popover 内继续输入第二个、第三个问题
2. 验证历史折叠：第一轮回复自动折叠为摘要
3. 关闭后锚点数字徽章显示正确的轮次数

- [ ] **Step 3: 测试用户旅程 C（嵌套追问）**

1. 在 Popover 内的 AI 回复中选中文字
2. 发起二级追问，Popover 内容切换为新层级
3. 面包屑导航正确显示
4. 点击面包屑回到上一层

- [ ] **Step 4: 测试用户旅程 D（解除锚点）**

1. 右键点击锚点，选择"解除追问标记"
2. 原文恢复为普通文字
3. 锚点索引栏更新

- [ ] **Step 5: 测试边界情况**

- 同一条 AI 回复上多次划词追问（各自独立）
- Popover 在页面底部时翻转到上方
- 打开新追问时旧 Popover 自动关闭
- 删除 Chat 时 Thread/Quote 数据正确级联删除
- 代码块内文字不触发追问

- [ ] **Step 6: Commit**

修复发现的问题后提交：

```bash
git add -A
git commit -m "fix: address edge cases in follow-up popover interaction"
```

---

## 范围外备注（不在本次实施中）

以下功能在 UI 设计文档中有描述，但属于后续迭代范围，本次不实现：

- **移动端适配**（设计文档第七节）：Bottom sheet 形态、长按选择、虚拟键盘适配。v1 先保证桌面端体验，移动端适配作为独立任务单独规划。
- **锚点 hover tooltip 预览**（设计文档第四节）：hover 时显示第一轮 Q&A 摘要。v1 先实现基础的 hover 视觉变化（虚线→实线），tooltip 内容预览后续迭代。
