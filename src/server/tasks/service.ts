import { z } from "zod";
import { eq, and, sql, desc, asc, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import {
  tasks,
  projects,
  taskDependencies,
  type Task,
  type RecurrenceRule,
  type TaskDependency,
} from "@/server/db/schema";
import { AuthorizationError } from "@/server/auth/guard";
import { createAuditLog } from "@/server/audit";
import {
  calculateTaskPriorityScore,
  compareTasksByPriority,
} from "./priority";
import { calculateNextOccurrence } from "./recurrence";
import { parseQuickCaptureInput } from "./quick-capture";
import { recalculateGoalProgress } from "@/server/goals/service";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Tasks service cannot be initialized in the browser."
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

export interface TaskDTO {
  id: string;
  userId: string;
  projectId: string | null;
  parentTaskId: string | null;
  milestoneId: string | null;
  title: string;
  description: string | null;
  status:
    | "inbox"
    | "todo"
    | "in_progress"
    | "blocked"
    | "completed"
    | "cancelled";
  priority: "low" | "medium" | "high" | "critical";
  scheduledDate: string | null;
  energyLevel: "low" | "medium" | "high" | null;
  recurrenceRule: RecurrenceRule | null;
  goalId: string | null;
  habitId: string | null;
  noteId: string | null;
  personId: string | null;
  tags: string[];
  dueDate: string | null;
  estimatedDuration: number | null;
  actualDuration: number | null;
  completedAt: string | null;
  priorityScore: number;
  hasUncompletedDependencies?: boolean;
  createdAt: string;
  updatedAt: string;
}

export function toTaskDTO(
  row: Task,
  extra?: { priorityScore?: number; hasUncompletedDependencies?: boolean }
): TaskDTO {
  const score =
    extra?.priorityScore !== undefined
      ? extra.priorityScore
      : calculateTaskPriorityScore(
          {
            id: row.id,
            priority: row.priority,
            dueDate: row.dueDate,
            scheduledDate: row.scheduledDate,
            projectId: row.projectId,
            goalId: row.goalId,
            estimatedDuration: row.estimatedDuration,
            status: row.status,
            hasUncompletedDependencies: extra?.hasUncompletedDependencies,
            createdAt: row.createdAt,
          },
          new Date()
        );

  return {
    id: row.id,
    userId: row.userId,
    projectId: row.projectId,
    parentTaskId: row.parentTaskId,
    milestoneId: row.milestoneId ?? null,
    title: row.title,
    description: row.description,
    status: row.status as TaskDTO["status"],
    priority: row.priority as TaskDTO["priority"],
    scheduledDate: row.scheduledDate ? row.scheduledDate.toISOString() : null,
    energyLevel: (row.energyLevel as TaskDTO["energyLevel"]) ?? null,
    recurrenceRule: (row.recurrenceRule as RecurrenceRule) ?? null,
    goalId: row.goalId ?? null,
    habitId: row.habitId ?? null,
    noteId: row.noteId ?? null,
    personId: row.personId ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    estimatedDuration: row.estimatedDuration,
    actualDuration: row.actualDuration,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    priorityScore: score,
    hasUncompletedDependencies: extra?.hasUncompletedDependencies ?? false,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const recurrenceRuleSchema = z
  .object({
    frequency: z.enum(["daily", "weekly", "monthly", "custom"]),
    interval: z.number().int().min(1).default(1),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
    endDate: z.string().datetime().optional(),
    count: z.number().int().min(1).optional(),
  })
  .strict();

export const createTaskSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Task title cannot be empty or whitespace")
      .max(255, "Task title cannot exceed 255 characters"),
    description: z
      .string()
      .trim()
      .max(4000, "Task description cannot exceed 4000 characters")
      .nullish(),
    status: z
      .enum([
        "inbox",
        "todo",
        "in_progress",
        "blocked",
        "completed",
        "cancelled",
      ])
      .optional(),
    priority: z.enum(["low", "medium", "high", "critical"]).optional(),
    scheduledDate: z
      .string()
      .datetime({ message: "scheduledDate must be a valid ISO 8601 date string" })
      .nullish(),
    energyLevel: z.enum(["low", "medium", "high"]).nullish(),
    recurrenceRule: recurrenceRuleSchema.nullish(),
    goalId: z.string().trim().min(1).nullish(),
    milestoneId: z.string().trim().min(1).nullish(),
    habitId: z.string().trim().min(1).nullish(),
    noteId: z.string().trim().min(1).nullish(),
    personId: z.string().trim().min(1).nullish(),
    tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
    projectId: z.string().trim().min(1).nullish(),
    parentTaskId: z.string().trim().min(1).nullish(),
    dueDate: z
      .string()
      .datetime({ message: "dueDate must be a valid ISO 8601 date string" })
      .nullish(),
    estimatedDuration: z
      .number()
      .int()
      .min(0, "Estimated duration cannot be negative")
      .max(10080, "Estimated duration cannot exceed 10080 minutes (1 week)")
      .nullish(),
    actualDuration: z
      .number()
      .int()
      .min(0, "Actual duration cannot be negative")
      .max(10080, "Actual duration cannot exceed 10080 minutes (1 week)")
      .nullish(),
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

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Task title cannot be empty or whitespace")
      .max(255, "Task title cannot exceed 255 characters")
      .optional(),
    description: z
      .string()
      .trim()
      .max(4000, "Task description cannot exceed 4000 characters")
      .nullish(),
    status: z
      .enum([
        "inbox",
        "todo",
        "in_progress",
        "blocked",
        "completed",
        "cancelled",
      ])
      .optional(),
    priority: z.enum(["low", "medium", "high", "critical"]).optional(),
    scheduledDate: z
      .string()
      .datetime({ message: "scheduledDate must be a valid ISO 8601 date string" })
      .nullish(),
    energyLevel: z.enum(["low", "medium", "high"]).nullish(),
    recurrenceRule: recurrenceRuleSchema.nullish(),
    goalId: z.string().trim().min(1).nullish(),
    milestoneId: z.string().trim().min(1).nullish(),
    habitId: z.string().trim().min(1).nullish(),
    noteId: z.string().trim().min(1).nullish(),
    personId: z.string().trim().min(1).nullish(),
    tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
    projectId: z.string().trim().min(1).nullish(),
    parentTaskId: z.string().trim().min(1).nullish(),
    dueDate: z
      .string()
      .datetime({ message: "dueDate must be a valid ISO 8601 date string" })
      .nullish(),
    estimatedDuration: z
      .number()
      .int()
      .min(0, "Estimated duration cannot be negative")
      .max(10080, "Estimated duration cannot exceed 10080 minutes (1 week)")
      .nullish(),
    actualDuration: z
      .number()
      .int()
      .min(0, "Actual duration cannot be negative")
      .max(10080, "Actual duration cannot exceed 10080 minutes (1 week)")
      .nullish(),
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

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

function validateUserId(userId: unknown): string {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new AuthorizationError(
      "Authenticated user ID is required to access tasks."
    );
  }
  return userId.trim();
}

function validateEntityId(id: unknown, entityName = "Entity"): string {
  if (!id || typeof id !== "string" || !id.trim()) {
    throw new NotFoundError(`${entityName} ID is invalid.`);
  }
  return id.trim();
}

/**
 * Executes an async operation with automatic retry on PostgreSQL transaction deadlocks (40P01)
 * and serialization failures (40001) under intense concurrent contention.
 */
async function withDeadlockRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      if (
        (err?.code === "40P01" || err?.code === "40001") &&
        attempt < maxRetries
      ) {
        attempt++;
        await new Promise((resolve) =>
          setTimeout(resolve, attempt * 30 + Math.floor(Math.random() * 30))
        );
        continue;
      }
      throw err;
    }
  }
}

