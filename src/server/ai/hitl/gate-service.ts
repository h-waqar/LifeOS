import { eq, and } from "drizzle-orm";
import { db } from "@/server/db";
import { aiActions, aiConversations, type AIAction } from "@/server/db/schema/ai";
import { type LifeOSTool, type ToolContext, type ActionPreview, requiresConfirmation } from "../tools/types";
import { createConversation } from "../conversation-service";
import {
  type PendingActionDTO,
  ActionNotFoundError,
  ActionForbiddenError,
  ActionConflictError,
  ActionExpiredError,
} from "./types";
import { eventBus, createDomainEvent, type AnyDomainEvent } from "@/server/events";

export const ACTION_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function mapActionToDTO(row: AIAction): PendingActionDTO {
  return {
    id: row.id,
    conversationId: row.conversationId,
    messageId: row.messageId,
    userId: row.userId,
    toolName: row.toolName,
    riskLevel: row.riskLevel as PendingActionDTO["riskLevel"],
    status: row.status as PendingActionDTO["status"],
    parameters: (row.parameters as Record<string, unknown>) ?? {},
    previewData: (row.previewData as unknown as ActionPreview) ?? { summary: "" },
    expiresAt: row.expiresAt.toISOString(),
    executedAt: row.executedAt ? row.executedAt.toISOString() : null,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface InterceptResult {
  isPending: boolean;
  actionId?: string;
  preview?: ActionPreview;
  result?: unknown;
  message?: string;
}

/**
 * Intercepts tool calls. Consequential and destructive tools generate a pending ai_actions record
 * with a 5-minute TTL. Read-only and draft tools execute immediately.
 */
export async function interceptToolCall(
  ctx: ToolContext,
  tool: LifeOSTool,
  args: unknown
): Promise<InterceptResult> {
  // If tool does not require confirmation or explicit skipHITL is provided
  if (!requiresConfirmation(tool.riskTier) || ctx.skipHITL) {
    const result = await tool.execute(ctx, args);
    return {
      isPending: false,
      result,
    };
  }

  // Generate action preview
  const preview: ActionPreview = tool.previewAction
    ? tool.previewAction(args)
    : { summary: `Execute ${tool.name}` };

  // Determine conversation ID (fallback to existing or create new)
  let convId = ctx.conversationId;
  if (!convId) {
    const [existing] = await db
      .select({ id: aiConversations.id })
      .from(aiConversations)
      .where(eq(aiConversations.userId, ctx.userId))
      .limit(1);

    if (existing) {
      convId = existing.id;
    } else {
      const created = await createConversation(ctx.userId, {
        title: "Assistant Operations",
      });
      convId = created.id;
    }
  }

  const riskLevel: "low" | "consequential" | "destructive" =
    tool.riskTier === "tier4_destructive"
      ? "destructive"
      : tool.riskTier === "tier3_consequential"
      ? "consequential"
      : "low";

  const expiresAt = new Date(Date.now() + ACTION_TTL_MS);

  const [inserted] = await db
    .insert(aiActions)
    .values({
      conversationId: convId,
      messageId: ctx.messageId ?? null,
      userId: ctx.userId,
      toolName: tool.id,
      riskLevel,
      status: "pending",
      parameters: (args as Record<string, unknown>) ?? {},
      previewData: preview as unknown as Record<string, unknown>,
      expiresAt,
    })
    .returning();

  return {
    isPending: true,
    actionId: inserted.id,
    preview,
    message: `Action requires confirmation before execution. Please confirm: "${preview.summary}".`,
  };
}

/**
 * Retrieves a pending or historical action by ID with tenant authorization and auto-expiration.
 */
export async function getActionById(
  userId: string,
  actionId: string
): Promise<PendingActionDTO> {
  const [row] = await db
    .select()
    .from(aiActions)
    .where(eq(aiActions.id, actionId));

  if (!row) {
    throw new ActionNotFoundError(`Action "${actionId}" not found`);
  }

  if (row.userId !== userId) {
    throw new ActionForbiddenError("Access denied to requested action");
  }

  // Check TTL expiration
  if (row.status === "pending" && row.expiresAt.getTime() <= Date.now()) {
    const [expiredRow] = await db
      .update(aiActions)
      .set({ status: "expired" })
      .where(eq(aiActions.id, actionId))
      .returning();
    return mapActionToDTO(expiredRow);
  }

  return mapActionToDTO(row);
}

/**
 * Rejects a pending action with an optional reason.
 */
export async function rejectAction(
  userId: string,
  actionId: string,
  reason?: string
): Promise<PendingActionDTO> {
  const pendingEvents: AnyDomainEvent[] = [];
  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(aiActions)
      .where(eq(aiActions.id, actionId))
      .for("update");

    if (!row) {
      throw new ActionNotFoundError(`Action "${actionId}" not found`);
    }

    if (row.userId !== userId) {
      throw new ActionForbiddenError("Access denied to requested action");
    }

    if (
      row.status === "expired" ||
      (row.status === "pending" && row.expiresAt.getTime() <= Date.now())
    ) {
      if (row.status === "pending") {
        await tx
          .update(aiActions)
          .set({ status: "expired" })
          .where(eq(aiActions.id, actionId));
      }
      throw new ActionExpiredError("Action has expired (5-minute TTL exceeded)");
    }

    if (row.status !== "pending") {
      throw new ActionConflictError(`Action is already ${row.status}`);
    }

    const [updated] = await tx
      .update(aiActions)
      .set({
        status: "rejected",
        errorMessage: reason ?? "Rejected by user",
      })
      .where(eq(aiActions.id, actionId))
      .returning();

    pendingEvents.push(
      createDomainEvent("ai.action_rejected", userId, {
        actionId: row.id,
        toolName: row.toolName,
        reason: reason ?? null,
      })
    );

    return mapActionToDTO(updated);
  });

  for (const ev of pendingEvents) {
    void eventBus.publish(ev);
  }

  return result;
}
