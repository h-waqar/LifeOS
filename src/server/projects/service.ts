import { z } from "zod";
import { eq, and, sql, desc } from "drizzle-orm";
import { db } from "@/server/db";
import {
  projects,
  projectMilestones,
  tasks,
  goals,
  type Project,
  type ProjectMilestone,
} from "@/server/db/schema";
import { AuthorizationError } from "@/server/auth/guard";
import { createAuditLog } from "@/server/audit";
import { calculateProjectProgress } from "@/server/goals/rollup";
import { recalculateGoalProgress } from "@/server/goals/service";
import type {
  ProjectDTO,
  ProjectMilestoneDTO,
  MilestoneStatus,
  LifeArea,
  ProjectStatus,
  Priority,
} from "@/types";

export { type ProjectDTO, type ProjectMilestoneDTO };

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Projects service cannot be initialized in the browser."
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

export function toProjectMilestoneDTO(row: ProjectMilestone): ProjectMilestoneDTO {
  return {
    id: row.id,
    userId: row.userId,
    projectId: row.projectId,
    title: row.title,
    description: row.description,
    targetDate: row.targetDate ? row.targetDate.toISOString() : null,
    status: row.status as MilestoneStatus,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toProjectDTO(
  row: Project,
  computedProgress = 0,
  counts?: {
    milestonesCount?: number;
    tasksCount?: number;
    completedTasksCount?: number;
  }
): ProjectDTO {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description,
    area: (row.area ?? "general") as LifeArea,
    status: row.status as ProjectStatus,
    priority: row.priority as Priority,
    startDate: row.startDate ? row.startDate.toISOString() : null,
    deadline: row.deadline ? row.deadline.toISOString() : null,
    goalId: row.goalId ?? null,
    progress: computedProgress,
    milestonesCount: counts?.milestonesCount,
    tasksCount: counts?.tasksCount,
    completedTasksCount: counts?.completedTasksCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const createProjectSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Project name cannot be empty or whitespace")
      .max(255, "Project name cannot exceed 255 characters"),
    description: z
      .string()
      .trim()
      .max(2000, "Project description cannot exceed 2000 characters")
      .nullish(),
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
      .enum(["planning", "active", "paused", "completed", "archived"])
      .optional()
      .default("planning"),
    priority: z
      .enum(["low", "medium", "high", "critical"])
      .optional()
      .default("medium"),
    startDate: z
      .string()
      .datetime({ message: "startDate must be a valid ISO 8601 date string" })
      .nullish(),
    deadline: z
      .string()
      .datetime({ message: "deadline must be a valid ISO 8601 date string" })
      .nullish(),
    goalId: z.string().trim().min(1).nullish(),
    userId: z
      .never({ message: "Client cannot specify userId in payload" })
      .optional(),
    id: z.never({ message: "Client cannot specify id in payload" }).optional(),
  })
  .strict();

export type CreateProjectInput = z.input<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Project name cannot be empty or whitespace")
      .max(255, "Project name cannot exceed 255 characters")
      .optional(),
    description: z
      .string()
      .trim()
      .max(2000, "Project description cannot exceed 2000 characters")
      .nullish(),
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
      .enum(["planning", "active", "paused", "completed", "archived"])
      .optional(),
    priority: z.enum(["low", "medium", "high", "critical"]).optional(),
    startDate: z
      .string()
      .datetime({ message: "startDate must be a valid ISO 8601 date string" })
      .nullish(),
    deadline: z
      .string()
      .datetime({ message: "deadline must be a valid ISO 8601 date string" })
      .nullish(),
    goalId: z.string().trim().min(1).nullish(),
    userId: z
      .never({ message: "Client cannot specify userId in payload" })
      .optional(),
    id: z.never({ message: "Client cannot specify id in payload" }).optional(),
  })
  .strict();

export type UpdateProjectInput = z.input<typeof updateProjectSchema>;