/**
 * Recursively asserts that proposedParentId does not create a hierarchy cycle with taskId.
 * Detects A -> A, A -> B -> A, A -> B -> C -> A, and reparenting to any descendant.
 */
async function assertNoHierarchyCycle(
  tx: any,
  userId: string,
  taskId: string,
  proposedParentId: string
): Promise<void> {
  // 1. Direct self-cycle
  if (proposedParentId === taskId) {
    throw new InvariantViolationError("A task cannot be its own parent.");
  }

  // 2. Recursive ancestor search: checks if taskId exists in the ancestor chain of proposedParentId
  const result = await tx.execute(sql`
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_task_id, 1 as depth
      FROM tasks
      WHERE id = ${proposedParentId} AND user_id = ${userId}
      UNION ALL
      SELECT t.id, t.parent_task_id, a.depth + 1
      FROM tasks t
      JOIN ancestors a ON t.id = a.parent_task_id
      WHERE t.user_id = ${userId} AND a.depth < 100
    )
    SELECT id FROM ancestors WHERE id = ${taskId} LIMIT 1;
  `);

  if (result.rows && result.rows.length > 0) {
    throw new InvariantViolationError(
      "Task hierarchy cycle detected: cannot set parent to a descendant or circular ancestor."
    );
  }
}

/**
 * Creates a task strictly scoped to the authenticated user within an atomic transaction.
 * Validates cross-entity ownership, project consistency, and records audit log atomically.
 */
