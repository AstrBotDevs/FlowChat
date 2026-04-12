# 数据库结构说明与优化备忘

> 更新时间：2026-04-12
> 适用范围：`lib/db/schema.ts` + `lib/db/schema-thread.ts`

---

## 一、Drizzle 使用方式（早期开发）

项目使用 **Drizzle ORM** 管理数据库，当前处于早期开发阶段，采用 `push` 模式直接同步 schema 到数据库，**不使用迁移文件**。

### 日常工作流

```bash
# 修改 schema 后，直接推送到数据库（会自动 diff 并执行 DDL）
pnpm db:push

# 可视化查看/编辑数据库
pnpm db:studio
```

### 注意事项

- `db:push` 会自动对比 schema 与数据库的差异并执行变更，**破坏性变更（如删列、改类型）会导致数据丢失**，早期开发阶段可以接受。
- Schema 定义是唯一的数据库结构真相来源（Single Source of Truth），所有表结构修改都在 `schema.ts` / `schema-thread.ts` 中进行。
- `drizzle.config.ts` 中 `schema` 字段指向 `./lib/db/schema.ts`，该文件通过 re-export 引入了 `schema-thread.ts` 中的表定义，Drizzle 会自动识别。

### 何时切换到迁移模式

当产品进入正式运营、有了真实用户数据后，应切换为迁移模式：

```bash
# 生成迁移文件
pnpm db:generate

# 执行迁移
pnpm db:push  # 或编写 migrate 脚本
```

届时需要在 `package.json` 中恢复 `db:generate` / `db:migrate` 等脚本。

---

## 二、当前表结构总览（11 张表）

### 基础设施层

| 表 | 用途 |
|---|---|
| **User** | 用户账号（邮箱密码 + 匿名 + OAuth） |
| **UserProvider** | 用户自带的 LLM API Key 配置 |

### 主线对话层

| 表 | 用途 |
|---|---|
| **Chat** | 一次完整的对话会话 |
| **Message** | 主线对话消息，`parts: json` 存储 AI SDK 的 UIMessage 结构 |
| **Vote** | 用户对主线消息的点赞/踩 |
| **Stream** | 流式响应的可恢复流状态追踪 |

### 划词追问层（Thread 体系）

| 表 | 用途 |
|---|---|
| **Thread** | 对话线程节点，支持树状嵌套（`parentThreadId` 自引用） |
| **Quote** | 划词引用锚点，记录"从哪条消息划了什么词" |
| **ThreadMessage** | 线程内的对话消息 |

### 文档制品层（上游模板遗留，暂未使用）

| 表 | 用途 |
|---|---|
| **Document** | AI 生成的文档/代码/图片等制品 |
| **Suggestion** | 对 Document 的修改建议 |

---

## 三、待优化项

### 优先级 P0：ThreadMessage 对齐 AI SDK 消息格式

**现状**：`ThreadMessage` 使用 `content: text` 存储纯文本，而主线 `Message` 使用 `parts: json` + `attachments: json` 存储 AI SDK 的 UIMessage 结构。

**问题**：这导致线程对话被锁死在"纯文本问答"的能力天花板上，无法获得：
- 工具调用（tool-call / tool-result）
- 推理过程展示（reasoning）
- 附件支持
- 可恢复流（resumable stream）
- 与主线共用消息渲染组件

**改造方案**：

1. **Schema**：`ThreadMessage` 的 `content: text` 改为 `parts: json` + `attachments: json`

```typescript
// schema-thread.ts 改造后
export const threadMessage = pgTable("ThreadMessage", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  threadId: uuid("threadId").notNull().references(() => thread.id),
  role: varchar("role").notNull(),
  parts: json("parts").notNull(),
  attachments: json("attachments").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});
```

2. **后端 API**（`app/(chat)/api/thread/route.ts`）：
   - 用 `createUIMessageStream` + `createUIMessageStreamResponse` 替代手写 SSE
   - 保留 `buildThreadPrompt` 的定制 Prompt 拼装逻辑

3. **前端 Hook**（`hooks/use-thread-chat.ts`）：
   - 可改用 AI SDK 的 `useChat` hook（传 `api: "/api/thread"`）
   - 或至少对齐消息数据结构为 `UIMessage` 格式

4. **渲染层**：线程内消息可直接复用主线的 `<Message>` 组件

### 优先级 P1：清理上游模板遗留表

**Document** 和 **Suggestion** 表是上游 Vercel AI Chatbot 模板的文档制品功能，FlowChat 的核心场景是划词追问，暂时用不到。可以考虑：
- 从 schema 中移除这两张表
- 同步清理相关的 queries、API routes、前端组件

### 优先级 P2：Quote.sourceMessageId 的类型安全

**现状**：`Quote.sourceMessageId` 没有外键约束，因为它可能指向 `Message`（主线）或 `ThreadMessage`（线程）。

**潜在改进**：如果 ThreadMessage 对齐了 Message 的格式（P0 完成后），可以考虑：
- 添加一个 `sourceMessageType: 'main' | 'thread'` 字段，显式标记来源类型
- 或在应用层通过 `sourceThreadId` 是否为 null 来推断（当前方案，已经够用）
