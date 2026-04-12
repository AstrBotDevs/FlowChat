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
    parentThreadId: uuid("parentThreadId"),
    sourceQuoteId: uuid("sourceQuoteId"),
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

export const quote = pgTable("Quote", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  sourceThreadId: uuid("sourceThreadId").references(() => thread.id),
  sourceMessageId: uuid("sourceMessageId").notNull(),
  quoteText: text("quoteText").notNull(),
  childThreadId: uuid("childThreadId")
    .notNull()
    .references(() => thread.id),
  isUnlinked: boolean("isUnlinked").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type Quote = InferSelectModel<typeof quote>;

export const threadMessage = pgTable("ThreadMessage", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  threadId: uuid("threadId")
    .notNull()
    .references(() => thread.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type ThreadMessage = InferSelectModel<typeof threadMessage>;