export async function createTask(
  authenticatedUserId: string,
  input: CreateTaskInput,
  actorInfo?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<TaskDTO> {
  const safeUserId = validateUserId(authenticatedUserId);
  const validated = createTaskSchema.parse(input);

  return await withDeadlockRetry(async () => {
    try {
      return await db.transaction(async (tx) => {
        let finalProjectId = validated.projectId ?? null;

        // 1. Verify project ownership if explicit projectId is provided (with row-level share lock)
        if (finalProjectId) {
          const projectRows = await tx
            .select({ id: projects.id })
            .from(projects)
            .where(
              and(
                eq(projects.userId, safeUserId),
                eq(projects.id, finalProjectId)
              )
            )
            .for("share")
            .limit(1);

          if (projectRows.length === 0) {
            throw new NotFoundError("Project not found.");
          }
        }

        // 2. Verify parent task ownership and project alignment if parentTaskId is provided (with row-level share lock)
        if (validated.parentTaskId) {
          const [parentRow] = await tx
            .select({ id: tasks.id, projectId: tasks.projectId })
            .from(tasks)
            .where(
              and(
                eq(tasks.userId, safeUserId),
                eq(tasks.id, validated.parentTaskId)
              )
            )
            .for("share")
            .limit(1);

          if (!parentRow) {
            throw new NotFoundError("Parent task not found.");
          }

          // Project alignment rules
          if (finalProjectId && parentRow.projectId && finalProjectId !== parentRow.projectId) {
            throw new InvariantViolationError(
              "Subtask cannot belong to a different project than its parent task."
            );
          }
          if (finalProjectId && !parentRow.projectId) {
            throw new InvariantViolationError(
              "Subtask cannot belong to a project when parent task has no project."
            );
          }
          // Inherit parent project if not explicitly set
          if (!finalProjectId && parentRow.projectId) {
            finalProjectId = parentRow.projectId;
          }
        }

        // 3. Determine completedAt invariant
        const finalStatus = validated.status ?? "inbox";
        let finalCompletedAt: Date | null = null;
        if (finalStatus === "completed") {
          finalCompletedAt = validated.completedAt
            ? new Date(validated.completedAt)
            : new Date();
        }

        const [inserted] = await tx
          .insert(tasks)
          .values({
            userId: safeUserId,
            projectId: finalProjectId,
            parentTaskId: validated.parentTaskId ?? null,
            title: validated.title,
            description: validated.description ?? null,
            status: finalStatus,
            priority: validated.priority ?? "medium",
            scheduledDate: validated.scheduledDate ? new Date(validated.scheduledDate) : null,
            energyLevel: validated.energyLevel ?? null,
            recurrenceRule: validated.recurrenceRule ?? null,
            goalId: validated.goalId ?? null,
            milestoneId: validated.milestoneId ?? null,
            habitId: validated.habitId ?? null,
            noteId: validated.noteId ?? null,
            personId: validated.personId ?? null,
            tags: validated.tags ?? [],
            dueDate: validated.dueDate ? new Date(validated.dueDate) : null,
            estimatedDuration: validated.estimatedDuration ?? null,
            actualDuration: validated.actualDuration ?? null,
            completedAt: finalCompletedAt,
          })
          .returning();

        await createAuditLog(
          {
            userId: safeUserId,
            category: "mutation",
            action: "task.create",
            status: "success",
            details: {
              taskId: inserted.id,
              title: inserted.title,
              projectId: inserted.projectId,
              status: inserted.status,
            },
            ipAddress: actorInfo?.ipAddress,
            userAgent: actorInfo?.userAgent,
          },
          tx
        );

        // Trigger goal progress recalculation if task belongs to a goal or a project linked to a goal
        if (inserted.goalId) {
          await recalculateGoalProgress(safeUserId, inserted.goalId, tx);
        }
        if (finalProjectId) {
          const [p] = await tx
            .select({ goalId: projects.goalId })
            .from(projects)
            .where(
              and(eq(projects.userId, safeUserId), eq(projects.id, finalProjectId))
            )
            .limit(1);
          if (p?.goalId) {
            await recalculateGoalProgress(safeUserId, p.goalId, tx);
          }
        }

        return toTaskDTO(inserted);
      });
    } catch (err: any) {
      if (err?.code === "23503") {
        if (err.constraint?.includes("project") || err.detail?.includes("projects")) {
          throw new NotFoundError("Project not found.");
        }
        if (err.constraint?.includes("parent") || err.detail?.includes("tasks")) {
          throw new NotFoundError("Parent task not found.");
        }
      }
      throw err;
    }
  });
}

export interface ListTasksFilters {
  status?: string;
  projectId?: string;
  priority?: string;
  energyLevel?: "low" | "medium" | "high";
  scheduledDate?: string;
  overdue?: boolean;
  sortBy?: "priority_score" | "due_date" | "created_at" | "title";
  sortDir?: "asc" | "desc";
}

/**
 * Retrieves a single task strictly scoped to the authenticated user,
 * dynamically calculating priority score and dependency blocking status.
 */
export async function getTask(
  authenticatedUserId: string,
  taskId: string
): Promise<TaskDTO | null> {
  const safeUserId = validateUserId(authenticatedUserId);
  const safeTaskId = validateEntityId(taskId, "Task");

  const results = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, safeUserId), eq(tasks.id, safeTaskId)))
    .limit(1);

  if (!results[0]) {
    return null;
  }

  // Check if task has any uncompleted dependencies
  const depResult = await db.execute(sql`
    SELECT 1
    FROM task_dependencies td
    JOIN tasks t ON t.id = td.depends_on_task_id AND t.user_id = td.user_id
    WHERE td.user_id = ${safeUserId} AND td.task_id = ${safeTaskId} AND t.status != 'completed'
    LIMIT 1;
  `);

  const hasUncompletedDependencies = Boolean(
    depResult.rows && depResult.rows.length > 0
  );

  return toTaskDTO(results[0], { hasUncompletedDependencies });
}

