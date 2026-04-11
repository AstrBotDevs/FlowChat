# 核心逻辑文档：划词追问与上下文拼装 (Core Logic V1.0)

> 适用范围：`AI 学习助手` v1 核心后端逻辑、Prompt 拼装策略、数据结构设计。
>
> 相关文档：
> - [product-prd.md](./product-prd.md)
> - [github-project-setup-plan.md](./github-project-setup-plan.md)

## 一、系统核心理念

本产品的核心交互不是传统的线性一问一答，而是**基于学习场景的树状划词追问**。

用户可以在任何一条 AI 回答中**选中一段文字**，原地开辟新的对话支线，针对局部细节进行下钻深挖。这个过程可以无限嵌套——在追问的回答中继续划词，再次追问。

### 核心架构原则（防上下文爆炸策略）

- **存的时候是"树"**：完整记录所有血缘关系和历史脉络，任何一次划词追问都能追溯到它的来源。
- **发的时候是"短链"**：发送给 LLM 的上下文永远遵循**极简切片**原则——只携带当前 Thread 的对话历史与最直接的一层父级背景，彻底杜绝话题漂移与 Token 浪费。

---

## 二、核心数据结构

底层数据严格按照以下三个实体进行存储与关联，所有查询均通过 ID 进行 O(1) 复杂度的精准匹配。

### 1. 消息体 (Message)

最基础的内容单元，记录"谁说了什么"。

```typescript
type Message = {
  id: string;
  threadId: string;          // 归属的 Thread
  role: 'user' | 'assistant';
  content: string;
  createdAt: timestamp;      // 用于排序和截取时间线
};
```

### 2. 引用锚点 (Quote)

记录用户从哪条回答中划词、划了什么、因此诞生了哪个新 Thread。

```typescript
type Quote = {
  id: string;
  sourceThreadId: string;    // 从哪个父级 Thread 划的词
  sourceMessageId: string;   // 被划词的那条 AI 回答的 ID
  quoteText: string;         // 用户选中的具体文字
  childThreadId: string;     // 因为这次划词诞生的新 Thread
};
```

### 3. 会话线程 (Thread)

记录对话的分支结构，是上下文拼装的核心调度单元。

```typescript
type Thread = {
  id: string;
  parentThreadId: string | null;  // null 表示最顶层主线
  sourceQuoteId: string | null;   // 如果由划词产生，此字段有值
};
```

### 实体关系总结

```
Thread (主线, parentThreadId=null, sourceQuoteId=null)
  └── Message[] (主线的对话消息)
        └── Quote (用户在某条 assistant Message 上划词)
              └── Thread (子线, parentThreadId=主线ID, sourceQuoteId=该Quote的ID)
                    └── Message[] (子线的对话消息)
                          └── Quote (在子线的某条回答上再次划词)
                                └── Thread (孙线, 继续嵌套...)
```

---

## 三、Prompt 拼装策略

系统通过判断当前 Thread 的 `sourceQuoteId` 是否有值，自动路由到不同的 Prompt 拼装策略。

### 场景一：主线对话

**触发条件**：`parentThreadId` 为 `null`（最顶层主线）。

**拼装逻辑**：携带通用 System Prompt，加载当前 Thread 的全部历史消息（可按需做滑动窗口限制）。

```json
[
  { "role": "system", "content": "你是一个专注的 AI 学习助手..." },
  { "role": "user", "content": "主线历史问题 1" },
  { "role": "assistant", "content": "主线历史回答 1" },
  { "role": "user", "content": "当前新问题" }
]
```

### 场景二：划词追问（无论嵌套多少层）

**触发条件**：当前 Thread 的 `sourceQuoteId` 有值。

**数据提取（3 次 ID 查询）**：

1. 通过 `sourceQuoteId` 拿到 `quoteText`（划中的字）和 `sourceMessageId`。
2. 通过 `sourceMessageId` 拿到上一层的完整 AI 回答（核心背景）。
3. 获取当前 Thread 内的历史消息。

**拼装结构**：

```json
[
  {
    "role": "system",
    "content": "你是一个专注的 AI 学习助手。请结合上一段解释的语境，聚焦回答用户的当前问题，保持清晰、易懂的教学风格。"
  },
  {
    "role": "user",
    "content": "【这是你上一轮的解释】：\n{通过 sourceMessageId 查到的完整回答}"
  },
  {
    "role": "user",
    "content": "【用户在上面的解释中选中了】：\n『{quoteText}』\n\n【用户的追问】：\n{当前用户的新问题}"
  }
]
```