export const createMilestoneSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Milestone title cannot be empty or whitespace")
      .max(255, "Milestone title cannot exceed 255 characters"),
    description: z
      .string()
      .trim()
      .max(2000, "Milestone description cannot exceed 2000 characters")
      .nullish(),
    targetDate: z
      .string()
      .datetime({ message: "targetDate must be a valid ISO 8601 date string" })
      .nullish(),
    status: z.enum(["pending", "completed"]).optional().default("pending"),
    sortOrder: z.number().int().optional().default(0),
    userId: z
      .never({ message: "Client cannot specify userId in payload" })
      .optional(),
    id: z.never({ message: "Client cannot specify id in payload" }).optional(),
  })
  .strict();

export type CreateMilestoneInput = z.input<typeof createMilestoneSchema>;

export const updateMilestoneSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Milestone title cannot be empty or whitespace")
      .max(255, "Milestone title cannot exceed 255 characters")
      .optional(),
    description: z
      .string()
      .trim()
      .max(2000, "Milestone description cannot exceed 2000 characters")
      .nullish(),
    targetDate: z
      .string()
      .datetime({ message: "targetDate must be a valid ISO 8601 date string" })
      .nullish(),
    status: z.enum(["pending", "completed"]).optional(),
    completedAt: z
      .string()
      .datetime({ message: "completedAt must be a valid ISO 8601 date string" })
      .nullish(),
    sortOrder: z.number().int().optional(),
    userId: z
      .never({ message: "Client cannot specify userId in payload" })
      .optional(),
    id: z.never({ message: "Client cannot specify id in payload" }).optional(),
  })
  .strict();

export type UpdateMilestoneInput = z.input<typeof updateMilestoneSchema>;