/**
 * Lists tasks strictly scoped to the authenticated user with multi-criteria filtering,
 * dependency blocking detection, dynamic priority scoring, and deterministic sorting.
 */
export async function listTasks(
  authenticatedUserId: string,
  filters?: ListTasksFilters
): Promise<TaskDTO[]> {
  const safeUserId = validateUserId(authenticatedUserId);

  const conditions = [eq(tasks.userId, safeUserId)];

  if (filters?.status) {
    conditions.push(eq(tasks.status, filters.status as Task["status"]));
  }
  if (filters?.projectId) {
    conditions.push(eq(tasks.projectId, filters.projectId));
  }
  if (filters?.priority) {
    conditions.push(eq(tasks.priority, filters.priority as Task["priority"]));
  }
  if (filters?.energyLevel) {
    conditions.push(eq(tasks.energyLevel, filters.energyLevel));
  }
  if (filters?.scheduledDate) {
    conditions.push(
      sql`DATE(${tasks.scheduledDate}) = DATE(${filters.scheduledDate})`
    );
  }
  if (filters?.overdue) {
    conditions.push(
      and(
        sql`${tasks.dueDate} < NOW()`,
        sql`${tasks.status} NOT IN ('completed', 'cancelled')`
      )!
    );
  }

  const rows = await db
    .select()
    .from(tasks)
    .where(and(...conditions));

  // Single aggregate query to determine which user tasks have uncompleted dependencies
  const blockedResult = await db.execute(sql`
    SELECT td.task_id
    FROM task_dependencies td
    JOIN tasks t ON t.id = td.depends_on_task_id AND t.user_id = td.user_id
    WHERE td.user_id = ${safeUserId} AND t.status != 'completed'
    GROUP BY td.task_id;
  `);

  const blockedTaskIds = new Set<string>(
    (blockedResult.rows || []).map((r: any) => String(r.task_id))
  );

  const now = new Date();
  const dtoList = rows.map((row) => {
    const hasUncompleted = blockedTaskIds.has(row.id);
    const score = calculateTaskPriorityScore(
      {
        id: row.id,
        priority: row.priority,
        dueDate: row.dueDate,
        scheduledDate: row.scheduledDate,
        projectId: row.projectId,
        goalId: row.goalId,
        estimatedDuration: row.estimatedDuration,
        status: row.status,
        hasUncompletedDependencies: hasUncompleted,
        createdAt: row.createdAt,
      },
      now
    );
    return toTaskDTO(row, {
      priorityScore: score,
      hasUncompletedDependencies: hasUncompleted,
    });
  });

  const sortBy = filters?.sortBy ?? "priority_score";
  const sortDir =
    filters?.sortDir ??
    (sortBy === "priority_score" || sortBy === "created_at" ? "desc" : "asc");

  dtoList.sort((a, b) => {
    if (sortBy === "priority_score") {
      const diff = b.priorityScore - a.priorityScore;
      if (diff !== 0) return sortDir === "asc" ? -diff : diff;
      return compareTasksByPriority(
        {
          id: a.id,
          priority: a.priority,
          dueDate: a.dueDate ? new Date(a.dueDate) : null,
          scheduledDate: a.scheduledDate ? new Date(a.scheduledDate) : null,
          projectId: a.projectId,
          goalId: a.goalId,
          estimatedDuration: a.estimatedDuration,
          status: a.status,
          createdAt: new Date(a.createdAt),
        },
        {
          id: b.id,
          priority: b.priority,
          dueDate: b.dueDate ? new Date(b.dueDate) : null,
          scheduledDate: b.scheduledDate ? new Date(b.scheduledDate) : null,
          projectId: b.projectId,
          goalId: b.goalId,
          estimatedDuration: b.estimatedDuration,
          status: b.status,
          createdAt: new Date(b.createdAt),
        },
        now
      );
    }
    if (sortBy === "due_date") {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      const diff = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      return sortDir === "asc" ? diff : -diff;
    }
    if (sortBy === "created_at") {
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortDir === "asc" ? diff : -diff;
    }
    if (sortBy === "title") {
      const cmp = a.title.localeCompare(b.title);
      return sortDir === "asc" ? cmp : -cmp;
    }
    return 0;
  });

  return dtoList;
}

/**
 * Updates a task strictly scoped to the authenticated user within an atomic transaction.
 * Prevents multi-level hierarchy cycles, enforces row-level locks (FOR UPDATE),
 * guarantees project consistency across parent/child tasks, and records audit log atomically.
 */