**关键约束：系统只看直接父级，坚决不向更上层追溯。**

这意味着：如果用户在第 3 层追问中继续划词进入第 4 层，第 4 层的上下文只包含第 3 层被划词的那条回答和划中的文字，不会携带第 2 层或第 1 层的任何内容。

### 场景二续：划词追问内的连续对话

当用户在同一个追问 Thread 内继续提问（不再划词，只是在追问框里继续聊），拼装逻辑为：

```json
[
  {
    "role": "system",
    "content": "你是一个专注的 AI 学习助手。请结合上一段解释的语境，聚焦回答用户的当前问题，保持清晰、易懂的教学风格。"
  },
  {
    "role": "user",
    "content": "【这是你上一轮的解释】：\n{通过 sourceMessageId 查到的完整回答}"
  },
  {
    "role": "user",
    "content": "【用户在上面的解释中选中了】：\n『{quoteText}』\n\n【用户的追问】：\n{第一轮追问}"
  },
  { "role": "assistant", "content": "{第一轮追问的回答}" },
  { "role": "user", "content": "{第二轮追问}" },
  { "role": "assistant", "content": "{第二轮追问的回答}" },
  { "role": "user", "content": "{当前新问题}" }
]
```

父级背景（完整回答 + 划中文字）始终固定在上下文头部，当前 Thread 内的多轮对话依次追加在后面。

---

## 四、多层嵌套追问示例

以下用一个具体场景说明 3 层嵌套时各层的上下文范围。

### 场景描述

1. 用户在主线问："什么是机器学习？"
2. AI 回答了一段解释（Message-A）
3. 用户在 Message-A 中划选"梯度下降"，追问"梯度下降具体怎么工作？"→ 进入 Thread-2
4. AI 在 Thread-2 中回答了梯度下降的解释（Message-B）
5. 用户在 Message-B 中划选"学习率"，追问"学习率怎么选？"→ 进入 Thread-3

### 各层上下文范围

**Thread-1（主线）发送给 LLM 的内容**：

```
[System Prompt]
+ Thread-1 内的全部历史消息
```

**Thread-2 发送给 LLM 的内容**：

```
[System Prompt]
+ Message-A 的完整内容（父级背景）
+ 划中的文字："梯度下降"
+ Thread-2 内的全部历史消息
```

不包含 Thread-1 的其他消息。

**Thread-3 发送给 LLM 的内容**：

```
[System Prompt]
+ Message-B 的完整内容（父级背景）
+ 划中的文字："学习率"
+ Thread-3 内的全部历史消息
```

不包含 Thread-2 的其他消息，更不包含 Thread-1 的任何内容。

---

## 五、边界处理

### 1. 极长会话截断（Token 保护）

对于任何一个单独的 Thread，如果其内部的 Message 数量超过阈值（如 20 轮），系统仅保留最近的 N 轮记录。

由于划词追问的存在，用户很少会在单一 Thread 内无限聊下去，因此简单的滑动窗口（Sliding Window）即可满足。

截断时需要注意：划词追问 Thread 头部的"父级背景 + 划中文字"属于固定上下文，不参与滑动窗口的截断计算。

### 2. 嵌套层级

支持无限嵌套。用户在第 N 层追问的回答中继续划词，进入第 N+1 层，逻辑始终按照场景二的 3 次 ID 查询进行拼装，底层结构自洽，不会死锁或死循环。

### 3. 同一条回答上的多次划词

同一条 AI 回答可以被多次划词，每次划词产生独立的 Quote 和独立的子 Thread。它们之间互不干扰，各自维护自己的对话历史。

---

## 六、设计决策备忘

| 决策 | 选择 | 理由 |
|------|------|------|
| 上下文追溯深度 | 仅直接父级（1 层） | 防止 Token 爆炸，保持回复聚焦 |
| 父级背景内容 | 完整的被划词消息 + 划中文字 | 给 LLM 足够语境理解追问意图 |
| 嵌套层级限制 | 无硬限制 | 数据结构天然支持，每层独立短链 |
| 会话截断策略 | 滑动窗口，保留最近 N 轮 | 简单有效，父级背景不参与截断 |
| 同一消息多次划词 | 各自独立 Thread | 互不干扰，结构清晰 |
