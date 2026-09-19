import { z } from "zod";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import {
  goals,
  projects,
  tasks,
  projectMilestones,
  type Goal,
  type Project,
  type Task,
} from "@/server/db/schema";
import { AuthorizationError } from "@/server/auth/guard";
import { createAuditLog } from "@/server/audit";
import {
  calculateGoalProgress,
  calculateProjectProgress,
  type GoalMetricType,
} from "./rollup";
import type {
  GoalDTO,
  GoalHorizon,
  LifeArea,
  GoalStatus,
  Priority,
} from "@/types";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Goals service cannot be initialized in the browser."
  );
}

export class NotFoundError extends Error {
  readonly status = 404;
  readonly code = "NOT_FOUND";

  constructor(message = "Resource not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class InvariantViolationError extends Error {
  readonly status = 400;
  readonly code = "INVARIANT_VIOLATION";

  constructor(message: string) {
    super(message);
    this.name = "InvariantViolationError";
  }
}

export const createGoalSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Goal title cannot be empty or whitespace")
      .max(255, "Goal title cannot exceed 255 characters"),
    description: z
      .string()
      .trim()
      .max(4000, "Goal description cannot exceed 4000 characters")
      .nullish(),
    horizon: z
      .enum(["long_term", "medium_term", "short_term"])
      .optional()
      .default("medium_term"),
    area: z
      .enum([
        "health",
        "career",
        "finance",
        "personal_development",
        "relationships",
        "general",
      ])
      .optional()
      .default("general"),
    status: z
      .enum(["not_started", "in_progress", "completed", "paused", "archived"])
      .optional()
      .default("in_progress"),
    priority: z
      .enum(["low", "medium", "high", "critical"])
      .optional()
      .default("medium"),
    metricType: z
      .enum(["none", "numeric", "currency", "boolean", "percentage"])
      .optional()
      .default("none"),
    targetValue: z.number().nullish(),
    currentValue: z.number().nullish().default(0),
    unit: z.string().trim().max(50).nullish(),
    startDate: z
      .string()
      .datetime({ message: "startDate must be a valid ISO 8601 date string" })
      .nullish(),
    targetDate: z
      .string()
      .datetime({ message: "targetDate must be a valid ISO 8601 date string" })
      .nullish(),
    parentGoalId: z.string().trim().min(1).nullish(),
    userId: z
      .never({ message: "Client cannot specify userId in payload" })
      .optional(),
    id: z.never({ message: "Client cannot specify id in payload" }).optional(),
  })
  .strict();

export type CreateGoalInput = z.input<typeof createGoalSchema>;

export const updateGoalSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Goal title cannot be empty or whitespace")
      .max(255, "Goal title cannot exceed 255 characters")
      .optional(),
    description: z
      .string()
      .trim()
      .max(4000, "Goal description cannot exceed 4000 characters")
      .nullish(),
    horizon: z.enum(["long_term", "medium_term", "short_term"]).optional(),
    area: z
      .enum([
        "health",
        "career",
        "finance",
        "personal_development",
        "relationships",
        "general",
      ])
      .optional(),
    status: z
      .enum(["not_started", "in_progress", "completed", "paused", "archived"])
      .optional(),
    priority: z.enum(["low", "medium", "high", "critical"]).optional(),
    metricType: z
      .enum(["none", "numeric", "currency", "boolean", "percentage"])
      .optional(),
    targetValue: z.number().nullish(),
    currentValue: z.number().nullish(),
    unit: z.string().trim().max(50).nullish(),
    startDate: z
      .string()
      .datetime({ message: "startDate must be a valid ISO 8601 date string" })
      .nullish(),
    targetDate: z
      .string()
      .datetime({ message: "targetDate must be a valid ISO 8601 date string" })
      .nullish(),
    parentGoalId: z.string().trim().min(1).nullish(),
    completedAt: z
      .string()
      .datetime({ message: "completedAt must be a valid ISO 8601 date string" })
      .nullish(),
    userId: z
      .never({ message: "Client cannot specify userId in payload" })
      .optional(),
    id: z.never({ message: "Client cannot specify id in payload" }).optional(),
  })
  .strict();

export type UpdateGoalInput = z.input<typeof updateGoalSchema>;

function validateUserId(userId: unknown): string {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new AuthorizationError(
      "Authenticated user ID is required to access goals."
    );
  }
  return userId.trim();
}