export async function updateTask(
  authenticatedUserId: string,
  taskId: string,
  input: UpdateTaskInput,
  actorInfo?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<TaskDTO> {
  const safeUserId = validateUserId(authenticatedUserId);
  const safeTaskId = validateEntityId(taskId, "Task");
  const validated = updateTaskSchema.parse(input);

  try {
    return await db.transaction(async (tx) => {
      // 1. Fetch and lock existing task scoped to user (FOR UPDATE)
      const [existing] = await tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.userId, safeUserId), eq(tasks.id, safeTaskId)))
        .for("update")
        .limit(1);

      if (!existing) {
        throw new NotFoundError("Task not found.");
      }

      // 2. Validate parentTaskId and hierarchy cycle prevention
      let targetParentProjectId: string | null | undefined = undefined;
      if (validated.parentTaskId !== undefined) {
        if (validated.parentTaskId === safeTaskId) {
          throw new InvariantViolationError("A task cannot be its own parent.");
        }

        if (validated.parentTaskId !== null) {
          // Lock proposed parent task row (FOR UPDATE)
          const [parentRow] = await tx
            .select({ id: tasks.id, projectId: tasks.projectId })
            .from(tasks)
            .where(
              and(
                eq(tasks.userId, safeUserId),
                eq(tasks.id, validated.parentTaskId)
              )
            )
            .for("update")
            .limit(1);

          if (!parentRow) {
            throw new NotFoundError("Parent task not found.");
          }

          targetParentProjectId = parentRow.projectId;

          // Recursive hierarchy cycle detection
          await assertNoHierarchyCycle(
            tx,
            safeUserId,
            safeTaskId,
            validated.parentTaskId
          );
        }
      }

      // 3. Project alignment validation (only required if projectId or parentTaskId is modified)
      let nextProjectId =
        validated.projectId !== undefined ? validated.projectId : existing.projectId;

      if (validated.projectId !== undefined || validated.parentTaskId !== undefined) {
        if (validated.projectId !== undefined && validated.projectId !== null) {
          const projectRows = await tx
            .select({ id: projects.id })
            .from(projects)
            .where(
              and(
                eq(projects.userId, safeUserId),
                eq(projects.id, validated.projectId)
              )
            )
            .for("share")
            .limit(1);

          if (projectRows.length === 0) {
            throw new NotFoundError("Project not found.");
          }
        }

        const activeParentId =
          validated.parentTaskId !== undefined
            ? validated.parentTaskId
            : existing.parentTaskId;

        if (activeParentId) {
          let effectiveParentProjectId = targetParentProjectId;
          if (effectiveParentProjectId === undefined) {
            const [pRow] = await tx
              .select({ projectId: tasks.projectId })
              .from(tasks)
              .where(and(eq(tasks.userId, safeUserId), eq(tasks.id, activeParentId)))
              .for("share")
              .limit(1);
            effectiveParentProjectId = pRow?.projectId ?? null;
          }

          if (
            nextProjectId &&
            effectiveParentProjectId &&
            nextProjectId !== effectiveParentProjectId
          ) {
            throw new InvariantViolationError(
              "Subtask cannot belong to a different project than its parent task."
            );
          }
          if (nextProjectId && !effectiveParentProjectId) {
            throw new InvariantViolationError(
              "Subtask cannot belong to a project when parent task has no project."
            );
          }
          // If parent has project and child project was not explicitly provided or was null, inherit parent's project
          if (!nextProjectId && effectiveParentProjectId && validated.projectId === undefined) {
            nextProjectId = effectiveParentProjectId;
          }
        }
      }

      // 4. Determine status and completedAt invariants
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
        // If moved out of completed status, clear completedAt
        nextCompletedAt = null;
      }

      const updates: Partial<Omit<Task, "id" | "userId" | "createdAt">> = {
        updatedAt: new Date(),
      };

      if (validated.title !== undefined) updates.title = validated.title;
      if (validated.description !== undefined)
        updates.description = validated.description;
      if (validated.status !== undefined) updates.status = nextStatus;
      if (validated.priority !== undefined) updates.priority = validated.priority;
      if (validated.scheduledDate !== undefined)
        updates.scheduledDate = validated.scheduledDate
          ? new Date(validated.scheduledDate)
          : null;
      if (validated.energyLevel !== undefined)
        updates.energyLevel = validated.energyLevel ?? null;
      if (validated.recurrenceRule !== undefined)
        updates.recurrenceRule = validated.recurrenceRule ?? null;
      if (validated.goalId !== undefined) updates.goalId = validated.goalId ?? null;
      if (validated.milestoneId !== undefined)
        updates.milestoneId = validated.milestoneId ?? null;
      if (validated.habitId !== undefined) updates.habitId = validated.habitId ?? null;
      if (validated.noteId !== undefined) updates.noteId = validated.noteId ?? null;
      if (validated.personId !== undefined)
        updates.personId = validated.personId ?? null;
      if (validated.tags !== undefined) updates.tags = validated.tags ?? [];
      if (validated.projectId !== undefined) updates.projectId = nextProjectId;
      if (validated.parentTaskId !== undefined)
        updates.parentTaskId = validated.parentTaskId;
      if (validated.dueDate !== undefined)
        updates.dueDate = validated.dueDate ? new Date(validated.dueDate) : null;
      if (validated.estimatedDuration !== undefined)
        updates.estimatedDuration = validated.estimatedDuration;
      if (validated.actualDuration !== undefined)
        updates.actualDuration = validated.actualDuration;

      updates.completedAt = nextCompletedAt;

      // 5. Execute task update
      const [updated] = await tx
        .update(tasks)
        .set(updates)
        .where(and(eq(tasks.userId, safeUserId), eq(tasks.id, safeTaskId)))
        .returning();

      // 6. Recurrence spawning on completion
      if (
        nextStatus === "completed" &&
        existing.status !== "completed" &&
        (updates.recurrenceRule !== undefined
          ? updates.recurrenceRule
          : existing.recurrenceRule)
      ) {
        const rule = (updates.recurrenceRule !== undefined
          ? updates.recurrenceRule
          : existing.recurrenceRule) as RecurrenceRule;

        const baseDate =
          existing.dueDate ??
          existing.scheduledDate ??
          nextCompletedAt ??
          new Date();
        const nextOccurrence = calculateNextOccurrence(baseDate, rule);

        if (nextOccurrence) {
          let nextDueDate: Date | null = null;
          let nextScheduledDate: Date | null = null;

          if (existing.dueDate) {
            nextDueDate = calculateNextOccurrence(existing.dueDate, rule);
          }
          if (existing.scheduledDate) {
            nextScheduledDate = calculateNextOccurrence(
              existing.scheduledDate,
              rule
            );
          }
          if (!nextDueDate && !nextScheduledDate) {
            nextDueDate = nextOccurrence;
          }

          const [spawned] = await tx
            .insert(tasks)
            .values({
              userId: safeUserId,
              projectId: nextProjectId,
              parentTaskId: existing.parentTaskId,
              title: existing.title,
              description: existing.description,
              status: "todo",
              priority: existing.priority,
              scheduledDate: nextScheduledDate,
              energyLevel: existing.energyLevel,
              recurrenceRule: rule,
              goalId: existing.goalId,
              habitId: existing.habitId,
              noteId: existing.noteId,
              personId: existing.personId,
              tags: existing.tags ?? [],
              dueDate: nextDueDate,
              estimatedDuration: existing.estimatedDuration,
              actualDuration: null,
              completedAt: null,
            })
            .returning();

          await createAuditLog(
            {
              userId: safeUserId,
              category: "mutation",
              action: "task.recurrence_spawned",
              status: "success",
              details: {
                originalTaskId: safeTaskId,
                newTaskId: spawned.id,
                nextDueDate: nextDueDate ? nextDueDate.toISOString() : null,
                nextScheduledDate: nextScheduledDate
                  ? nextScheduledDate.toISOString()
                  : null,
              },
              ipAddress: actorInfo?.ipAddress,
              userAgent: actorInfo?.userAgent,
            },
            tx
          );
        }
      }

      // 6. Propagate project change to descendant subtasks if project changed
      if (
        validated.projectId !== undefined &&
        validated.projectId !== existing.projectId
      ) {
        await tx.execute(sql`
          WITH RECURSIVE subtask_tree AS (
            SELECT id FROM tasks WHERE parent_task_id = ${safeTaskId} AND user_id = ${safeUserId}
            UNION ALL
            SELECT t.id FROM tasks t
            JOIN subtask_tree st ON t.parent_task_id = st.id
            WHERE t.user_id = ${safeUserId}
          )
          UPDATE tasks
          SET project_id = ${nextProjectId}, updated_at = NOW()
          WHERE id IN (SELECT id FROM subtask_tree) AND user_id = ${safeUserId};
        `);
      }

      await createAuditLog(
        {
          userId: safeUserId,
          category: "mutation",
          action: "task.update",
          status: "success",
          details: {
            taskId: safeTaskId,
            updatedFields: Object.keys(validated),
            status: updated.status,
          },
          ipAddress: actorInfo?.ipAddress,
          userAgent: actorInfo?.userAgent,
        },
        tx
      );

      // Trigger goal progress recalculation if status, projectId, or goalId changed
      if (updated.goalId) {
        await recalculateGoalProgress(safeUserId, updated.goalId, tx);
      }
      if (existing.goalId && existing.goalId !== updated.goalId) {
        await recalculateGoalProgress(safeUserId, existing.goalId, tx);
      }
      if (updated.projectId) {
        const [p] = await tx
          .select({ goalId: projects.goalId })
          .from(projects)
          .where(and(eq(projects.userId, safeUserId), eq(projects.id, updated.projectId)))
          .limit(1);
        if (p?.goalId) {
          await recalculateGoalProgress(safeUserId, p.goalId, tx);
        }
      }
      if (existing.projectId && existing.projectId !== updated.projectId) {
        const [pOld] = await tx
          .select({ goalId: projects.goalId })
          .from(projects)
          .where(and(eq(projects.userId, safeUserId), eq(projects.id, existing.projectId)))
          .limit(1);
        if (pOld?.goalId) {
          await recalculateGoalProgress(safeUserId, pOld.goalId, tx);
        }
      }

      return toTaskDTO(updated);
    });
  } catch (err: any) {
    if (err?.code === "23503") {
      if (err.constraint?.includes("project") || err.detail?.includes("projects")) {
        throw new NotFoundError("Project not found.");
      }
      if (err.constraint?.includes("parent") || err.detail?.includes("tasks")) {
        throw new NotFoundError("Parent task not found.");
      }
    }
    throw err;
  }
}

