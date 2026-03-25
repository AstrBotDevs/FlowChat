import type { Thread, ThreadMessage, Quote } from "@/lib/db/thread-types";
import { MOCK_USER_ID } from "./index";

// Stable IDs for demo data
const CHAT_ID = "00000000-0000-4000-8000-000000000010";
const ROOT_THREAD_ID = "00000000-0000-4000-8000-000000000100";
const MICRO_THREAD_ID = "00000000-0000-4000-8000-000000000101";
const PARALLEL_THREAD_ID = "00000000-0000-4000-8000-000000000102";

const MSG_U1 = "00000000-0000-4000-8000-000000001001";
const MSG_A1 = "00000000-0000-4000-8000-000000001002";
const MSG_U2 = "00000000-0000-4000-8000-000000001003";
const MSG_A2 = "00000000-0000-4000-8000-000000001004";
const MSG_MU1 = "00000000-0000-4000-8000-000000001005";
const MSG_MA1 = "00000000-0000-4000-8000-000000001006";
const MSG_PU1 = "00000000-0000-4000-8000-000000001007";
const MSG_PA1 = "00000000-0000-4000-8000-000000001008";
const QUOTE_ID = "00000000-0000-4000-8000-000000002001";

// ── Chats ──────────────────────────────────────────────
export interface MockChat {
  id: string;
  title: string;
  userId: string;
  visibility: "public" | "private";
  createdAt: Date;
}

const mockChats: MockChat[] = [
  {
    id: CHAT_ID,
    title: "量子计算入门",
    userId: MOCK_USER_ID,
    visibility: "private",
    createdAt: new Date("2026-03-20T10:00:00Z"),
  },
];

// ── Threads ────────────────────────────────────────────
const mockThreads: Thread[] = [
  {
    id: ROOT_THREAD_ID,
    chatId: CHAT_ID,
    parentThreadId: null,
    sourceQuoteId: null,
    forkedMessageId: null,
    title: null,
    createdAt: new Date("2026-03-20T10:00:00Z"),
  },
  {
    id: MICRO_THREAD_ID,
    chatId: CHAT_ID,
    parentThreadId: ROOT_THREAD_ID,
    sourceQuoteId: QUOTE_ID,
    forkedMessageId: null,
    title: '显微镜: "量子纠缠"',
    createdAt: new Date("2026-03-20T10:05:00Z"),
  },
  {
    id: PARALLEL_THREAD_ID,
    chatId: CHAT_ID,
    parentThreadId: ROOT_THREAD_ID,
    sourceQuoteId: null,
    forkedMessageId: MSG_A1,
    title: "平行宇宙: 通俗解释",
    createdAt: new Date("2026-03-20T10:10:00Z"),
  },
];