function validateEntityId(id: unknown, entityName = "Goal"): string {
  if (!id || typeof id !== "string" || !id.trim()) {
    throw new NotFoundError(`${entityName} ID is invalid.`);
  }
  return id.trim();
}

export function toGoalDTO(
  row: Goal,
  computedProgress?: number,
  counts?: {
    childGoalsCount?: number;
    linkedProjectsCount?: number;
    directTasksCount?: number;
  }
): GoalDTO {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    description: row.description,
    horizon: row.horizon as GoalHorizon,
    area: row.area as LifeArea,
    status: row.status as GoalStatus,
    priority: row.priority as Priority,
    metricType: row.metricType as GoalMetricType,
    targetValue: row.targetValue,
    currentValue: row.currentValue,
    unit: row.unit,
    startDate: row.startDate ? row.startDate.toISOString() : null,
    targetDate: row.targetDate ? row.targetDate.toISOString() : null,
    parentGoalId: row.parentGoalId,
    progress: computedProgress !== undefined ? computedProgress : row.progress,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    childGoalsCount: counts?.childGoalsCount,
    linkedProjectsCount: counts?.linkedProjectsCount,
    directTasksCount: counts?.directTasksCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Asserts that setting parentGoalId does not create a cycle in the goal tree.
 */
async function assertNoGoalHierarchyCycle(
  tx: any,
  userId: string,
  goalId: string,
  proposedParentId: string
) {
  if (proposedParentId === goalId) {
    throw new InvariantViolationError("A goal cannot be its own parent.");
  }

  const result = await tx.execute(sql`
    WITH RECURSIVE ancestor_chain AS (
      SELECT id, parent_goal_id, 1 as depth
      FROM public.goals
      WHERE id = ${proposedParentId} AND user_id = ${userId}
      UNION ALL
      SELECT g.id, g.parent_goal_id, ac.depth + 1
      FROM public.goals g
      JOIN ancestor_chain ac ON g.id = ac.parent_goal_id
      WHERE g.user_id = ${userId} AND ac.depth < 50 AND ac.parent_goal_id IS NOT NULL
    )
    SELECT id FROM ancestor_chain WHERE id = ${goalId} LIMIT 1;
  `);

  if (result.rows && result.rows.length > 0) {
    throw new InvariantViolationError(
      "Goal hierarchy cycle detected: cannot set parent to a descendant."
    );
  }
}

/**
 * Recalculates the progress of a goal and recursively cascades to parent goals.
 */
export async function recalculateGoalProgress(
  safeUserId: string,
  goalId: string,
  txContext?: any
): Promise<number> {
  const runner = txContext || db;

  const [goalRow] = await runner
    .select()
    .from(goals)
    .where(and(eq(goals.userId, safeUserId), eq(goals.id, goalId)))
    .limit(1);

  if (!goalRow) {
    return 0;
  }

  // 1. Fetch linked projects
  const projectRows = await runner
    .select()
    .from(projects)
    .where(and(eq(projects.userId, safeUserId), eq(projects.goalId, goalId)));

  // Calculate project progress for each project
  const calculatedProjects: Array<{ id: string; progress: number; status: string }> = [];
  for (const p of projectRows) {
    const pTasks = await runner
      .select({ status: tasks.status })
      .from(tasks)
      .where(and(eq(tasks.userId, safeUserId), eq(tasks.projectId, p.id)));

    const pMilestones = await runner
      .select({ status: projectMilestones.status })
      .from(projectMilestones)
      .where(and(eq(projectMilestones.userId, safeUserId), eq(projectMilestones.projectId, p.id)));

    const pProg = calculateProjectProgress({
      tasks: pTasks,
      milestones: pMilestones,
      status: p.status,
    });

    calculatedProjects.push({
      id: p.id,
      progress: pProg,
      status: p.status,
    });
  }

  // 2. Fetch direct tasks (tasks with goalId and NO projectId)
  const directTaskRows = await runner
    .select({ status: tasks.status })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, safeUserId),
        eq(tasks.goalId, goalId),
        sql`${tasks.projectId} IS NULL`
      )
    );

  // 3. Fetch child goals
  const childGoalRows = await runner
    .select({ progress: goals.progress, status: goals.status })
    .from(goals)
    .where(and(eq(goals.userId, safeUserId), eq(goals.parentGoalId, goalId)));

  // 4. Compute overall goal progress
  const calculatedProgress = calculateGoalProgress({
    status: goalRow.status,
    metric: {
      metricType: goalRow.metricType as GoalMetricType,
      targetValue: goalRow.targetValue,
      currentValue: goalRow.currentValue,
      unit: goalRow.unit,
    },
    deliverables: {
      projects: calculatedProjects,
      directTasks: directTaskRows,
      childGoals: childGoalRows,
    },
  });

  // Update goal row progress in DB
  const updates: Partial<Goal> = {
    progress: calculatedProgress,
    updatedAt: new Date(),
  };

  if (goalRow.status === "completed" && !goalRow.completedAt) {
    updates.completedAt = new Date();
  }

  await runner
    .update(goals)
    .set(updates)
    .where(and(eq(goals.userId, safeUserId), eq(goals.id, goalId)));

  // 5. Cascade upward to parent goal if present
  if (goalRow.parentGoalId) {
    await recalculateGoalProgress(safeUserId, goalRow.parentGoalId, runner);
  }

  return calculatedProgress;
}

