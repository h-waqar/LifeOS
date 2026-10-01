/**
 * Central Zero-Trust Agent Safety Boundary
 *
 * All agent-originated operations pass through this boundary before reaching
 * canonical domain services.
 *
 * Pipeline:
 * 1. Caller anti-spoofing assertion
 * 2. Operation classification (5-tier capability)
 * 3. Zero-trust financial shield enforcement
 * 4. Multi-tier permission evaluation & denial-by-default
 * 5. Mandatory HITL challenge creation / verification for DESTRUCTIVE and SENSITIVE operations
 * 6. Forensic audit trail attribution with secret scrubbing
 * 7. Canonical domain delegation
 */

import { assertNoCallerSpoofing } from "@/cli/auth";
import { classifyOperation, evaluateAgentPermission } from "./permissions/evaluator";
import { assertFinancialShield, withAgentSafetyContext } from "./finance-shield";
import { createChallenge, consumeChallenge } from "./challenges/challenge-service";
import { logAgentAudit, computeStateDiff } from "./audit/attribution-logger";
import type { AgentSafetyContext } from "./permissions/types";

export interface AgentOperationOptions<TInput extends Record<string, unknown>, TOutput> {
  context: AgentSafetyContext;
  toolName: string;
  operation?: string;
  arguments: TInput;
  challengeId?: string;
  targetUserId: string;
  getBeforeState?: () => Promise<Record<string, unknown> | null>;
  executor: () => Promise<TOutput>;
  getAfterState?: (result: TOutput) => Promise<Record<string, unknown> | null>;
  dbClient?: any;
}

export type AgentOperationResult<TOutput> =
  | {
      status: "EXECUTED";
      data: TOutput;
    }
  | {
      status: "CHALLENGE_REQUIRED";
      challengeId: string;
      operation: string;
      expiresAt: Date;
      message: string;
    };

/**
 * Centrally intercepts, authorizes, gates, and audits an operation.
 */
export async function executeAgentOperation<
  TInput extends Record<string, unknown>,
  TOutput