function validateUserId(userId: unknown): string {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new AuthorizationError(
      "Authenticated user ID is required to access projects."
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
 * Creates a project strictly scoped to the authenticated user within an atomic transaction.
 */
export async function createProject(
  authenticatedUserId: string,
  input: CreateProjectInput,
  actorInfo?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<ProjectDTO> {
  const safeUserId = validateUserId(authenticatedUserId);
  const validated = createProjectSchema.parse(input);

  return await db.transaction(async (tx) => {
    // If goalId provided, verify goal exists and belongs to user
    if (validated.goalId) {
      const goalRows = await tx
        .select({ id: goals.id })
        .from(goals)
        .where(and(eq(goals.userId, safeUserId), eq(goals.id, validated.goalId)))
        .for("share")
        .limit(1);

      if (goalRows.length === 0) {
        throw new NotFoundError("Goal not found.");
      }
    }

    const [inserted] = await tx
      .insert(projects)
      .values({
        userId: safeUserId,
        name: validated.name,
        description: validated.description ?? null,
        area: validated.area ?? "general",
        status: validated.status ?? "planning",
        priority: validated.priority ?? "medium",
        startDate: validated.startDate ? new Date(validated.startDate) : null,
        deadline: validated.deadline ? new Date(validated.deadline) : null,
        goalId: validated.goalId ?? null,
      })
      .returning();

    // If linked to goal, recalculate goal progress
    if (inserted.goalId) {
      await recalculateGoalProgress(safeUserId, inserted.goalId, tx);
    }

    await createAuditLog(
      {
        userId: safeUserId,
        category: "mutation",
        action: "project.create",
        status: "success",
        details: {
          projectId: inserted.id,
          name: inserted.name,
          status: inserted.status,
          area: inserted.area,
          goalId: inserted.goalId,
        },
        ipAddress: actorInfo?.ipAddress,
        userAgent: actorInfo?.userAgent,
      },
      tx
    );

    return toProjectDTO(inserted, 0, {
      milestonesCount: 0,
      tasksCount: 0,
      completedTasksCount: 0,
    });
  });
}

/**
 * Retrieves a single project strictly scoped to the authenticated user,
 * calculating real-time progress and counts.
 */
export async function getProject(
  authenticatedUserId: string,
  projectId: string
): Promise<ProjectDTO | null> {
  const safeUserId = validateUserId(authenticatedUserId);
  const safeProjectId = validateEntityId(projectId, "Project");

  const results = await db
    .select()
    .from(projects)
    .where(and(eq(projects.userId, safeUserId), eq(projects.id, safeProjectId)))
    .limit(1);

  if (!results[0]) {
    return null;
  }

  const row = results[0];

  const projectTaskList = await db
    .select({ status: tasks.status })
    .from(tasks)
    .where(and(eq(tasks.userId, safeUserId), eq(tasks.projectId, safeProjectId)));

  const projectMilestoneList = await db
    .select({ status: projectMilestones.status })
    .from(projectMilestones)
    .where(
      and(
        eq(projectMilestones.userId, safeUserId),
        eq(projectMilestones.projectId, safeProjectId)
      )
    );

  const progress = calculateProjectProgress({
    tasks: projectTaskList,
    milestones: projectMilestoneList,
    status: row.status,
  });

  const completedTasks = projectTaskList.filter(
    (t) => t.status === "completed"
  ).length;

  return toProjectDTO(row, progress, {
    milestonesCount: projectMilestoneList.length,
    tasksCount: projectTaskList.length,
    completedTasksCount: completedTasks,
  });
}

/**
 * Lists projects strictly scoped to the authenticated user with real-time progress.
 */
export async function listProjects(
  authenticatedUserId: string,
  filters?: { status?: string; area?: string; goalId?: string }
): Promise<ProjectDTO[]> {
  const safeUserId = validateUserId(authenticatedUserId);

  const conditions = [eq(projects.userId, safeUserId)];

  if (filters?.status) {
    conditions.push(eq(projects.status, filters.status as Project["status"]));
  }
  if (filters?.area) {
    conditions.push(eq(projects.area, filters.area as Project["area"]));
  }
  if (filters?.goalId) {
    conditions.push(eq(projects.goalId, filters.goalId));
  }

  const rows = await db
    .select()
    .from(projects)
    .where(and(...conditions))
    .orderBy(desc(projects.createdAt));

  if (rows.length === 0) return [];

  // Fetch all tasks and milestones for the user to compute progress per project
  const allTasks = await db
    .select({ projectId: tasks.projectId, status: tasks.status })
    .from(tasks)
    .where(and(eq(tasks.userId, safeUserId), sql`${tasks.projectId} IS NOT NULL`));

  const allMilestones = await db
    .select({
      projectId: projectMilestones.projectId,
      status: projectMilestones.status,
    })
    .from(projectMilestones)
    .where(eq(projectMilestones.userId, safeUserId));

  // Map tasks by projectId
  const tasksByProject = new Map<string, Array<{ status: string }>>();
  for (const t of allTasks) {
    if (t.projectId) {
      const list = tasksByProject.get(t.projectId) ?? [];
      list.push(t);
      tasksByProject.set(t.projectId, list);
    }
  }

  // Map milestones by projectId
  const milestonesByProject = new Map<string, Array<{ status: string }>>();
  for (const m of allMilestones) {
    const list = milestonesByProject.get(m.projectId) ?? [];
    list.push(m);
    milestonesByProject.set(m.projectId, list);
  }

  return rows.map((row) => {
    const pTasks = tasksByProject.get(row.id) ?? [];
    const pMilestones = milestonesByProject.get(row.id) ?? [];
    const prog = calculateProjectProgress({
      tasks: pTasks,
      milestones: pMilestones,
      status: row.status,
    });
    const completedTasks = pTasks.filter((t) => t.status === "completed").length;

    return toProjectDTO(row, prog, {
      milestonesCount: pMilestones.length,
      tasksCount: pTasks.length,
      completedTasksCount: completedTasks,
    });
  });
}

/**
 * Updates a project strictly scoped to the authenticated user within an atomic transaction.
 * Acquires a row-level lock (FOR UPDATE).
 */
export async function updateProject(
  authenticatedUserId: string,
  projectId: string,
  input: UpdateProjectInput,
  actorInfo?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<ProjectDTO> {
  const safeUserId = validateUserId(authenticatedUserId);
  const safeProjectId = validateEntityId(projectId, "Project");
  const validated = updateProjectSchema.parse(input);

  return await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(projects)
      .where(
        and(eq(projects.userId, safeUserId), eq(projects.id, safeProjectId))
      )
      .for("update")
      .limit(1);

    if (!existing) {
      throw new NotFoundError("Project not found.");
    }

    if (validated.goalId !== undefined && validated.goalId !== null) {
      const goalRows = await tx
        .select({ id: goals.id })
        .from(goals)
        .where(and(eq(goals.userId, safeUserId), eq(goals.id, validated.goalId)))
        .for("share")
        .limit(1);

      if (goalRows.length === 0) {
        throw new NotFoundError("Goal not found.");
      }
    }

    const updates: Partial<Omit<Project, "id" | "userId" | "createdAt">> = {
      updatedAt: new Date(),
    };

    if (validated.name !== undefined) updates.name = validated.name;
    if (validated.description !== undefined)
      updates.description = validated.description;
    if (validated.area !== undefined) updates.area = validated.area;
    if (validated.status !== undefined) updates.status = validated.status;
    if (validated.priority !== undefined) updates.priority = validated.priority;
    if (validated.startDate !== undefined)
      updates.startDate = validated.startDate
        ? new Date(validated.startDate)
        : null;
    if (validated.deadline !== undefined)
      updates.deadline = validated.deadline
        ? new Date(validated.deadline)
        : null;
    if (validated.goalId !== undefined) updates.goalId = validated.goalId;

    const [updated] = await tx
      .update(projects)
      .set(updates)
      .where(
        and(eq(projects.userId, safeUserId), eq(projects.id, safeProjectId))
      )
      .returning();

    if (!updated) {
      throw new NotFoundError("Project not found.");
    }

    // Recalculate goal progress for new goal and previous goal if changed
    if (updated.goalId) {
      await recalculateGoalProgress(safeUserId, updated.goalId, tx);
    }
    if (existing.goalId && existing.goalId !== updated.goalId) {
      await recalculateGoalProgress(safeUserId, existing.goalId, tx);
    }

    await createAuditLog(
      {
        userId: safeUserId,
        category: "mutation",
        action: "project.update",
        status: "success",
        details: {
          projectId: safeProjectId,
          updatedFields: Object.keys(validated),
        },
        ipAddress: actorInfo?.ipAddress,
        userAgent: actorInfo?.userAgent,
      },
      tx
    );

    // Compute progress
    const pTasks = await tx
      .select({ status: tasks.status })
      .from(tasks)
      .where(and(eq(tasks.userId, safeUserId), eq(tasks.projectId, safeProjectId)));

    const pMilestones = await tx
      .select({ status: projectMilestones.status })
      .from(projectMilestones)
      .where(
        and(
          eq(projectMilestones.userId, safeUserId),
          eq(projectMilestones.projectId, safeProjectId)
        )
      );

    const progress = calculateProjectProgress({
      tasks: pTasks,
      milestones: pMilestones,
      status: updated.status,
    });

    return toProjectDTO(updated, progress, {
      milestonesCount: pMilestones.length,
      tasksCount: pTasks.length,
      completedTasksCount: pTasks.filter((t) => t.status === "completed").length,
    });
  });
}

/**
 * Deletes a project strictly scoped to the authenticated user within an atomic transaction.
 * Associated tasks have their project_id set to null via foreign key ON DELETE SET NULL.
 * Milestones are deleted via CASCADE.
 */
export async function deleteProject(
  authenticatedUserId: string,
  projectId: string,
  actorInfo?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<{ success: true }> {
  const safeUserId = validateUserId(authenticatedUserId);
  const safeProjectId = validateEntityId(projectId, "Project");

  return await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: projects.id, goalId: projects.goalId })
      .from(projects)
      .where(
        and(eq(projects.userId, safeUserId), eq(projects.id, safeProjectId))
      )
      .for("update")
      .limit(1);

    if (!existing) {
      throw new NotFoundError("Project not found.");
    }

    const [deleted] = await tx
      .delete(projects)
      .where(
        and(eq(projects.userId, safeUserId), eq(projects.id, safeProjectId))
      )
      .returning({ id: projects.id });

    if (!deleted) {
      throw new NotFoundError("Project not found.");
    }

    // If was linked to a goal, recalculate goal progress
    if (existing.goalId) {
      await recalculateGoalProgress(safeUserId, existing.goalId, tx);
    }

    await createAuditLog(
      {
        userId: safeUserId,
        category: "mutation",
        action: "project.delete",
        status: "success",
        details: { projectId: safeProjectId },
        ipAddress: actorInfo?.ipAddress,
        userAgent: actorInfo?.userAgent,
      },
      tx
    );

    return { success: true };
  });
}