/**
 * Deletes a task strictly scoped to the authenticated user within an atomic transaction.
 * Associated subtasks are deleted via foreign key ON DELETE CASCADE.
 * Throws NotFoundError if task does not exist or belongs to another user.
 */
export async function deleteTask(
  authenticatedUserId: string,
  taskId: string,
  actorInfo?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<{ success: true }> {
  const safeUserId = validateUserId(authenticatedUserId);
  const safeTaskId = validateEntityId(taskId, "Task");

  return await withDeadlockRetry(async () =>
    db.transaction(async (tx) => {
      // Acquire row-level lock before deletion
      const [existing] = await tx
        .select({ id: tasks.id, projectId: tasks.projectId, goalId: tasks.goalId })
        .from(tasks)
        .where(and(eq(tasks.userId, safeUserId), eq(tasks.id, safeTaskId)))
        .for("update")
        .limit(1);

      if (!existing) {
        throw new NotFoundError("Task not found.");
      }

      const [deleted] = await tx
        .delete(tasks)
        .where(and(eq(tasks.userId, safeUserId), eq(tasks.id, safeTaskId)))
        .returning({ id: tasks.id });

      if (!deleted) {
        throw new NotFoundError("Task not found.");
      }

      // Trigger goal progress recalculation if deleted task belonged to a goal or a project linked to a goal
      if (existing.goalId) {
        await recalculateGoalProgress(safeUserId, existing.goalId, tx);
      }
      if (existing.projectId) {
        const [p] = await tx
          .select({ goalId: projects.goalId })
          .from(projects)
          .where(and(eq(projects.userId, safeUserId), eq(projects.id, existing.projectId)))
          .limit(1);
        if (p?.goalId) {
          await recalculateGoalProgress(safeUserId, p.goalId, tx);
        }
      }

      await createAuditLog(
        {
          userId: safeUserId,
          category: "mutation",
          action: "task.delete",
          status: "success",
          details: { taskId: safeTaskId },
          ipAddress: actorInfo?.ipAddress,
          userAgent: actorInfo?.userAgent,
        },
        tx
      );

      return { success: true };
    })
  );
}

/**
 * Adds a dependency between two tasks owned by the authenticated user within an atomic transaction.
 * Enforces DAG cycle prevention via PostgreSQL trigger and row-level checks.
 */
export async function addTaskDependency(
  authenticatedUserId: string,
  taskId: string,
  dependsOnTaskId: string,
  actorInfo?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<{ success: true; dependency: TaskDependency }> {
  const safeUserId = validateUserId(authenticatedUserId);
  const safeTaskId = validateEntityId(taskId, "Task");
  const safeDependsOnTaskId = validateEntityId(
    dependsOnTaskId,
    "Prerequisite Task"
  );

  if (safeTaskId === safeDependsOnTaskId) {
    throw new InvariantViolationError("A task cannot depend on itself.");
  }

  return await withDeadlockRetry(async () =>
    db.transaction(async (tx) => {
      // 1. Verify both tasks exist and belong to the authenticated user (share lock)
      const rows = await tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, safeUserId),
            inArray(tasks.id, [safeTaskId, safeDependsOnTaskId])
          )
        )
        .for("share");

      if (rows.length < 2) {
        throw new NotFoundError("One or both tasks not found.");
      }

      try {
        const [inserted] = await tx
          .insert(taskDependencies)
          .values({
            userId: safeUserId,
            taskId: safeTaskId,
            dependsOnTaskId: safeDependsOnTaskId,
          })
          .returning();

        await createAuditLog(
          {
            userId: safeUserId,
            category: "mutation",
            action: "task.dependency_added",
            status: "success",
            details: {
              taskId: safeTaskId,
              dependsOnTaskId: safeDependsOnTaskId,
              dependencyId: inserted.id,
            },
            ipAddress: actorInfo?.ipAddress,
            userAgent: actorInfo?.userAgent,
          },
          tx
        );

        return { success: true, dependency: inserted };
      } catch (err: any) {
        const cause = err?.cause || err;

        // Unique violation: dependency already exists
        if (err?.code === "23505" || cause?.code === "23505") {
          const [existing] = await tx
            .select()
            .from(taskDependencies)
            .where(
              and(
                eq(taskDependencies.userId, safeUserId),
                eq(taskDependencies.taskId, safeTaskId),
                eq(taskDependencies.dependsOnTaskId, safeDependsOnTaskId)
              )
            )
            .limit(1);

          return { success: true, dependency: existing };
        }

        // Cycle violation trigger (check_violation or explicit error message)
        if (
          err?.code === "23514" ||
          cause?.code === "23514" ||
          err?.message?.includes("cycle detected") ||
          cause?.message?.includes("cycle detected") ||
          err?.detail?.includes("cycle detected") ||
          cause?.detail?.includes("cycle detected")
        ) {
          throw new InvariantViolationError(
            "Circular task dependency detected: this dependency would create a cycle."
          );
        }

        throw err;
      }
    })
  );
}

