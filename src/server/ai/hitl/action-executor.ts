import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { aiActions } from "@/server/db/schema/ai";
import { createAuditLog } from "@/server/audit";
import { getToolById } from "../tools/registry";
import { mapActionToDTO } from "./gate-service";
import {
  type PendingActionDTO,
  ActionNotFoundError,
  ActionForbiddenError,
  ActionConflictError,
  ActionExpiredError,
} from "./types";
import { eventBus, createDomainEvent, type AnyDomainEvent } from "@/server/events";
import { isFinancialMutation, FinancialShieldViolationError } from "@/server/agents/finance-shield";
import { executeAgentOperation } from "@/server/agents/safety-boundary";
import type { AgentSafetyContext } from "@/server/agents/permissions/types";

export interface ConfirmExecutionResult {
  action: PendingActionDTO;
  executionResult: unknown;
}

export interface ActorInfo {
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Validates action status under a pessimistic row lock, executes the domain tool with original
 * persisted parameters, writes an immutable audit record, and marks the action executed.
 */
export async function confirmAndExecuteAction(
  userId: string,
  actionId: string,
  actorInfo?: ActorInfo
): Promise<ConfirmExecutionResult> {
  const pendingEvents: AnyDomainEvent[] = [];
  const result = await db.transaction(async (tx) => {
    // 1. Pessimistic row locking
    const [actionRow] = await tx
      .select()
      .from(aiActions)
      .where(eq(aiActions.id, actionId))
      .for("update");

    if (!actionRow) {
      throw new ActionNotFoundError(`Action "${actionId}" not found`);
    }

    // 2. Strict tenant verification
    if (actionRow.userId !== userId) {
      throw new ActionForbiddenError("Access denied to requested action");
    }

    // 3. Expiration validation (both status === 'expired' or TTL exceeded)
    if (
      actionRow.status === "expired" ||
      (actionRow.status === "pending" && actionRow.expiresAt.getTime() <= Date.now())
    ) {
      if (actionRow.status === "pending") {
        await tx
          .update(aiActions)
          .set({ status: "expired" })
          .where(eq(aiActions.id, actionId));
      }
      throw new ActionExpiredError("Action has expired (5-minute TTL exceeded)");
    }

    // 4. Status validation (Fails closed on replay)
    if (actionRow.status !== "pending") {
      throw new ActionConflictError(
        `Action cannot be confirmed because it is already ${actionRow.status}`
      );
    }

    // 5. Retrieve domain tool definition
    const tool = getToolById(actionRow.toolName);
    if (!tool) {
      throw new Error(`Tool "${actionRow.toolName}" is not registered in LifeOS`);
    }

    // 5b. Strict Phase 13 Financial Shield Enforcement
    if (isFinancialMutation(actionRow.toolName) || actionRow.toolName === "finance_create_transaction") {
      await tx
        .update(aiActions)
        .set({
          status: "failed",
          errorMessage:
            "Financial shield violation: autonomous agent-originated mutations to financial ledgers, accounts, or transactions are strictly prohibited.",
        })
        .where(eq(aiActions.id, actionId));

      throw new FinancialShieldViolationError(
        `Financial shield violation: AI action attempted prohibited financial mutation '${actionRow.toolName}'. All agent mutations to financial ledgers are blocked.`,
        actionRow.toolName
      );
    }

    // 6. Execute domain tool with original database parameters through canonical executeAgentOperation
    const agentContext: AgentSafetyContext = {
      isAgent: true,
      user: {
        id: userId,
      },
      agent: {
        id: `ai-assistant-${userId}`,
        userId,
        name: "AI Assistant",
        tokenPrefix: "ai_assistant...",
        provider: "ai_assistant",
        status: "active",
        expiresAt: null,
        capabilities: new Set(["READ", "WRITE", "EXECUTE", "DESTRUCTIVE"]),
        permissions: [],
      },
      provider: "ai_assistant",
      sessionId: actionRow.conversationId,
    };

    let executionResult: unknown;
    try {
      const opResult = await executeAgentOperation({
        context: agentContext,
        toolName: actionRow.toolName,
        arguments: (actionRow.parameters as Record<string, unknown>) ?? {},
        targetUserId: userId,
        dbClient: tx,
        executor: () =>
          tool.execute(
            {
              userId,
              conversationId: actionRow.conversationId,
              skipHITL: true,
            },
            actionRow.parameters
          ),
      });

      if (opResult.status === "CHALLENGE_REQUIRED") {
        executionResult = { challengeId: opResult.challengeId, message: opResult.message };
      } else {
        executionResult = opResult.data;
      }
    } catch (err: any) {
      const errorMsg = err?.message ?? String(err);
      await tx
        .update(aiActions)
        .set({
          status: "failed",
          errorMessage: errorMsg,
        })
        .where(eq(aiActions.id, actionId));
      throw err;
    }

    // 7. Write immutable audit log entry
    await createAuditLog(
      {
        userId,
        category: "mutation",
        action: "ai.action_confirmed",
        status: "success",
        actor: `user:${userId}`,
        details: {
          actionId: actionRow.id,
          toolName: actionRow.toolName,
          parameters: actionRow.parameters,
          conversationId: actionRow.conversationId,
        },
        ipAddress: actorInfo?.ipAddress,
        userAgent: actorInfo?.userAgent,
      },
      tx
    );

    // 8. Update status to executed
    const [updatedRow] = await tx
      .update(aiActions)
      .set({
        status: "executed",
        executedAt: new Date(),
      })
      .where(eq(aiActions.id, actionId))
      .returning();

    pendingEvents.push(
      createDomainEvent("ai.action_confirmed", userId, {
        actionId: actionRow.id,
        toolName: actionRow.toolName,
        parameters: (actionRow.parameters as Record<string, unknown>) ?? {},
      })
    );

    return {
      action: mapActionToDTO(updatedRow),
      executionResult,
    };
  });

  for (const ev of pendingEvents) {
    void eventBus.publish(ev);
  }

  return result;
}