// ----------------------------------------------------------------------
// Project Milestones Sub-Service
// ----------------------------------------------------------------------

/**
 * Adds a milestone to a project and triggers project and goal progress rollups.
 */
export async function addMilestone(
  authenticatedUserId: string,
  projectId: string,
  input: CreateMilestoneInput,
  actorInfo?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<ProjectMilestoneDTO> {
  const safeUserId = validateUserId(authenticatedUserId);
  const safeProjectId = validateEntityId(projectId, "Project");
  const validated = createMilestoneSchema.parse(input);

  return await db.transaction(async (tx) => {
    // Verify project ownership
    const [proj] = await tx
      .select({ id: projects.id, goalId: projects.goalId })
      .from(projects)
      .where(and(eq(projects.userId, safeUserId), eq(projects.id, safeProjectId)))
      .for("share")
      .limit(1);

    if (!proj) {
      throw new NotFoundError("Project not found.");
    }

    const finalStatus = validated.status ?? "pending";
    const completedAt = finalStatus === "completed" ? new Date() : null;

    const [inserted] = await tx
      .insert(projectMilestones)
      .values({
        userId: safeUserId,
        projectId: safeProjectId,
        title: validated.title,
        description: validated.description ?? null,
        targetDate: validated.targetDate ? new Date(validated.targetDate) : null,
        status: finalStatus,
        completedAt,
        sortOrder: validated.sortOrder ?? 0,
      })
      .returning();

    // Trigger goal progress rollup if project is linked to goal
    if (proj.goalId) {
      await recalculateGoalProgress(safeUserId, proj.goalId, tx);
    }

    await createAuditLog(
      {
        userId: safeUserId,
        category: "mutation",
        action: "project.milestone.create",
        status: "success",
        details: {
          projectId: safeProjectId,
          milestoneId: inserted.id,
          title: inserted.title,
        },
        ipAddress: actorInfo?.ipAddress,
        userAgent: actorInfo?.userAgent,
      },
      tx
    );

    return toProjectMilestoneDTO(inserted);
  });
}

/**
 * Lists all milestones for a project in sort order.
 */
export async function listMilestones(
  authenticatedUserId: string,
  projectId: string
): Promise<ProjectMilestoneDTO[]> {
  const safeUserId = validateUserId(authenticatedUserId);
  const safeProjectId = validateEntityId(projectId, "Project");

  // Verify project ownership
  const [proj] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.userId, safeUserId), eq(projects.id, safeProjectId)))
    .limit(1);

  if (!proj) {
    throw new NotFoundError("Project not found.");
  }

  const rows = await db
    .select()
    .from(projectMilestones)
    .where(
      and(
        eq(projectMilestones.userId, safeUserId),
        eq(projectMilestones.projectId, safeProjectId)
      )
    )
    .orderBy(projectMilestones.sortOrder, projectMilestones.createdAt);

  return rows.map(toProjectMilestoneDTO);
}

