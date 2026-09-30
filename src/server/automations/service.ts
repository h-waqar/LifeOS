import { eq, and, desc } from "drizzle-orm";
import { db } from "@/server/db";
import {
  automations,
  automationRuns,
  type Automation,
} from "@/server/db/schema";
import { AuthorizationError } from "@/server/auth/guard";
import { createAuditLog } from "@/server/audit";
import {
  type AutomationDTO,
  type AutomationRunDTO,
  type CreateAutomationInput,
  type UpdateAutomationInput,
  type ListAutomationsOptions,
  type ListRunsOptions,
  type TestAutomationInput,
  type TestAutomationResult,
  type ConditionsConfig,
  createAutomationSchema,
  updateAutomationSchema,
  toggleAutomationSchema,
  testAutomationSchema,
  NotFoundError,
} from "./types";
import { evaluateConditionGroup } from "./condition-evaluator";
import { simulateAction } from "./action-executor";
import { mapAutomationRunToDTO } from "./engine";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Automations service cannot be initialized in the browser."
  );
}

/**
 * Transforms a raw database automation row into an AutomationDTO.
 */
export function mapAutomationToDTO(row: Automation): AutomationDTO {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description ?? null,
    triggerType: row.triggerType as "event" | "schedule" | "threshold",
    triggerConfig: (row.triggerConfig as Record<string, unknown>) ?? {},
    conditions: (row.conditions as ConditionsConfig) ?? [],
    actionType: row.actionType as any,
    actionConfig: (row.actionConfig as Record<string, unknown>) ?? {},
    isActive: row.isActive,
    executionCount: row.executionCount,
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Creates a new automation rule for the authenticated user.
 */
export async function createAutomation(
  userId: string,
  input: CreateAutomationInput
): Promise<AutomationDTO> {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new AuthorizationError("Authenticated user ID is required to create automation.");
  }
  const safeUserId = userId.trim();
  const validated = createAutomationSchema.parse(input);

  const [created] = await db
    .insert(automations)
    .values({
      userId: safeUserId,
      name: validated.name,
      description: validated.description ?? null,
      triggerType: validated.triggerType,
      triggerConfig: validated.triggerConfig,
      conditions: validated.conditions as any,
      actionType: validated.actionType,
      actionConfig: validated.actionConfig,
      isActive: validated.isActive,
      executionCount: 0,
      lastRunAt: null,
    })
    .returning();

  const dto = mapAutomationToDTO(created);

  try {
    await createAuditLog({
      userId: safeUserId,
      category: "mutation",
      action: "automation.created",
      status: "success",
      actor: `user:${safeUserId}`,
      details: {
        automationId: dto.id,
        name: dto.name,
        triggerType: dto.triggerType,
        actionType: dto.actionType,
      },
    });
  } catch (auditErr) {
    console.error("[AutomationService] Non-fatal audit log error:", auditErr);
  }

  return dto;
}

/**
 * Retrieves an automation rule by ID, strictly verifying ownership.
 */
export async function getAutomationById(
  userId: string,
  automationId: string
): Promise<AutomationDTO> {
  if (!userId || !automationId) {
    throw new NotFoundError();
  }
  const safeUserId = userId.trim();
  const safeId = automationId.trim();

  const [row] = await db
    .select()
    .from(automations)
    .where(and(eq(automations.userId, safeUserId), eq(automations.id, safeId)))
    .limit(1);

  if (!row) {
    throw new NotFoundError("Automation not found.");
  }

  return mapAutomationToDTO(row);
}

/**
 * Lists automations belonging to the authenticated user with optional filtering.
 */
export async function listAutomations(
  userId: string,
  options?: ListAutomationsOptions
): Promise<AutomationDTO[]> {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new AuthorizationError("Authenticated user ID is required to list automations.");
  }
  const safeUserId = userId.trim();

  const conditions = [eq(automations.userId, safeUserId)];

  if (options?.triggerType) {
    conditions.push(eq(automations.triggerType, options.triggerType));
  }
  if (options?.isActive !== undefined) {
    conditions.push(eq(automations.isActive, options.isActive));
  }

  const query = db
    .select()
    .from(automations)
    .where(and(...conditions))
    .orderBy(desc(automations.createdAt));

  if (options?.limit) {
    query.limit(options.limit);
  }
  if (options?.offset) {
    query.offset(options.offset);
  }

  const rows = await query;
  return rows.map(mapAutomationToDTO);
}

/**
 * Updates an automation rule owned by the authenticated user.
 */
export async function updateAutomation(
  userId: string,
  automationId: string,
  input: UpdateAutomationInput
): Promise<AutomationDTO> {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new AuthorizationError("Authenticated user ID is required to update automation.");
  }
  const safeUserId = userId.trim();
  const safeId = automationId.trim();
  const validated = updateAutomationSchema.parse(input);

  // Verify existence and ownership
  await getAutomationById(safeUserId, safeId);

  const updates: Record<string, any> = {
    updatedAt: new Date(),
  };

  if (validated.name !== undefined) updates.name = validated.name;
  if (validated.description !== undefined) updates.description = validated.description;
  if (validated.triggerType !== undefined) updates.triggerType = validated.triggerType;
  if (validated.triggerConfig !== undefined) updates.triggerConfig = validated.triggerConfig;
  if (validated.conditions !== undefined) updates.conditions = validated.conditions;
  if (validated.actionType !== undefined) updates.actionType = validated.actionType;
  if (validated.actionConfig !== undefined) updates.actionConfig = validated.actionConfig;
  if (validated.isActive !== undefined) updates.isActive = validated.isActive;

  const [updated] = await db
    .update(automations)
    .set(updates)
    .where(and(eq(automations.userId, safeUserId), eq(automations.id, safeId)))
    .returning();

  const dto = mapAutomationToDTO(updated);

  try {
    await createAuditLog({
      userId: safeUserId,
      category: "mutation",
      action: "automation.updated",
      status: "success",
      actor: `user:${safeUserId}`,
      details: {
        automationId: dto.id,
        name: dto.name,
        updatedFields: Object.keys(updates),
      },
    });
  } catch (auditErr) {
    console.error("[AutomationService] Non-fatal audit log error:", auditErr);
  }

  return dto;
}