/**
 * Removes a dependency between two tasks owned by the authenticated user.
 */
export async function removeTaskDependency(
  authenticatedUserId: string,
  taskId: string,
  dependsOnTaskId: string,
  actorInfo?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<{ success: true }> {
  const safeUserId = validateUserId(authenticatedUserId);
  const safeTaskId = validateEntityId(taskId, "Task");
  const safeDependsOnTaskId = validateEntityId(
    dependsOnTaskId,
    "Prerequisite Task"
  );

  return await withDeadlockRetry(async () =>
    db.transaction(async (tx) => {
      const [deleted] = await tx
        .delete(taskDependencies)
        .where(
          and(
            eq(taskDependencies.userId, safeUserId),
            eq(taskDependencies.taskId, safeTaskId),
            eq(taskDependencies.dependsOnTaskId, safeDependsOnTaskId)
          )
        )
        .returning({ id: taskDependencies.id });

      if (!deleted) {
        throw new NotFoundError("Task dependency not found.");
      }

      await createAuditLog(
        {
          userId: safeUserId,
          category: "mutation",
          action: "task.dependency_removed",
          status: "success",
          details: {
            taskId: safeTaskId,
            dependsOnTaskId: safeDependsOnTaskId,
          },
          ipAddress: actorInfo?.ipAddress,
          userAgent: actorInfo?.userAgent,
        },
        tx
      );

      return { success: true };
    })
  );
}

/**
 * Retrieves the prerequisite tasks (blockedBy) and dependent tasks (blocks) for a given task.
 */
export async function getTaskDependencies(
  authenticatedUserId: string,
  taskId: string
): Promise<{ blockedBy: TaskDTO[]; blocks: TaskDTO[] }> {
  const safeUserId = validateUserId(authenticatedUserId);
  const safeTaskId = validateEntityId(taskId, "Task");

  // Verify task exists and belongs to the authenticated user
  const [taskRow] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.userId, safeUserId), eq(tasks.id, safeTaskId)))
    .limit(1);

  if (!taskRow) {
    throw new NotFoundError("Task not found.");
  }

  // 1. Blocked By: tasks that this task depends on
  const blockedByRows = await db
    .select({ task: tasks })
    .from(taskDependencies)
    .innerJoin(
      tasks,
      and(
        eq(tasks.id, taskDependencies.dependsOnTaskId),
        eq(tasks.userId, safeUserId)
      )
    )
    .where(
      and(
        eq(taskDependencies.userId, safeUserId),
        eq(taskDependencies.taskId, safeTaskId)
      )
    );

  // 2. Blocks: tasks that depend on this task
  const blocksRows = await db
    .select({ task: tasks })
    .from(taskDependencies)
    .innerJoin(
      tasks,
      and(
        eq(tasks.id, taskDependencies.taskId),
        eq(tasks.userId, safeUserId)
      )
    )
    .where(
      and(
        eq(taskDependencies.userId, safeUserId),
        eq(taskDependencies.dependsOnTaskId, safeTaskId)
      )
    );

  return {
    blockedBy: blockedByRows.map((r) => toTaskDTO(r.task)),
    blocks: blocksRows.map((r) => toTaskDTO(r.task)),
  };
}