/**
 * Updates a milestone, enforcing completedAt invariants and triggering progress rollups.
 */
export async function updateMilestone(
  authenticatedUserId: string,
  projectId: string,
  milestoneId: string,
  input: UpdateMilestoneInput,
  actorInfo?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<ProjectMilestoneDTO> {
  const safeUserId = validateUserId(authenticatedUserId);
  const safeProjectId = validateEntityId(projectId, "Project");
  const safeMilestoneId = validateEntityId(milestoneId, "Milestone");
  const validated = updateMilestoneSchema.parse(input);

  return await db.transaction(async (tx) => {
    // Lock milestone and project
    const [existing] = await tx
      .select()
      .from(projectMilestones)
      .where(
        and(
          eq(projectMilestones.userId, safeUserId),
          eq(projectMilestones.projectId, safeProjectId),
          eq(projectMilestones.id, safeMilestoneId)
        )
      )
      .for("update")
      .limit(1);

    if (!existing) {
      throw new NotFoundError("Milestone not found.");
    }

    const [proj] = await tx
      .select({ goalId: projects.goalId })
      .from(projects)
      .where(and(eq(projects.userId, safeUserId), eq(projects.id, safeProjectId)))
      .limit(1);

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

    const updates: Partial<ProjectMilestone> = {
      updatedAt: new Date(),
      completedAt: nextCompletedAt,
    };

    if (validated.title !== undefined) updates.title = validated.title;
    if (validated.description !== undefined)
      updates.description = validated.description;
    if (validated.targetDate !== undefined)
      updates.targetDate = validated.targetDate
        ? new Date(validated.targetDate)
        : null;
    if (validated.status !== undefined) updates.status = nextStatus;
    if (validated.sortOrder !== undefined) updates.sortOrder = validated.sortOrder;

    const [updated] = await tx
      .update(projectMilestones)
      .set(updates)
      .where(
        and(
          eq(projectMilestones.userId, safeUserId),
          eq(projectMilestones.projectId, safeProjectId),
          eq(projectMilestones.id, safeMilestoneId)
        )
      )
      .returning();

    // Trigger goal progress rollup if project is linked to goal
    if (proj?.goalId) {
      await recalculateGoalProgress(safeUserId, proj.goalId, tx);
    }

    await createAuditLog(
      {
        userId: safeUserId,
        category: "mutation",
        action: "project.milestone.update",
        status: "success",
        details: {
          projectId: safeProjectId,
          milestoneId: safeMilestoneId,
          updatedFields: Object.keys(validated),
        },
        ipAddress: actorInfo?.ipAddress,
        userAgent: actorInfo?.userAgent,
      },
      tx
    );

    return toProjectMilestoneDTO(updated);
  });
}

/**
 * Deletes a milestone and triggers progress rollups.
 */
export async function deleteMilestone(
  authenticatedUserId: string,
  projectId: string,
  milestoneId: string,
  actorInfo?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<{ success: true }> {
  const safeUserId = validateUserId(authenticatedUserId);
  const safeProjectId = validateEntityId(projectId, "Project");
  const safeMilestoneId = validateEntityId(milestoneId, "Milestone");

  return await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: projectMilestones.id })
      .from(projectMilestones)
      .where(
        and(
          eq(projectMilestones.userId, safeUserId),
          eq(projectMilestones.projectId, safeProjectId),
          eq(projectMilestones.id, safeMilestoneId)
        )
      )
      .for("update")
      .limit(1);

    if (!existing) {
      throw new NotFoundError("Milestone not found.");
    }

    const [proj] = await tx
      .select({ goalId: projects.goalId })
      .from(projects)
      .where(and(eq(projects.userId, safeUserId), eq(projects.id, safeProjectId)))
      .limit(1);

    await tx
      .delete(projectMilestones)
      .where(
        and(
          eq(projectMilestones.userId, safeUserId),
          eq(projectMilestones.projectId, safeProjectId),
          eq(projectMilestones.id, safeMilestoneId)
        )
      );

    if (proj?.goalId) {
      await recalculateGoalProgress(safeUserId, proj.goalId, tx);
    }

    await createAuditLog(
      {
        userId: safeUserId,
        category: "mutation",
        action: "project.milestone.delete",
        status: "success",
        details: {
          projectId: safeProjectId,
          milestoneId: safeMilestoneId,
        },
        ipAddress: actorInfo?.ipAddress,
        userAgent: actorInfo?.userAgent,
      },
      tx
    );

    return { success: true };
  });
}