// ── Messages ───────────────────────────────────────────
const mockMessages: ThreadMessage[] = [
  // Root thread messages
  {
    id: MSG_U1,
    threadId: ROOT_THREAD_ID,
    role: "user",
    parts: [{ type: "text", text: "请帮我介绍一下量子计算的基本概念" }],
    attachments: [],
    createdAt: new Date("2026-03-20T10:00:10Z"),
  },
  {
    id: MSG_A1,
    threadId: ROOT_THREAD_ID,
    role: "assistant",
    parts: [
      {
        type: "text",
        text: `量子计算是利用量子力学原理进行信息处理的计算范式。以下是几个核心概念：

**量子比特（Qubit）**
与经典比特只能处于 0 或 1 不同，量子比特可以同时处于 0 和 1 的叠加态。这使得量子计算机能够并行处理大量可能性。

**量子叠加（Superposition）**
一个量子比特可以处于 |0⟩ 和 |1⟩ 的线性组合态 α|0⟩ + β|1⟩，其中 α 和 β 是复数概率振幅。

**量子纠缠（Entanglement）**
两个或多个量子比特之间可以形成一种特殊的关联——量子纠缠。当两个粒子纠缠后，对其中一个的测量会瞬间影响另一个的状态，无论它们相距多远。这是量子计算强大并行性的关键资源。

**量子门（Quantum Gate）**
类似于经典逻辑门，量子门是对量子比特进行操作的基本单元。常见的量子门包括 Hadamard 门（H 门）、CNOT 门和 Pauli 门等。

量子计算的潜在应用包括密码学、药物发现、优化问题和机器学习等领域。`,
      },
    ],
    attachments: [],
    createdAt: new Date("2026-03-20T10:00:20Z"),
  },
  {
    id: MSG_U2,
    threadId: ROOT_THREAD_ID,
    role: "user",
    parts: [{ type: "text", text: "量子计算和经典计算有什么区别？" }],
    attachments: [],
    createdAt: new Date("2026-03-20T10:01:00Z"),
  },
  {
    id: MSG_A2,
    threadId: ROOT_THREAD_ID,
    role: "assistant",
    parts: [
      {
        type: "text",
        text: `量子计算和经典计算在多个层面存在根本性差异：

| 维度 | 经典计算 | 量子计算 |
|------|---------|---------|
| 基本单元 | 比特（0 或 1） | 量子比特（叠加态） |
| 并行性 | 需要多核/多线程 | 天然并行（叠加+纠缠） |
| 算法 | 确定性/概率性 | 概率性（需多次测量） |
| 错误处理 | 成熟的纠错机制 | 量子纠错仍在发展 |
| 擅长问题 | 通用计算 | 特定优化/模拟问题 |

**关键优势场景：**
- **因式分解**：Shor 算法可以在多项式时间内分解大数，威胁 RSA 加密
- **搜索问题**：Grover 算法提供二次加速
- **量子模拟**：模拟分子和材料的量子行为

需要注意的是，量子计算并非要"取代"经典计算，而是在特定问题上提供指数级或多项式级的加速。未来更可能是经典计算和量子计算的混合架构。`,
      },
    ],
    attachments: [],
    createdAt: new Date("2026-03-20T10:01:30Z"),
  },

  // Microscope thread messages (drilling into "量子纠缠")
  {
    id: MSG_MU1,
    threadId: MICRO_THREAD_ID,
    role: "user",
    parts: [{ type: "text", text: '深入解释："量子纠缠"' }],
    attachments: [],
    createdAt: new Date("2026-03-20T10:05:10Z"),
  },
  {
    id: MSG_MA1,
    threadId: MICRO_THREAD_ID,
    role: "assistant",
    parts: [
      {
        type: "text",
        text: `量子纠缠是量子力学中最令人惊叹的现象之一，爱因斯坦曾称之为"鬼魅般的超距作用"（spooky action at a distance）。

**数学描述**
两个量子比特的纠缠态最著名的例子是 Bell 态：
|Φ⁺⟩ = (1/√2)(|00⟩ + |11⟩)

这意味着两个粒子处于一种不可分离的整体状态——你无法单独描述其中任何一个粒子的状态。

**关键特性**
1. **非局域关联**：测量其中一个粒子，另一个粒子的状态会立即确定，无论距离多远
2. **不可克隆**：无法复制未知量子态（量子不可克隆定理）
3. **不传递信息**：虽然关联是瞬时的，但无法用纠缠直接传递经典信息（不违反相对论）

**实验验证**
2022 年诺贝尔物理学奖授予了 Aspect、Clauser 和 Zeilinger，表彰他们通过 Bell 不等式实验验证了量子纠缠的真实性。

**在量子计算中的应用**
- 量子隐形传态（Quantum Teleportation）
- 超密编码（Superdense Coding）
- 量子纠错码
- 量子密钥分发（QKD）`,
      },
    ],
    attachments: [],
    createdAt: new Date("2026-03-20T10:05:20Z"),
  },

  // Parallel universe thread (forking from MSG_A1 with different approach)
  {
    id: MSG_PU1,
    threadId: PARALLEL_THREAD_ID,
    role: "user",
    parts: [{ type: "text", text: "能用更通俗的比喻来解释这些概念吗？" }],
    attachments: [],
    createdAt: new Date("2026-03-20T10:10:10Z"),
  },
  {
    id: MSG_PA1,
    threadId: PARALLEL_THREAD_ID,
    role: "assistant",
    parts: [
      {
        type: "text",
        text: `当然！让我用日常生活中的比喻来解释：

**量子比特 → 旋转的硬币**
经典比特就像一枚放好的硬币——要么正面（1）要么反面（0）。量子比特就像一枚正在旋转的硬币——在你拍停它之前，它"同时"是正面和反面。拍停硬币就是"测量"。

**量子叠加 → 薛定谔的猫**
想象一只猫在箱子里，在你打开箱子之前，它处于"又活又死"的状态。量子比特在测量之前，也处于所有可能状态的混合。

**量子纠缠 → 魔法手套**
想象你有一副手套，随机放进两个盒子寄到世界各地。当你在北京打开盒子看到左手手套，你立刻就知道上海的盒子里是右手手套。量子纠缠类似但更神奇——手套在被看到之前，并不是"已经确定"是左还是右的。

**量子门 → 魔法转盘**
量子门就像一个魔法转盘，可以让旋转的硬币改变旋转方式。不同的转盘（门）让硬币以不同角度和速度旋转，从而实现不同的计算。

希望这些比喻帮助你建立直觉！真实的量子力学当然要复杂得多，但核心思想就是这样。`,
      },
    ],
    attachments: [],
    createdAt: new Date("2026-03-20T10:10:20Z"),
  },
];

