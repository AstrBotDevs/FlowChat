# Flow Chat

一个以“理解、追问、连续阅读”为核心的沉浸式 AI Chatbot。
An immersive AI Chatbot focused on in-place follow-up questions and continuous reading.

## 🌐 在线体验

线上体验地址：[https://flow-chat-azure.vercel.app/](https://flow-chat-azure.vercel.app/)

## 🎯 目标产品形态

Flow Chat 致力于将与 AI 的交互从传统的“单线问答”升级为**原位展开的深度认知体验**。

核心特性包括：

- **不打断思考**：阅读时直接选中疑问内容，原位发起探索与追问。
- **轻量追问框**：通过弹出式对话框获得解析，无需跳转页面，不打断当前心流。
- **上下文连贯**：追问完成后无缝回到原文，保留认知锚点以便随时回顾与深挖。

## 🚧 当前状态

本项目目前正在积极开发中。

## 🚀 本地启动

### 环境要求

- Node.js ≥ 20
- pnpm 10（建议通过 [Corepack](https://nodejs.org/api/corepack.html) 启用：`corepack enable`）
- 一个可访问的 PostgreSQL 实例（本地或托管的 Neon、Supabase 等均可）

### 步骤

1. **克隆仓库并进入目录**

   ```bash
   git clone <repo-url>
   cd FlowChat
   ```

2. **安装依赖**

   ```bash
   pnpm install
   ```

3. **配置环境变量**

   复制示例文件并按需调整：

   ```bash
   cp .env.example .env.local
   ```

   关键变量说明：

   - `AUTH_SECRET`：NextAuth 加密密钥，可用 `openssl rand -base64 32` 生成。
   - `POSTGRES_URL`：PostgreSQL 连接串，必填。
   - `NEXT_PUBLIC_APP_URL`：本地默认填 `http://localhost:3000`。
   - `REDIS_URL`、`BLOB_READ_WRITE_TOKEN`：可选，分别用于限流/可恢复流和文件上传。

4. **初始化数据库**

   推送 Drizzle schema 到目标数据库：

   ```bash
   pnpm db:push
   ```

   如需查看数据：`pnpm db:studio`。

5. **启动开发服务器**

   ```bash
   pnpm dev
   ```

   默认访问 [http://localhost:3000](http://localhost:3000)；可通过 `PORT` 环境变量自定义端口。

### 常用脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动 Next.js 开发服务器（Turbopack） |
| `pnpm build` | 生产构建 |
| `pnpm start` | 运行生产构建产物 |
| `pnpm check` / `pnpm fix` | 通过 ultracite/biome 做代码检查与自动修复 |
| `pnpm test` | 运行 Playwright 端到端测试 |
| `pnpm db:generate` / `pnpm db:migrate` | 生成与执行数据库迁移 |