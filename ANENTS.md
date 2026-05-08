# FlowChat Agent 指南

本文件给在本仓库工作的 AI agent 使用。优先遵守用户当前指令；当指令没有覆盖时，按这里的项目约定执行。

## 项目定位

FlowChat 是一个以“理解、追问、连续阅读”为核心的 AI 学习型聊天产品。不要把它当成通用聊天模板或内容创作工作台来扩展。

核心体验是：

- 用户阅读 AI 回答时，可以选中局部文本发起原位追问。
- 追问通过轻量浮层承接，不打断主线阅读。
- 追问与原文锚点、父子 Thread、Quote 关系绑定。
- 发给 LLM 的上下文遵循“存的时候是树，发的时候是短链”：只携带当前 Thread 历史和直接父级背景，避免向更上层无限追溯。

涉及产品判断时，先读：

- `README.md`
- `docs/product-prd.md`
- `docs/core-logic.md`
- `docs/inline-popover-design.md`
- `DESIGN.md`

## 技术栈

- Next.js 16 App Router，React 19，TypeScript strict。
- 包管理器固定为 `pnpm`，不要改用 npm/yarn。
- AI SDK v6，用户自带 Provider Key，支持 OpenAI-compatible、Anthropic、Google。
- Drizzle ORM + PostgreSQL。
- 样式以 Tailwind CSS 4、Radix UI、lucide-react 和项目内组件为主。
- 代码质量工具为 Ultracite/Biome。
- E2E 使用 Playwright。

## 常用命令

```bash
pnpm dev
pnpm build
pnpm check
pnpm fix
pnpm test
pnpm db:generate
pnpm db:migrate
pnpm db:push
pnpm db:studio
```

说明：

- 提交前至少运行与改动相关的检查；通用检查优先用 `pnpm check`。
- 改动聊天主流程、线程/Quote、API route 或持久化逻辑时，优先跑 `pnpm test` 或相关 Playwright case。
- 数据库 schema 改动后，使用 Drizzle 命令生成/检查迁移，不要手写随机 SQL 后不更新 schema。

## 目录职责

- `app/(chat)`：聊天主界面、聊天布局、聊天相关 API route。
- `app/(auth)`：认证页面、NextAuth 配置和 auth action。
- `components`：React UI 组件；`components/ai-elements` 多为 AI 界面基础组件。
- `hooks`：聊天、滚动、选区、线程可见性等客户端状态逻辑。
- `lib/ai`：模型注册、Provider 解析、Prompt、工具调用和 entitlement。
- `lib/db`：Drizzle schema、查询函数、迁移。
- `artifacts`：文档、代码、图片、表格 artifact 的客户端/服务端实现。
- `tests`：Playwright E2E、页面对象、测试工具。
- `docs`：产品、设计、核心逻辑和实施计划。

## 核心数据模型

主聊天历史仍使用 `Chat`、`Message`、`Vote`、`Stream` 等表。

划词追问相关模型在 `lib/db/schema-thread.ts`：

- `Thread`：一次对话分支，绑定 `chatId`，可指向 `parentThreadId` 和 `sourceQuoteId`。
- `Quote`：记录从哪条回答中划了什么文本，以及它创建的 `childThreadId`。
- `ThreadMessage`：某个 Thread 内的消息历史。

修改这些模型时必须同步检查：

- `lib/db/schema.ts` 的导出。
- `lib/db/queries-thread.ts` 和相关 API route。
- `docs/core-logic.md` 是否仍准确。
- 现有迁移是否需要新增迁移。

## AI 与上下文约束

处理聊天请求时，不要随意扩大上下文范围。

- 主线对话：使用当前主线历史。
- 划词追问：只拼接直接父级被划词的 assistant 回答、`quoteText`、当前 Thread 历史。
- 多层嵌套追问：不要把祖父级或更早的 Thread 历史塞进当前请求。
- 同一追问 Thread 内继续对话时，父级背景固定在上下文头部，当前 Thread 消息按时间追加。

Provider 逻辑在 `lib/ai/providers.ts` 和 `lib/ai/provider-registry.ts`。不要硬编码某个模型服务商；优先沿用现有 provider 配置和用户级 API key 查询。

## UI 与交互约定

本项目的视觉方向参考 `DESIGN.md`：克制、清晰、偏 Vercel 风格。做 UI 改动时：

- 保持主线阅读区安静，不用装饰性背景、浮夸渐变或营销页式 hero。
- 原位追问浮层要轻、近、稳，不能遮挡正在阅读的主要内容。
- 交互控件优先用已有组件、Radix UI 和 lucide-react 图标。
- 保持可访问性：键盘焦点、按钮语义、表单状态和错误提示要完整。
- 移动端布局必须可用，尤其是选区、弹层定位、输入框和滚动恢复。

## 代码风格

- TypeScript 使用 strict 约束，尽量避免扩大 `any`。
- 使用 `@/` 路径别名。
- 优先复用现有 hooks、query helper、utility 和组件模式。
- 不做无关重构，不改无关格式。
- 不把业务逻辑塞进组件深处；跨 route 或跨组件复用的逻辑放到 `lib` 或 `hooks`。
- 服务端代码不要引入浏览器-only API；客户端组件需要显式 `"use client"`。
- 不提交真实密钥。`.env` 只在本地使用，新增变量要同步 `.env.example`。

## 数据库与迁移

- Schema 源头是 `lib/db/schema.ts` 和 `lib/db/schema-thread.ts`。
- 迁移目录是 `lib/db/migrations`。
- 改表结构后运行 Drizzle 相关命令，并确认生成的迁移与预期一致。
- 引用关系要保持清晰；Thread/Quote 的父子关系不要用纯文本字段替代。

## 测试策略

根据改动范围选择验证：

- 纯文档改动：通常无需运行测试。
- UI/交互改动：运行相关 Playwright 测试，必要时启动 `pnpm dev` 做浏览器验证。
- API/DB/AI 上下文改动：优先补或更新测试，再运行 `pnpm test`。
- Lint/格式问题：运行 `pnpm check`，需要自动修复时运行 `pnpm fix`。

测试环境中 AI provider 可能走 `lib/ai/models.mock.ts`，不要让测试依赖真实外部模型调用。

## 改动边界

- 不要把 FlowChat 改回通用 chatbot 的产品方向。
- 不要删除 Artifact、Provider、Auth、历史聊天等已有能力，除非用户明确要求。
- 如果需要生成 commit 信息，必须使用标准 Conventional Commits 格式，例如 `feat(chat): add inline quote follow-up`、`fix(thread): preserve parent context`、`docs: update agent guide`。
- 不要自动 `git push`、删除迁移、重置工作区或覆盖用户未提交改动。
- 遇到不确定的产品行为，优先参考 `docs/product-prd.md` 和 `docs/core-logic.md`，再做最小可逆改动。