/**
 * Creates a goal strictly scoped to the authenticated user.
 */
export async function createGoal(
  authenticatedUserId: string,
  input: CreateGoalInput,
  actorInfo?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<GoalDTO> {
  const safeUserId = validateUserId(authenticatedUserId);
  const validated = createGoalSchema.parse(input);

  return await db.transaction(async (tx) => {
    // Verify parent goal ownership if provided
    if (validated.parentGoalId) {
      const parentRows = await tx
        .select({ id: goals.id })
        .from(goals)
        .where(
          and(
            eq(goals.userId, safeUserId),
            eq(goals.id, validated.parentGoalId)
          )
        )
        .for("share")
        .limit(1);

      if (parentRows.length === 0) {
        throw new NotFoundError("Parent goal not found.");
      }
    }

    const initialStatus = validated.status ?? "in_progress";
    let completedAt: Date | null = null;
    if (initialStatus === "completed") {
      completedAt = new Date();
    }

    // Initial progress computation
    const initialProgress = calculateGoalProgress({
      status: initialStatus,
      metric: {
        metricType: validated.metricType ?? "none",
        targetValue: validated.targetValue ?? null,
        currentValue: validated.currentValue ?? 0,
        unit: validated.unit ?? null,
      },
      deliverables: null,
    });

    const [inserted] = await tx
      .insert(goals)
      .values({
        userId: safeUserId,
        title: validated.title,
        description: validated.description ?? null,
        horizon: validated.horizon ?? "medium_term",
        area: validated.area ?? "general",
        status: initialStatus,
        priority: validated.priority ?? "medium",
        metricType: validated.metricType ?? "none",
        targetValue: validated.targetValue ?? null,
        currentValue: validated.currentValue ?? 0,
        unit: validated.unit ?? null,
        startDate: validated.startDate ? new Date(validated.startDate) : null,
        targetDate: validated.targetDate ? new Date(validated.targetDate) : null,
        parentGoalId: validated.parentGoalId ?? null,
        progress: initialProgress,
        completedAt,
      })
      .returning();

    // If parentGoalId is set, cascade upward
    if (inserted.parentGoalId) {
      await recalculateGoalProgress(safeUserId, inserted.parentGoalId, tx);
    }

    await createAuditLog(
      {
        userId: safeUserId,
        category: "mutation",
        action: "goal.create",
        status: "success",
        details: {
          goalId: inserted.id,
          title: inserted.title,
          horizon: inserted.horizon,
          area: inserted.area,
        },
        ipAddress: actorInfo?.ipAddress,
        userAgent: actorInfo?.userAgent,
      },
      tx
    );

    return toGoalDTO(inserted, initialProgress, {
      childGoalsCount: 0,
      linkedProjectsCount: 0,
      directTasksCount: 0,
    });
  });
}

/**
 * Retrieves a single goal with computed progress and relation counts.
 */
export async function getGoal(
  authenticatedUserId: string,
  goalId: string
): Promise<GoalDTO | null> {
  const safeUserId = validateUserId(authenticatedUserId);
  const safeGoalId = validateEntityId(goalId, "Goal");

  const [row] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.userId, safeUserId), eq(goals.id, safeGoalId)))
    .limit(1);

  if (!row) {
    return null;
  }

  // Count child goals
  const [childGoalsRes] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(goals)
    .where(and(eq(goals.userId, safeUserId), eq(goals.parentGoalId, safeGoalId)));

  // Count linked projects
  const [projectsRes] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(projects)
    .where(and(eq(projects.userId, safeUserId), eq(projects.goalId, safeGoalId)));

  // Count direct tasks
  const [tasksRes] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, safeUserId),
        eq(tasks.goalId, safeGoalId),
        sql`${tasks.projectId} IS NULL`
      )
    );

  const progress = await recalculateGoalProgress(safeUserId, safeGoalId);

  return toGoalDTO(row, progress, {
    childGoalsCount: childGoalsRes?.count ?? 0,
    linkedProjectsCount: projectsRes?.count ?? 0,
    directTasksCount: tasksRes?.count ?? 0,
  });
}

