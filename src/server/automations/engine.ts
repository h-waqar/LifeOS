import { eq, and, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  automations,
  automationRuns,
  type Automation,
  type AutomationRun,
} from "@/server/db/schema";
import {
  eventBus,
  type EventBus,
  type AnyDomainEvent,
  type UnsubscribeFn,
  runWithEventContext,
} from "@/server/events";
import { createAuditLog } from "@/server/audit";
import { evaluateConditionGroup } from "./condition-evaluator";
import { executeAction } from "./action-executor";
import {
  type AutomationRunDTO,
  type ConditionsConfig,
  MaxDepthExceededError,
} from "./types";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Automation Engine cannot be initialized in the browser."
  );
}

export const MAX_AUTOMATION_DEPTH = 3;

export function mapAutomationRunToDTO(row: AutomationRun): AutomationRunDTO {
  return {
    id: row.id,
    userId: row.userId,
    automationId: row.automationId,
    triggerEvent: row.triggerEvent,
    status: row.status as "success" | "failed" | "skipped",
    executionDurationMs: row.executionDurationMs,
    contextSnapshot: (row.contextSnapshot as Record<string, unknown>) ?? {},
    actionOutput: (row.actionOutput as Record<string, unknown>) ?? {},
    errorMessage: row.errorMessage ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Core Automation Rule Engine.
 * Listens to domain events, filters active rules by user & trigger topic,
 * evaluates condition groups deterministically, executes bounded domain actions,
 * and maintains immutable execution run telemetry in PostgreSQL.
 */
export class AutomationEngine {
  private isSubscribed = false;
  private unsubscribeFn: UnsubscribeFn | null = null;

  /**
   * Starts listening to domain events on the provided EventBus instance.
   */
  start(bus: EventBus = eventBus): void {
    if (this.unsubscribeFn) {
      this.unsubscribeFn();
      this.unsubscribeFn = null;
    }

    this.unsubscribeFn = bus.subscribeAll(async (event) => {
      try {
        await this.handleDomainEvent(event);
      } catch (err) {
        console.error(
          `[AutomationEngine] Uncaught error handling event "${event?.name}":`,
          err
        );
      }
    });

    this.isSubscribed = true;
  }

  /**
   * Unsubscribes from the EventBus.
   */
  stop(): void {
    if (this.unsubscribeFn) {
      this.unsubscribeFn();
      this.unsubscribeFn = null;
    }
    this.isSubscribed = false;
  }

  /**
   * Processes a single domain event through the automation pipeline.
   * Scoped strictly to the event's authenticated userId.
   */
  async handleDomainEvent(event: AnyDomainEvent): Promise<AutomationRunDTO[]> {
    if (!event || !event.userId || !event.name) {
      return [];
    }

    const { userId, name: eventName } = event;
    const depth = event.metadata?.depth ?? 0;
    const results: AutomationRunDTO[] = [];

    // 1. Recursion & Cascade Defense: Guard against infinite loops (depth >= 3)
    if (depth >= MAX_AUTOMATION_DEPTH) {
      try {
        await createAuditLog({
          userId,
          category: "security",
          action: "automation.max_depth_exceeded",
          status: "failure",
          actor: `user:${userId}`,
          details: {
            eventName,
            depth,
            maxDepth: MAX_AUTOMATION_DEPTH,
            eventId: event.id,
            correlationId: event.metadata?.correlationId,
            error: "MAX_DEPTH_EXCEEDED",
          },
        });
      } catch (auditErr) {
        console.error(
          "[AutomationEngine] Failed to write recursion limit audit log:",
          auditErr
        );
      }

      // Query rules that would have matched and record run rows marking them failed
      const matchingActive = await db
        .select()
        .from(automations)
        .where(
          and(
            eq(automations.userId, userId),
            eq(automations.isActive, true),
            eq(automations.triggerType, "event"),
            sql`${automations.triggerConfig}->>'eventName' = ${eventName}`
          )
        );

      for (const rule of matchingActive) {
        const [run] = await db
          .insert(automationRuns)
          .values({
            userId,
            automationId: rule.id,
            triggerEvent: eventName,
            status: "failed",
            executionDurationMs: 0,
            contextSnapshot: (event.payload as Record<string, unknown>) ?? {},
            actionOutput: {},
            errorMessage: "MAX_DEPTH_EXCEEDED",
          })
          .returning();

        results.push(mapAutomationRunToDTO(run));
      }

      return results;
    }

    // 2. Query active event rules for this user matching the event topic
    let matchingRules: Automation[] = [];
    try {
      matchingRules = await db
        .select()
        .from(automations)
        .where(
          and(
            eq(automations.userId, userId),
            eq(automations.isActive, true),
            eq(automations.triggerType, "event"),
            sql`${automations.triggerConfig}->>'eventName' = ${eventName}`
          )
        );
    } catch (queryErr) {
      console.error(
        `[AutomationEngine] Failed querying automations for event "${eventName}":`,
        queryErr
      );
      return [];
    }

    if (matchingRules.length === 0) {
      return [];
    }

    // Build unified context snapshot for condition evaluation and action interpolation
    const contextSnapshot: Record<string, unknown> = {
      ...(event.payload && typeof event.payload === "object" ? event.payload : {}),
      event: {
        id: event.id,
        name: event.name,
        userId: event.userId,
        timestamp: event.timestamp,
        metadata: event.metadata,
      },
      payload: event.payload,
    };

    // 3. Evaluate and execute matching rules
    for (const rule of matchingRules) {
      const run = await this.executeAutomationRule(
        rule,
        contextSnapshot,
        eventName,
        {
          depth,
          correlationId: event.metadata?.correlationId,
          actor: event.metadata?.actor,
        }
      );
      results.push(run);
    }

    return results;
  }

  /**
   * Executes a single automation rule against a given context snapshot and trigger event.
   * Enforces condition evaluation, recursion depth check, canonical action execution,
   * run telemetry logging, execution counter increment, and audit trail creation.
   */
  async executeAutomationRule(
    rule: Automation,
    contextSnapshot: Record<string, unknown>,
    triggerEvent: string,
    options?: { depth?: number; correlationId?: string; actor?: string }
  ): Promise<AutomationRunDTO> {
    const { userId } = rule;
    const depth = options?.depth ?? 0;
    const startTime = performance.now();

    // 1. Recursion & Cascade Defense: Guard against infinite loops (depth >= 3)
    if (depth >= MAX_AUTOMATION_DEPTH) {
      try {
        await createAuditLog({
          userId,
          category: "security",
          action: "automation.max_depth_exceeded",
          status: "failure",
          actor: options?.actor ?? `user:${userId}`,
          details: {
            automationId: rule.id,
            triggerEvent,
            depth,
            maxDepth: MAX_AUTOMATION_DEPTH,
            correlationId: options?.correlationId,
            error: "MAX_DEPTH_EXCEEDED",
          },
        });
      } catch (auditErr) {
        console.error(
          "[AutomationEngine] Failed to write recursion limit audit log:",
          auditErr
        );
      }

      const [run] = await db
        .insert(automationRuns)
        .values({
          userId,
          automationId: rule.id,
          triggerEvent,
          status: "failed",
          executionDurationMs: 0,
          contextSnapshot,
          actionOutput: {},
          errorMessage: "MAX_DEPTH_EXCEEDED",
        })
        .returning();

      return mapAutomationRunToDTO(run);
    }

    // 2. Evaluate conditions
    let conditionsMatch = false;
    try {
      conditionsMatch = evaluateConditionGroup(
        contextSnapshot,
        rule.conditions as ConditionsConfig
      );
    } catch (evalErr) {
      console.error(
        `[AutomationEngine] Error evaluating conditions for rule ${rule.id}:`,
        evalErr
      );
      const durationMs = Math.round(performance.now() - startTime);

      const [failedRun] = await db
        .insert(automationRuns)
        .values({
          userId,
          automationId: rule.id,
          triggerEvent,
          status: "failed",
          executionDurationMs: durationMs,
          contextSnapshot,
          actionOutput: {},
          errorMessage:
            evalErr instanceof Error ? evalErr.message : "Condition evaluation failed",
        })
        .returning();

      return mapAutomationRunToDTO(failedRun);
    }

    // If condition does not match, record skipped run
    if (!conditionsMatch) {
      const durationMs = Math.round(performance.now() - startTime);
      const [skippedRun] = await db
        .insert(automationRuns)
        .values({
          userId,
          automationId: rule.id,
          triggerEvent,
          status: "skipped",
          executionDurationMs: durationMs,
          contextSnapshot,
          actionOutput: {},
          errorMessage: "Conditions did not match event context",
        })
        .returning();

      return mapAutomationRunToDTO(skippedRun);
    }

    // 3. Execute action with ambient event depth increment
    try {
      const actionOutput = await runWithEventContext(
        {
          depth: depth + 1,
          correlationId: options?.correlationId,
          actor: options?.actor ?? `automation:${rule.id}`,
        },
        async () => {
          return await executeAction(
            userId,
            rule.id,
            rule.actionType as any,
            rule.actionConfig as Record<string, unknown>,
            contextSnapshot
          );
        }
      );

      const durationMs = Math.round(performance.now() - startTime);

      // Record successful execution
      const [successRun] = await db
        .insert(automationRuns)
        .values({
          userId,
          automationId: rule.id,
          triggerEvent,
          status: "success",
          executionDurationMs: durationMs,
          contextSnapshot,
          actionOutput: actionOutput ?? {},
          errorMessage: null,
        })
        .returning();

      // Increment execution counter and update lastRunAt
      await db
        .update(automations)
        .set({
          executionCount: sql`${automations.executionCount} + 1`,
          lastRunAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(automations.userId, userId), eq(automations.id, rule.id)));

      // Audit log execution
      try {
        await createAuditLog({
          userId,
          category: "system",
          action: "automation.executed",
          status: "success",
          actor: options?.actor ?? `automation:${rule.id}`,
          details: {
            automationId: rule.id,
            automationName: rule.name,
            triggerEvent,
            actionType: rule.actionType,
            executionDurationMs: durationMs,
          },
        });
      } catch (auditErr) {
        console.error(
          "[AutomationEngine] Non-fatal audit log error on automation.executed:",
          auditErr
        );
      }

      return mapAutomationRunToDTO(successRun);
    } catch (actionErr: any) {
      const durationMs = Math.round(performance.now() - startTime);
      const isRecursion =
        actionErr?.code === "RECURSION_LIMIT_EXCEEDED" ||
        actionErr?.name === "RecursionLimitError" ||
        actionErr instanceof MaxDepthExceededError ||
        (actionErr?.message && actionErr.message.includes("Recursion limit exceeded"));

      const errorMessage = isRecursion
        ? "MAX_DEPTH_EXCEEDED"
        : actionErr instanceof Error
        ? actionErr.message
        : String(actionErr);

      const [failedRun] = await db
        .insert(automationRuns)
        .values({
          userId,
          automationId: rule.id,
          triggerEvent,
          status: "failed",
          executionDurationMs: durationMs,
          contextSnapshot,
          actionOutput: {},
          errorMessage,
        })
        .returning();

      try {
        await createAuditLog({
          userId,
          category: isRecursion ? "security" : "system",
          action: isRecursion
            ? "automation.max_depth_exceeded"
            : "automation.execution_failed",
          status: "failure",
          actor: options?.actor ?? `automation:${rule.id}`,
          details: {
            automationId: rule.id,
            automationName: rule.name,
            triggerEvent,
            actionType: rule.actionType,
            error: errorMessage,
          },
        });
      } catch (auditErr) {
        console.error(
          "[AutomationEngine] Non-fatal audit log error on automation failure:",
          auditErr
        );
      }

      return mapAutomationRunToDTO(failedRun);
    }
  }

  /**
   * Executes an automation by ID (e.g. for scheduled runs or direct invocation).
   * Verifies user ownership and active state.
   */
  async executeAutomationById(
    userId: string,
    automationId: string,
    triggerEvent: string = "schedule.tick",
    contextSnapshot: Record<string, unknown> = {},
    options?: { depth?: number; correlationId?: string; actor?: string }
  ): Promise<AutomationRunDTO | null> {
    const [rule] = await db
      .select()
      .from(automations)
      .where(and(eq(automations.userId, userId), eq(automations.id, automationId)))
      .limit(1);

    if (!rule || !rule.isActive) {
      return null;
    }

    return this.executeAutomationRule(
      rule,
      contextSnapshot,
      triggerEvent,
      options
    );
  }
}

export const automationEngine = new AutomationEngine();

/**
 * Standalone dispatch function that processes a domain event through the global AutomationEngine.
 */
export async function handleDomainEvent(
  event: AnyDomainEvent
): Promise<AutomationRunDTO[]> {
  return automationEngine.handleDomainEvent(event);
}

/**
 * Standalone dispatch function that executes an automation by ID through the global AutomationEngine.
 */
export async function executeAutomationById(
  userId: string,
  automationId: string,
  triggerEvent: string = "schedule.tick",
  contextSnapshot: Record<string, unknown> = {},
  options?: { depth?: number; correlationId?: string; actor?: string }
): Promise<AutomationRunDTO | null> {
  return automationEngine.executeAutomationById(
    userId,
    automationId,
    triggerEvent,
    contextSnapshot,
    options
  );
}

/**
 * Registers the global AutomationEngine with the specified EventBus instance.
 * Returns an unregister cleanup function.
 */
export function registerAutomationEngine(
  bus: EventBus = eventBus
): () => void {
  automationEngine.start(bus);
  return () => automationEngine.stop();
}

// Auto-register with global eventBus in server runtime
if (typeof window === "undefined") {
  automationEngine.start(eventBus);
}