/**
 * Universal Quick Capture parser and executor.
 * Parses raw text with inline syntax (!priority, ^due, *scheduled, @energy, #project, ~duration, +tags)
 * and atomically creates the task.
 */
export async function quickCaptureTask(
  authenticatedUserId: string,
  input: { raw: string; overrideProjectId?: string | null },
  actorInfo?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<TaskDTO> {
  const safeUserId = validateUserId(authenticatedUserId);

  if (!input.raw || !input.raw.trim()) {
    throw new InvariantViolationError("Quick capture input cannot be empty.");
  }

  const parsed = parseQuickCaptureInput(input.raw);
  if (!parsed.title) {
    throw new InvariantViolationError("Task title cannot be empty.");
  }

  let resolvedProjectId: string | null = null;

  if (input.overrideProjectId !== undefined) {
    resolvedProjectId = input.overrideProjectId;
  } else if (parsed.projectName) {
    const [matchedProject] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.userId, safeUserId),
          sql`LOWER(${projects.name}) = LOWER(${parsed.projectName})`
        )
      )
      .limit(1);

    if (matchedProject) {
      resolvedProjectId = matchedProject.id;
    }
  }

  return await createTask(
    safeUserId,
    {
      title: parsed.title,
      priority: parsed.priority,
      dueDate: parsed.dueDate,
      scheduledDate: parsed.scheduledDate,
      energyLevel: parsed.energyLevel,
      projectId: resolvedProjectId,
      estimatedDuration: parsed.estimatedDuration,
      tags: parsed.tags,
    },
    actorInfo
  );
}
