import {
  pgTable,
  text,
  timestamp,
  integer,
  numeric,
  jsonb,
  unique,
  check,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";
import { auditLog } from "./audit";

/**
 * User AI Settings Table
 * Stores per-user provider preference and encrypted API credentials at rest.
 */
export const userAISettings = pgTable(
  "user_ai_settings",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    defaultProvider: text("default_provider").notNull().default("google"),
    defaultModel: text("default_model").notNull().default("gemini-2.5-flash"),
    encryptedGeminiKey: text("encrypted_gemini_key"),
    encryptedAnthropicKey: text("encrypted_anthropic_key"),
    encryptedOpenAIKey: text("encrypted_openai_key"),
    ollamaBaseUrl: text("ollama_base_url"),
    temperature: numeric("temperature", { precision: 3, scale: 2 }).default("0.70"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("user_ai_settings_user_id_unique").on(table.userId),
    unique("user_ai_settings_user_id_id_unique").on(table.userId, table.id),
    index("user_ai_settings_user_id_idx").on(table.userId),
    check(
      "user_ai_settings_provider_check",
      sql`${table.defaultProvider} IN ('google', 'anthropic', 'openai', 'ollama')`
    ),
  ]
);

export const userAISetting = userAISettings;

/**
 * AI Conversations Table
 * Persistent session and thread history for AI assistant chats.
 */
export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New Conversation"),
    provider: text("provider").notNull().default("google"),
    model: text("model").notNull().default("gemini-2.5-flash"),
    systemPromptOverride: text("system_prompt_override"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("ai_conversations_user_id_id_unique").on(table.userId, table.id),
    index("ai_conversations_user_id_created_at_idx").on(table.userId, table.createdAt),
    index("ai_conversations_user_id_idx").on(table.userId),
    check(
      "ai_conversations_provider_check",
      sql`${table.provider} IN ('google', 'anthropic', 'openai', 'ollama')`
    ),
  ]
);

export const aiConversation = aiConversations;

/**
 * AI Messages Table
 * Messages exchanged in a conversation, including tool calls and tool results.
 */
export const aiMessages = pgTable(
  "ai_messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", {
      enum: ["system", "user", "assistant", "tool"],
    }).notNull(),
    content: text("content").notNull().default(""),
    toolCalls: jsonb("tool_calls").$type<any[]>(),
    toolResults: jsonb("tool_results").$type<any[]>(),
    tokenCount: integer("token_count"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("ai_messages_user_id_id_unique").on(table.userId, table.id),
    index("ai_messages_conversation_id_created_at_idx").on(
      table.conversationId,
      table.createdAt
    ),
    index("ai_messages_user_id_idx").on(table.userId),
    check(
      "ai_messages_role_check",
      sql`${table.role} IN ('system', 'user', 'assistant', 'tool')`
    ),
  ]
);

export const aiMessage = aiMessages;

/**
 * AI Actions Table
 * Human-in-the-Loop pending, approved, and executed consequential actions.
 */
export const aiActions = pgTable(
  "ai_actions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    messageId: text("message_id").references(() => aiMessages.id, {
      onDelete: "set null",
    }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),
    riskLevel: text("risk_level", {
      enum: ["low", "consequential", "destructive"],
    }).notNull(),
    status: text("status", {
      enum: ["pending", "approved", "rejected", "executed", "failed", "expired"],
    })
      .notNull()
      .default("pending"),
    parameters: jsonb("parameters").$type<Record<string, unknown>>().notNull(),
    previewData: jsonb("preview_data").$type<Record<string, unknown>>().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    auditLogId: text("audit_log_id").references(() => auditLog.id, {
      onDelete: "set null",
    }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("ai_actions_user_id_id_unique").on(table.userId, table.id),
    index("ai_actions_user_status_expires_idx").on(
      table.userId,
      table.status,
      table.expiresAt
    ),
    index("ai_actions_conversation_id_idx").on(table.conversationId),
    index("ai_actions_user_id_idx").on(table.userId),
    check(
      "ai_actions_risk_level_check",
      sql`${table.riskLevel} IN ('low', 'consequential', 'destructive')`
    ),
    check(
      "ai_actions_status_check",
      sql`${table.status} IN ('pending', 'approved', 'rejected', 'executed', 'failed', 'expired')`
    ),
  ]
);

export const aiAction = aiActions;

export type UserAISettings = typeof userAISettings.$inferSelect;
export type NewUserAISettings = typeof userAISettings.$inferInsert;
export type AIConversation = typeof aiConversations.$inferSelect;
export type NewAIConversation = typeof aiConversations.$inferInsert;
export type AIMessage = typeof aiMessages.$inferSelect;
export type NewAIMessage = typeof aiMessages.$inferInsert;
export type AIAction = typeof aiActions.$inferSelect;
export type NewAIAction = typeof aiActions.$inferInsert;