/**
 * Enables or disables an automation rule.
 */
export async function toggleAutomation(
  userId: string,
  automationId: string,
  isActive: boolean
): Promise<AutomationDTO> {
  const validated = toggleAutomationSchema.parse({ isActive });
  return updateAutomation(userId, automationId, { isActive: validated.isActive });
}

/**
 * Deletes an automation rule owned by the authenticated user.
 * Cascades to associated automation_runs.
 */
export async function deleteAutomation(
  userId: string,
  automationId: string
): Promise<{ success: true; id: string }> {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new AuthorizationError("Authenticated user ID is required to delete automation.");
  }
  const safeUserId = userId.trim();
  const safeId = automationId.trim();

  // Verify existence and ownership
  const existing = await getAutomationById(safeUserId, safeId);

  await db
    .delete(automations)
    .where(and(eq(automations.userId, safeUserId), eq(automations.id, safeId)));

  try {
    await createAuditLog({
      userId: safeUserId,
      category: "mutation",
      action: "automation.deleted",
      status: "success",
      actor: `user:${safeUserId}`,
      details: {
        automationId: safeId,
        name: existing.name,
      },
    });
  } catch (auditErr) {
    console.error("[AutomationService] Non-fatal audit log error:", auditErr);
  }

  return { success: true, id: safeId };
}

/**
 * Retrieves execution runs for an automation rule owned by the authenticated user.
 */
export async function getAutomationRuns(
  userId: string,
  automationId: string,
  options?: ListRunsOptions
): Promise<AutomationRunDTO[]> {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new AuthorizationError("Authenticated user ID is required to view automation runs.");
  }
  const safeUserId = userId.trim();
  const safeId = automationId.trim();

  // Verify ownership of the automation
  await getAutomationById(safeUserId, safeId);

  const conditions = [
    eq(automationRuns.userId, safeUserId),
    eq(automationRuns.automationId, safeId),
  ];

  if (options?.status) {
    conditions.push(eq(automationRuns.status, options.status));
  }

  const query = db
    .select()
    .from(automationRuns)
    .where(and(...conditions))
    .orderBy(desc(automationRuns.createdAt));

  if (options?.limit) {
    query.limit(options.limit);
  }
  if (options?.offset) {
    query.offset(options.offset);
  }

  const rows = await query;
  return rows.map(mapAutomationRunToDTO);
}

/**
 * Tests an automation rule against a mock event payload without persisting mutations (dry-run).
 */
export async function testAutomationRule(
  userId: string,
  input: TestAutomationInput
): Promise<TestAutomationResult> {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new AuthorizationError("Authenticated user ID is required to test automation.");
  }
  const safeUserId = userId.trim();
  const validated = testAutomationSchema.parse(input);

  let targetRule: {
    triggerType: string;
    triggerConfig: Record<string, unknown>;
    conditions: ConditionsConfig;
    actionType: any;
    actionConfig: Record<string, unknown>;
  };

  if (validated.automationId) {
    targetRule = await getAutomationById(safeUserId, validated.automationId);
  } else if (validated.rule) {
    targetRule = validated.rule;
  } else {
    throw new Error("No rule provided to test.");
  }

  const { mockEvent } = validated;

  // 1. Verify trigger match
  if (targetRule.triggerType === "event") {
    const requiredEvent = String(targetRule.triggerConfig?.eventName ?? "");
    if (requiredEvent && requiredEvent !== mockEvent.name) {
      return {
        matched: false,
        conditionsMet: false,
        actionType: targetRule.actionType,
        interpolatedActionConfig: {},
        message: `Trigger event mismatch: rule expects "${requiredEvent}", got "${mockEvent.name}".`,
      };
    }
  }

  // 2. Build mock context snapshot
  const contextSnapshot: Record<string, unknown> = {
    ...(mockEvent.payload ?? {}),
    event: {
      name: mockEvent.name,
      userId: safeUserId,
      timestamp: new Date().toISOString(),
      metadata: mockEvent.metadata ?? {},
    },
    payload: mockEvent.payload ?? {},
  };

  // 3. Evaluate conditions
  const conditionsMet = evaluateConditionGroup(contextSnapshot, targetRule.conditions);

  if (!conditionsMet) {
    return {
      matched: true,
      conditionsMet: false,
      actionType: targetRule.actionType,
      interpolatedActionConfig: {},
      message: "Trigger event matched, but condition group evaluated to false.",
    };
  }

  // 4. Simulate action interpolation
  const interpolated = simulateAction(
    targetRule.actionType,
    targetRule.actionConfig,
    contextSnapshot
  );

  return {
    matched: true,
    conditionsMet: true,
    actionType: targetRule.actionType,
    interpolatedActionConfig: interpolated,
    message: "Trigger event and condition group matched. Action simulated successfully.",
  };
}

/**
 * Clears all automations for a user. Utility for test teardown.
 */
export async function clearAllAutomations(userId: string): Promise<void> {
  if (!userId) return;
  await db.delete(automations).where(eq(automations.userId, userId));
}