/**
 * Lists goals strictly scoped to the authenticated user with optional filtering.
 */
export async function listGoals(
  authenticatedUserId: string,
  filters?: {
    horizon?: string;
    area?: string;
    status?: string;
  }
): Promise<GoalDTO[]> {
  const safeUserId = validateUserId(authenticatedUserId);

  const conditions = [eq(goals.userId, safeUserId)];

  if (filters?.horizon) {
    conditions.push(eq(goals.horizon, filters.horizon as Goal["horizon"]));
  }
  if (filters?.area) {
    conditions.push(eq(goals.area, filters.area as Goal["area"]));
  }
  if (filters?.status) {
    conditions.push(eq(goals.status, filters.status as Goal["status"]));
  }

  const rows = await db
    .select()
    .from(goals)
    .where(and(...conditions))
    .orderBy(desc(goals.createdAt));

  // If no rows, return early
  if (rows.length === 0) return [];

  const goalIds = rows.map((r) => r.id);

  // Group child goals count
  const childCounts = await db
    .select({
      parentId: goals.parentGoalId,
      count: sql<number>`count(*)::int`,
    })
    .from(goals)
    .where(
      and(
        eq(goals.userId, safeUserId),
        sql`${goals.parentGoalId} IS NOT NULL`
      )
    )
    .groupBy(goals.parentGoalId);

  const childCountMap = new Map<string, number>();
  for (const c of childCounts) {
    if (c.parentId) childCountMap.set(c.parentId, c.count);
  }

  // Group linked projects count
  const projectCounts = await db
    .select({
      goalId: projects.goalId,
      count: sql<number>`count(*)::int`,
    })
    .from(projects)
    .where(and(eq(projects.userId, safeUserId), sql`${projects.goalId} IS NOT NULL`))
    .groupBy(projects.goalId);

  const projectCountMap = new Map<string, number>();
  for (const p of projectCounts) {
    if (p.goalId) projectCountMap.set(p.goalId, p.count);
  }

  // Group direct tasks count
  const directTaskCounts = await db
    .select({
      goalId: tasks.goalId,
      count: sql<number>`count(*)::int`,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, safeUserId),
        sql`${tasks.goalId} IS NOT NULL`,
        sql`${tasks.projectId} IS NULL`
      )
    )
    .groupBy(tasks.goalId);

  const directTaskCountMap = new Map<string, number>();
  for (const t of directTaskCounts) {
    if (t.goalId) directTaskCountMap.set(t.goalId, t.count);
  }

  return rows.map((r) =>
    toGoalDTO(r, r.progress, {
      childGoalsCount: childCountMap.get(r.id) ?? 0,
      linkedProjectsCount: projectCountMap.get(r.id) ?? 0,
      directTasksCount: directTaskCountMap.get(r.id) ?? 0,
    })
  );
}

/**
 * Updates a goal with row-level lock and triggers upward progress cascade.
 */
