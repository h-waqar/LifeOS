import { z } from "zod";
import { eq, and } from "drizzle-orm";
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
 * Creates a task strictly scoped to the authenticated user.
 * Validates cross-entity ownership for projectId and parentTaskId before insertion.
 */
export async function createTask(
  authenticatedUserId: string,
  input: CreateTaskInput,
  actorInfo?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<TaskDTO> {
  const safeUserId = validateUserId(authenticatedUserId);
  const validated = createTaskSchema.parse(input);

  return await db.transaction(async (tx) => {
    // 1. Verify project ownership if projectId is provided
    if (validated.projectId) {
      const projectRows = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.userId, safeUserId),
            eq(projects.id, validated.projectId)
          )
        )
        .limit(1);

      if (projectRows.length === 0) {
        throw new NotFoundError("Project not found.");
      }
    }

    // 2. Verify parent task ownership if parentTaskId is provided
    if (validated.parentTaskId) {
      const parentRows = await tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, safeUserId),
            eq(tasks.id, validated.parentTaskId)
          )
        )
        .limit(1);

      if (parentRows.length === 0) {
        throw new NotFoundError("Parent task not found.");
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
        projectId: validated.projectId ?? null,
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

    await createAuditLog({
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
    });

    return toTaskDTO(inserted);
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
 * Updates a task strictly scoped to the authenticated user.
 * Prevents self-referential subtasks and validates relational ownership.
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

  return await db.transaction(async (tx) => {
    // 1. Fetch existing task scoped to user
    const [existing] = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, safeUserId), eq(tasks.id, safeTaskId)))
      .limit(1);

    if (!existing) {
      throw new NotFoundError("Task not found.");
    }

    // 2. Prevent self-referencing parent task
    if (validated.parentTaskId !== undefined) {
      if (validated.parentTaskId === safeTaskId) {
        throw new InvariantViolationError("A task cannot be its own parent.");
      }

      if (validated.parentTaskId !== null) {
        const parentRows = await tx
          .select({ id: tasks.id })
          .from(tasks)
          .where(
            and(
              eq(tasks.userId, safeUserId),
              eq(tasks.id, validated.parentTaskId)
            )
          )
          .limit(1);

        if (parentRows.length === 0) {
          throw new NotFoundError("Parent task not found.");
        }
      }
    }

    // 3. Verify project ownership if projectId is changed to non-null
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
        .limit(1);

      if (projectRows.length === 0) {
        throw new NotFoundError("Project not found.");
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
    if (validated.status !== undefined) updates.status = validated.status;
    if (validated.priority !== undefined) updates.priority = validated.priority;
    if (validated.projectId !== undefined)
      updates.projectId = validated.projectId;
    if (validated.parentTaskId !== undefined)
      updates.parentTaskId = validated.parentTaskId;
    if (validated.dueDate !== undefined)
      updates.dueDate = validated.dueDate ? new Date(validated.dueDate) : null;
    if (validated.estimatedDuration !== undefined)
      updates.estimatedDuration = validated.estimatedDuration;
    if (validated.actualDuration !== undefined)
      updates.actualDuration = validated.actualDuration;

    updates.completedAt = nextCompletedAt;

    const [updated] = await tx
      .update(tasks)
      .set(updates)
      .where(and(eq(tasks.userId, safeUserId), eq(tasks.id, safeTaskId)))
      .returning();

    await createAuditLog({
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
    });

    return toTaskDTO(updated);
  });
}

/**
 * Deletes a task strictly scoped to the authenticated user.
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

  const [deleted] = await db
    .delete(tasks)
    .where(and(eq(tasks.userId, safeUserId), eq(tasks.id, safeTaskId)))
    .returning({ id: tasks.id });

  if (!deleted) {
    throw new NotFoundError("Task not found.");
  }

  await createAuditLog({
    userId: safeUserId,
    category: "mutation",
    action: "task.delete",
    status: "success",
    details: { taskId: safeTaskId },
    ipAddress: actorInfo?.ipAddress,
    userAgent: actorInfo?.userAgent,
  });

  return { success: true };
}
