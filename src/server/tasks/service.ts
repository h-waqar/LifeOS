import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { tasks, projects, type Task } from "@/server/db/schema";
import { AuthorizationError } from "@/server/auth/guard";
import { createAuditLog } from "@/server/audit";

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
  dueDate: string | null;
  estimatedDuration: number | null;
  actualDuration: number | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toTaskDTO(row: Task): TaskDTO {
  return {
    id: row.id,
    userId: row.userId,
    projectId: row.projectId,
    parentTaskId: row.parentTaskId,
    title: row.title,
    description: row.description,
    status: row.status as TaskDTO["status"],
    priority: row.priority as TaskDTO["priority"],
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    estimatedDuration: row.estimatedDuration,
    actualDuration: row.actualDuration,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

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

/**
 * Retrieves a single task strictly scoped to the authenticated user.
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

  return toTaskDTO(results[0]);
}

/**
 * Lists tasks strictly scoped to the authenticated user with optional filtering.
 */
export async function listTasks(
  authenticatedUserId: string,
  filters?: {
    status?: string;
    projectId?: string;
    priority?: string;
  }
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

  const rows = await db
    .select()
    .from(tasks)
    .where(and(...conditions));

  return rows.map(toTaskDTO);
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
        .select({ id: tasks.id })
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
