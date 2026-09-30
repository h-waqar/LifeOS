import { eq, and, desc, sql, count } from "drizzle-orm";
import { db } from "../db";
import {
  aiConversations,
  aiMessages,
  aiActions,
  type AIConversation,
  type AIMessage,
} from "../db/schema/ai";
import { AuthorizationError } from "../auth/guard";
import type { AIProviderName } from "./types";

export class NotFoundError extends Error {
  readonly status = 404;
  readonly code = "NOT_FOUND";

  constructor(message = "Resource not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export interface CreateConversationInput {
  title?: string;
  provider?: AIProviderName;
  model?: string;
  systemPromptOverride?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateConversationInput {
  title?: string;
  provider?: AIProviderName;
  model?: string;
  systemPromptOverride?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CreateMessageInput {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: any[];
  toolResults?: any[];
  tokenCount?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Creates a new AI conversation thread owned by the authenticated user.
 */
export async function createConversation(
  userId: string,
  input: CreateConversationInput = {}
): Promise<AIConversation> {
  const [created] = await db
    .insert(aiConversations)
    .values({
      userId,
      title: input.title?.trim() || "New Conversation",
      provider: input.provider || "google",
      model: input.model || "gemini-2.5-flash",
      systemPromptOverride: input.systemPromptOverride || null,
      metadata: input.metadata || {},
    })
    .returning();

  return created;
}

/**
 * Retrieves a single conversation by ID with user ownership enforcement.
 */
export async function getConversation(
  userId: string,
  conversationId: string
): Promise<AIConversation> {
  const [row] = await db
    .select()
    .from(aiConversations)
    .where(
      and(
        eq(aiConversations.id, conversationId),
        eq(aiConversations.userId, userId)
      )
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError(
      `Conversation '${conversationId}' not found or access denied.`
    );
  }

  return row;
}

/**
 * Lists conversations for the authenticated user ordered by most recently updated.
 */
export async function listConversations(
  userId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<{ items: AIConversation[]; total: number }> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);

  const [items, totalResult] = await Promise.all([
    db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.userId, userId))
      .orderBy(desc(aiConversations.updatedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ value: count() })
      .from(aiConversations)
      .where(eq(aiConversations.userId, userId)),
  ]);

  return {
    items,
    total: totalResult[0]?.value ?? 0,
  };
}

/**
 * Updates a conversation's title, model, or metadata.
 */
export async function updateConversation(
  userId: string,
  conversationId: string,
  input: UpdateConversationInput
): Promise<AIConversation> {
  // Verify ownership
  await getConversation(userId, conversationId);

  const updates: Partial<typeof aiConversations.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.title !== undefined) updates.title = input.title.trim();
  if (input.provider !== undefined) updates.provider = input.provider;
  if (input.model !== undefined) updates.model = input.model;
  if (input.systemPromptOverride !== undefined)
    updates.systemPromptOverride = input.systemPromptOverride;
  if (input.metadata !== undefined) updates.metadata = input.metadata;

  const [updated] = await db
    .update(aiConversations)
    .set(updates)
    .where(
      and(
        eq(aiConversations.id, conversationId),
        eq(aiConversations.userId, userId)
      )
    )
    .returning();

  return updated;
}

/**
 * Deletes a conversation and cascades to its messages and pending actions.
 */
export async function deleteConversation(
  userId: string,
  conversationId: string
): Promise<{ success: boolean }> {
  // Verify ownership
  await getConversation(userId, conversationId);

  await db
    .delete(aiConversations)
    .where(
      and(
        eq(aiConversations.id, conversationId),
        eq(aiConversations.userId, userId)
      )
    );

  return { success: true };
}

/**
 * Appends a message to the conversation and updates conversation timestamp.
 */
export async function createMessage(
  userId: string,
  conversationId: string,
  input: CreateMessageInput
): Promise<AIMessage> {
  // Verify conversation ownership
  await getConversation(userId, conversationId);

  const [message] = await db
    .insert(aiMessages)
    .values({
      userId,
      conversationId,
      role: input.role,
      content: input.content ?? "",
      toolCalls: input.toolCalls || null,
      toolResults: input.toolResults || null,
      tokenCount: input.tokenCount || null,
      metadata: input.metadata || {},
    })
    .returning();

  // Update conversation updatedAt
  await db
    .update(aiConversations)
    .set({ updatedAt: new Date() })
    .where(eq(aiConversations.id, conversationId));

  return message;
}

/**
 * Fetches message history for a conversation in chronological order.
 */
export async function listMessages(
  userId: string,
  conversationId: string,
  options: { limit?: number } = {}
): Promise<AIMessage[]> {
  // Verify conversation ownership
  await getConversation(userId, conversationId);

  const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);

  const rows = await db
    .select()
    .from(aiMessages)
    .where(
      and(
        eq(aiMessages.conversationId, conversationId),
        eq(aiMessages.userId, userId)
      )
    )
    .orderBy(aiMessages.createdAt)
    .limit(limit);

  return rows;
}