// ── Quotes ─────────────────────────────────────────────
const mockQuotes: Quote[] = [
  {
    id: QUOTE_ID,
    sourceThreadId: ROOT_THREAD_ID,
    sourceMessageId: MSG_A1,
    quoteText: "量子纠缠",
    childThreadId: MICRO_THREAD_ID,
    createdAt: new Date("2026-03-20T10:05:00Z"),
  },
];

// ── Mock Store (mutable, in-memory) ────────────────────

class MockStore {
  chats: MockChat[] = [...mockChats];
  threads: Thread[] = [...mockThreads];
  messages: ThreadMessage[] = [...mockMessages];
  quotes: Quote[] = [...mockQuotes];

  // Chat queries
  getChatsByUserId(userId: string) {
    return this.chats
      .filter((c) => c.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  getChatById(id: string) {
    return this.chats.find((c) => c.id === id) ?? null;
  }

  // Thread queries
  getThreadsByChatId(chatId: string) {
    return this.threads
      .filter((t) => t.chatId === chatId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  getThreadById(id: string) {
    return this.threads.find((t) => t.id === id) ?? null;
  }

  getRootThread(chatId: string) {
    return (
      this.threads.find(
        (t) => t.chatId === chatId && t.parentThreadId === null
      ) ?? null
    );
  }

  getChildThreads(parentThreadId: string) {
    return this.threads.filter((t) => t.parentThreadId === parentThreadId);
  }

  createThread(data: Omit<Thread, "createdAt">) {
    const thread: Thread = { ...data, createdAt: new Date() };
    this.threads.push(thread);
    return thread;
  }

  // Message queries
  getMessagesByThreadId(threadId: string) {
    return this.messages
      .filter((m) => m.threadId === threadId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  getMessagesByThreadIdUpTo(threadId: string, messageId: string) {
    const messages = this.getMessagesByThreadId(threadId);
    const idx = messages.findIndex((m) => m.id === messageId);
    return idx >= 0 ? messages.slice(0, idx + 1) : messages;
  }

  saveThreadMessage(msg: ThreadMessage) {
    this.messages.push(msg);
    return msg;
  }

  // Quote queries
  getQuotesByMessageId(sourceMessageId: string) {
    return this.quotes.filter((q) => q.sourceMessageId === sourceMessageId);
  }

  createQuote(data: Omit<Quote, "createdAt">) {
    const quote: Quote = { ...data, createdAt: new Date() };
    this.quotes.push(quote);
    return quote;
  }
}

// Singleton instance
export const mockStore = new MockStore();

// Export IDs for use elsewhere
export {
  CHAT_ID as MOCK_CHAT_ID,
  ROOT_THREAD_ID as MOCK_ROOT_THREAD_ID,
};