export async function updateGoal(
  authenticatedUserId: string,
  goalId: string,
  input: UpdateGoalInput,
  actorInfo?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<GoalDTO> {
  const safeUserId = validateUserId(authenticatedUserId);
  const safeGoalId = validateEntityId(goalId, "Goal");
  const validated = updateGoalSchema.parse(input);

  return await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(goals)
      .where(and(eq(goals.userId, safeUserId), eq(goals.id, safeGoalId)))
      .for("update")
      .limit(1);

    if (!existing) {
      throw new NotFoundError("Goal not found.");
    }

    // Check parentGoalId cycle prevention
    if (
      validated.parentGoalId !== undefined &&
      validated.parentGoalId !== null
    ) {
      const [parentRow] = await tx
        .select({ id: goals.id })
        .from(goals)
        .where(
          and(
            eq(goals.userId, safeUserId),
            eq(goals.id, validated.parentGoalId)
          )
        )
        .for("update")
        .limit(1);

      if (!parentRow) {
        throw new NotFoundError("Parent goal not found.");
      }

      await assertNoGoalHierarchyCycle(
        tx,
        safeUserId,
        safeGoalId,
        validated.parentGoalId
      );
    }

    const nextStatus = validated.status ?? existing.status;
    let nextCompletedAt = existing.completedAt;

    if (nextStatus === "completed") {
      if (validated.completedAt !== undefined) {
        nextCompletedAt = validated.completedAt
          ? new Date(validated.completedAt)
          : new Date();
      } else if (!existing.completedAt) {
        nextCompletedAt = new Date();
      }
    } else {
      nextCompletedAt = null;
    }

    const updates: Partial<Omit<Goal, "id" | "userId" | "createdAt">> = {
      updatedAt: new Date(),
      completedAt: nextCompletedAt,
    };

    if (validated.title !== undefined) updates.title = validated.title;
    if (validated.description !== undefined)
      updates.description = validated.description;
    if (validated.horizon !== undefined) updates.horizon = validated.horizon;
    if (validated.area !== undefined) updates.area = validated.area;
    if (validated.status !== undefined) updates.status = nextStatus;
    if (validated.priority !== undefined) updates.priority = validated.priority;
    if (validated.metricType !== undefined)
      updates.metricType = validated.metricType;
    if (validated.targetValue !== undefined)
      updates.targetValue = validated.targetValue;
    if (validated.currentValue !== undefined)
      updates.currentValue = validated.currentValue;
    if (validated.unit !== undefined) updates.unit = validated.unit;
    if (validated.startDate !== undefined)
      updates.startDate = validated.startDate
        ? new Date(validated.startDate)
        : null;
    if (validated.targetDate !== undefined)
      updates.targetDate = validated.targetDate
        ? new Date(validated.targetDate)
        : null;
    if (validated.parentGoalId !== undefined)
      updates.parentGoalId = validated.parentGoalId;

    const [updated] = await tx
      .update(goals)
      .set(updates)
      .where(and(eq(goals.userId, safeUserId), eq(goals.id, safeGoalId)))
      .returning();

    // Recalculate progress after updates and cascade
    const newProgress = await recalculateGoalProgress(safeUserId, safeGoalId, tx);

    // If old parent was different from new parent, cascade old parent too
    if (
      existing.parentGoalId &&
      existing.parentGoalId !== updated.parentGoalId
    ) {
      await recalculateGoalProgress(safeUserId, existing.parentGoalId, tx);
    }

    await createAuditLog(
      {
        userId: safeUserId,
        category: "mutation",
        action: "goal.update",
        status: "success",
        details: {
          goalId: safeGoalId,
          updatedFields: Object.keys(validated),
        },
        ipAddress: actorInfo?.ipAddress,
        userAgent: actorInfo?.userAgent,
      },
      tx
    );

    return toGoalDTO(updated, newProgress);
  });
}

/**
 * Deletes a goal and triggers upward progress recalculation for its parent.
 */
export async function deleteGoal(
  authenticatedUserId: string,
  goalId: string,
  actorInfo?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<{ success: true }> {
  const safeUserId = validateUserId(authenticatedUserId);
  const safeGoalId = validateEntityId(goalId, "Goal");

  return await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: goals.id, parentGoalId: goals.parentGoalId })
      .from(goals)
      .where(and(eq(goals.userId, safeUserId), eq(goals.id, safeGoalId)))
      .for("update")
      .limit(1);

    if (!existing) {
      throw new NotFoundError("Goal not found.");
    }

    await tx
      .delete(goals)
      .where(and(eq(goals.userId, safeUserId), eq(goals.id, safeGoalId)));

    // If deleted goal had a parent, recalculate parent progress
    if (existing.parentGoalId) {
      await recalculateGoalProgress(safeUserId, existing.parentGoalId, tx);
    }

    await createAuditLog(
      {
        userId: safeUserId,
        category: "mutation",
        action: "goal.delete",
        status: "success",
        details: { goalId: safeGoalId },
        ipAddress: actorInfo?.ipAddress,
        userAgent: actorInfo?.userAgent,
      },
      tx
    );

    return { success: true };
  });
}