>(options: AgentOperationOptions<TInput, TOutput>): Promise<AgentOperationResult<TOutput>> {
  const {
    context,
    toolName,
    arguments: args,
    challengeId,
    targetUserId,
    getBeforeState,
    executor,
    getAfterState,
    dbClient,
  } = options;

  const operation = options.operation ?? toolName;
  const startTime = Date.now();

  // 1. Caller Anti-Spoofing Assertion (Phase 11 invariant preserved and extended)
  assertNoCallerSpoofing(args);

  // 2. Classify Operation
  const classification = classifyOperation(operation);

  // 3. Active Financial Shield Assertion (SAFE-03)
  if (classification.isFinancialMutation) {
    if (context.isAgent) {
      try {
        assertFinancialShield(context, operation);
      } catch (shieldError: any) {
        await logAgentAudit(
          {
            userId: targetUserId,
            agentTokenId: context.agent?.id ?? null,
            agentName: context.agent?.name ?? "unknown",
            provider: context.provider ?? context.agent?.provider ?? null,
            sessionId: context.sessionId ?? null,
            toolName,
            capability: classification.capability,
            operation,
            resource: classification.domain,
            arguments: args,
            status: "DENIED",
            durationMs: Date.now() - startTime,
            errorMessage: shieldError.message,
          },
          dbClient
        ).catch(() => {});

        throw shieldError;
      }
    }
  }

  // 4. Permission Evaluation for Agent Callers (SAFE-01)
  if (context.isAgent) {
    if (!context.agent) {
      throw new Error("Agent authorization error: missing agent identity context.");
    }

    const decision = evaluateAgentPermission(context.agent, operation, targetUserId);

    if (!decision.granted) {
      await logAgentAudit(
        {
          userId: targetUserId,
          agentTokenId: context.agent.id,
          agentName: context.agent.name,
          provider: context.provider ?? context.agent.provider,
          sessionId: context.sessionId ?? null,
          toolName,
          capability: classification.capability,
          operation,
          resource: classification.domain,
          arguments: args,
          status: "DENIED",
          durationMs: Date.now() - startTime,
          errorMessage: decision.reason,
        },
        dbClient
      ).catch(() => {});

      throw new Error(`Agent permission denied: ${decision.reason}`);
    }

    // 5. Mandatory HITL Approval Challenge Gate (SAFE-02)
    if (decision.requiresChallenge) {
      if (!challengeId) {
        // High-impact action requires confirmation: create challenge and interrupt
        const challenge = await createChallenge(
          {
            userId: targetUserId,
            agentTokenId: context.agent.id,
            operation,
            capability: classification.capability as "DESTRUCTIVE" | "SENSITIVE",
            resource: classification.domain,
            arguments: args,
            ttlMinutes: 10,
          },
          dbClient
        );

        await logAgentAudit(
          {
            userId: targetUserId,
            agentTokenId: context.agent.id,
            agentName: context.agent.name,
            provider: context.provider ?? context.agent.provider,
            sessionId: context.sessionId ?? null,
            toolName,
            capability: classification.capability,
            operation,
            resource: classification.domain,
            arguments: args,
            challengeId: challenge.id,
            challengeStatus: challenge.status,
            status: "CHALLENGE_CREATED",
            durationMs: Date.now() - startTime,
          },
          dbClient
        ).catch(() => {});

        return {
          status: "CHALLENGE_REQUIRED",
          challengeId: challenge.id,
          operation: challenge.operation,
          expiresAt: challenge.expiresAt,
          message: `High-impact action '${operation}' requires human approval. Challenge created with ID '${challenge.id}'. Awaiting confirmation before execution.`,
        };
      }

      // challengeId IS provided: consume atomically and execute
      let beforeState: Record<string, unknown> | null = null;
      try {
        if (getBeforeState) {
          beforeState = await getBeforeState();
        }
      } catch {}

      try {
        const result = await consumeChallenge(
          {
            challengeId,
            userId: targetUserId,
            agentTokenId: context.agent.id,
            operation,
            arguments: args,
            executor: () => withAgentSafetyContext(context, executor),
          },
          dbClient
        );

        let afterState: Record<string, unknown> | null = null;
        try {
          if (getAfterState) {
            afterState = await getAfterState(result);
          }
        } catch {}

        await logAgentAudit(
          {
            userId: targetUserId,
            agentTokenId: context.agent.id,
            agentName: context.agent.name,
            provider: context.provider ?? context.agent.provider,
            sessionId: context.sessionId ?? null,
            toolName,
            capability: classification.capability,
            operation,
            resource: classification.domain,
            arguments: args,
            challengeId,
            challengeStatus: "CONSUMED",
            status: "EXECUTED",
            beforeState,
            afterState,
            stateDiff: computeStateDiff(beforeState, afterState),
            durationMs: Date.now() - startTime,
          },
          dbClient
        ).catch(() => {});

        return {
          status: "EXECUTED",
          data: result,
        };
      } catch (err: any) {
        await logAgentAudit(
          {
            userId: targetUserId,
            agentTokenId: context.agent.id,
            agentName: context.agent.name,
            provider: context.provider ?? context.agent.provider,
            sessionId: context.sessionId ?? null,
            toolName,
            capability: classification.capability,
            operation,
            resource: classification.domain,
            arguments: args,
            challengeId,
            status: "FAILED",
            durationMs: Date.now() - startTime,
            errorMessage: err.message,
          },
          dbClient
        ).catch(() => {});

        throw err;
      }
    }
  }

  // 6. Ordinary Execution (READ, WRITE, EXECUTE or Non-Agent Human Session)
  let beforeState: Record<string, unknown> | null = null;
  try {
    if (getBeforeState) {
      beforeState = await getBeforeState();
    }
  } catch {}

  try {
    const result = await withAgentSafetyContext(context, executor);

    let afterState: Record<string, unknown> | null = null;
    try {
      if (getAfterState) {
        afterState = await getAfterState(result);
      }
    } catch {}

    if (context.isAgent) {
      await logAgentAudit(
        {
          userId: targetUserId,
          agentTokenId: context.agent?.id ?? null,
          agentName: context.agent?.name ?? "unknown",
          provider: context.provider ?? context.agent?.provider ?? null,
          sessionId: context.sessionId ?? null,
          toolName,
          capability: classification.capability,
          operation,
          resource: classification.domain,
          arguments: args,
          status: "EXECUTED",
          beforeState,
          afterState,
          stateDiff: computeStateDiff(beforeState, afterState),
          durationMs: Date.now() - startTime,
        },
        dbClient
      ).catch(() => {});
    }

    return {
      status: "EXECUTED",
      data: result,
    };
  } catch (err: any) {
    if (context.isAgent) {
      await logAgentAudit(
        {
          userId: targetUserId,
          agentTokenId: context.agent?.id ?? null,
          agentName: context.agent?.name ?? "unknown",
          provider: context.provider ?? context.agent?.provider ?? null,
          sessionId: context.sessionId ?? null,
          toolName,
          capability: classification.capability,
          operation,
          resource: classification.domain,
          arguments: args,
          status: "FAILED",
          durationMs: Date.now() - startTime,
          errorMessage: err.message,
        },
        dbClient
      ).catch(() => {});
    }

    throw err;
  }
}
