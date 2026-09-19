import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  timeBlocks,
  tasks,
  projects,
  goals,
  habits,
  type TimeBlock,
} from "@/server/db/schema";
import { AuthorizationError } from "@/server/auth/guard";
import { createAuditLog } from "@/server/audit";
import {
  findHardCommitmentConflict,
  detectConflicts,
  annotateBlocksWithConflicts,
} from "./conflicts";
import {
  createTimeBlockSchema,
  updateTimeBlockSchema,
  completeTimeBlockSchema,
  type CreateTimeBlockInput,
  type UpdateTimeBlockInput,
  type CompleteTimeBlockInput,
  type TimeBlocksQueryInput,
  type CalendarFeedQueryInput,
} from "./validation";
import { logHabitEntry } from "@/server/habits/service";
import type {
  TimeBlockDTO,
  CalendarFeedDTO,
  CalendarEventDeadline,
  TaskDTO,
  CommitmentLevel,
  TimeBlockStatus,
} from "@/types";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Calendar service cannot be initialized in the browser."
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

export class ConflictError extends Error {
  readonly status = 409;
  readonly code = "CALENDAR_CONFLICT";
  readonly conflictingBlockId?: string;

  constructor(message = "Scheduling conflict detected", conflictingBlockId?: string) {
    super(message);
    this.name = "ConflictError";
    this.conflictingBlockId = conflictingBlockId;
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

export interface ActorInfo {
  actor?: string;
  ipAddress?: string;
  userAgent?: string;
}

export function toTimeBlockDTO(
  row: TimeBlock,
  extras?: {
    hasConflict?: boolean;
    hasHardConflict?: boolean;
    conflictingBlockIds?: string[];
    taskTitle?: string | null;
    projectTitle?: string | null;
    goalTitle?: string | null;
    habitTitle?: string | null;
  }
): TimeBlockDTO {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    description: row.description,
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    durationMinutes: row.durationMinutes,
    status: row.status as TimeBlockStatus,
    commitmentLevel: row.commitmentLevel as CommitmentLevel,
    actualMinutes: row.actualMinutes,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    color: row.color,
    taskId: row.taskId,
    projectId: row.projectId,
    goalId: row.goalId,
    habitId: row.habitId,
    hasConflict: extras?.hasConflict ?? false,
    hasHardConflict: extras?.hasHardConflict ?? false,
    conflictingBlockIds: extras?.conflictingBlockIds ?? [],
    taskTitle: extras?.taskTitle ?? null,
    projectTitle: extras?.projectTitle ?? null,
    goalTitle: extras?.goalTitle ?? null,
    habitTitle: extras?.habitTitle ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Creates a new calendar time block for the user.
 * Enforces:
 * - Hard commitment overlap prevention (CAL-04): throws 409 Conflict if candidate overlaps with another hard block.
 * - Composite foreign key ownership for linked entities.
 * - Transactional audit logging.
 */
export async function createTimeBlock(
  userId: string,
  rawInput: CreateTimeBlockInput,
  actor?: ActorInfo
): Promise<TimeBlockDTO> {
  const validated = createTimeBlockSchema.parse(rawInput);
  const startTime = new Date(validated.startTime);
  const endTime = new Date(validated.endTime);

  const durationMinutes =
    validated.durationMinutes ??
    Math.max(1, Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60)));

  // Validate linked entities ownership
  if (validated.taskId) {
    const [linkedTask] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.id, validated.taskId)));
    if (!linkedTask) {
      throw new InvariantViolationError("Linked task does not exist or belong to user");
    }
  }

  if (validated.projectId) {
    const [linkedProject] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.userId, userId), eq(projects.id, validated.projectId)));
    if (!linkedProject) {
      throw new InvariantViolationError("Linked project does not exist or belong to user");
    }
  }

  if (validated.goalId) {
    const [linkedGoal] = await db
      .select({ id: goals.id })
      .from(goals)
      .where(and(eq(goals.userId, userId), eq(goals.id, validated.goalId)));
    if (!linkedGoal) {
      throw new InvariantViolationError("Linked goal does not exist or belong to user");
    }
  }

  if (validated.habitId) {
    const [linkedHabit] = await db
      .select({ id: habits.id })
      .from(habits)
      .where(and(eq(habits.userId, userId), eq(habits.id, validated.habitId)));
    if (!linkedHabit) {
      throw new InvariantViolationError("Linked habit does not exist or belong to user");
    }
  }

  // Hard commitment overlap prevention
  if (validated.commitmentLevel === "hard") {
    // Check existing active blocks overlapping candidate
    const existingHardBlocks = await db
      .select()
      .from(timeBlocks)
      .where(
        and(
          eq(timeBlocks.userId, userId),
          eq(timeBlocks.commitmentLevel, "hard"),
          sql`${timeBlocks.status} != 'cancelled'`
        )
      );

    const collision = findHardCommitmentConflict(
      { startTime, endTime },
      existingHardBlocks
    );

    if (collision) {
      throw new ConflictError(
        `Cannot schedule hard commitment: overlaps with existing hard commitment '${collision.title}'`,
        collision.id
      );
    }
  }

  const [inserted] = await db
    .insert(timeBlocks)
    .values({
      userId,
      title: validated.title,
      description: validated.description ?? null,
      startTime,
      endTime,
      durationMinutes,
      status: "scheduled",
      commitmentLevel: validated.commitmentLevel,
      color: validated.color ?? null,
      taskId: validated.taskId ?? null,
      projectId: validated.projectId ?? null,
      goalId: validated.goalId ?? null,
      habitId: validated.habitId ?? null,
    })
    .returning();

  await createAuditLog({
    userId,
    category: "system",
    action: "create_time_block",
    status: "success",
    actor: actor?.actor || "user",
    ipAddress: actor?.ipAddress,
    userAgent: actor?.userAgent,
    details: {
      timeBlockId: inserted.id,
      title: inserted.title,
      startTime: inserted.startTime.toISOString(),
      endTime: inserted.endTime.toISOString(),
      commitmentLevel: inserted.commitmentLevel,
    },
  });

  return toTimeBlockDTO(inserted);
}

/**
 * Retrieves a single time block with conflict indicators.
 */
export async function getTimeBlock(
  userId: string,
  blockId: string
): Promise<TimeBlockDTO> {
  const [block] = await db
    .select()
    .from(timeBlocks)
    .where(and(eq(timeBlocks.userId, userId), eq(timeBlocks.id, blockId)));

  if (!block) {
    throw new NotFoundError(`Time block with ID '${blockId}' not found`);
  }

  // Fetch concurrent blocks to calculate conflicts
  const overlappingWindow = await db
    .select()
    .from(timeBlocks)
    .where(
      and(
        eq(timeBlocks.userId, userId),
        sql`${timeBlocks.status} != 'cancelled'`,
        sql`${timeBlocks.startTime} < ${block.endTime}`,
        sql`${timeBlocks.endTime} > ${block.startTime}`
      )
    );

  const conflictsMap = detectConflicts(overlappingWindow);
  const conflict = conflictsMap.get(block.id);

  // Fetch linked entity names if applicable
  let taskTitle: string | null = null;
  let projectTitle: string | null = null;
  let goalTitle: string | null = null;
  let habitTitle: string | null = null;

  if (block.taskId) {
    const [t] = await db
      .select({ title: tasks.title })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.id, block.taskId)));
    taskTitle = t?.title ?? null;
  }
  if (block.projectId) {
    const [p] = await db
      .select({ name: projects.name })
      .from(projects)
      .where(and(eq(projects.userId, userId), eq(projects.id, block.projectId)));
    projectTitle = p?.name ?? null;
  }
  if (block.goalId) {
    const [g] = await db
      .select({ title: goals.title })
      .from(goals)
      .where(and(eq(goals.userId, userId), eq(goals.id, block.goalId)));
    goalTitle = g?.title ?? null;
  }
  if (block.habitId) {
    const [h] = await db
      .select({ title: habits.title })
      .from(habits)
      .where(and(eq(habits.userId, userId), eq(habits.id, block.habitId)));
    habitTitle = h?.title ?? null;
  }

  return toTimeBlockDTO(block, {
    hasConflict: conflict?.hasConflict ?? false,
    hasHardConflict: conflict?.hasHardConflict ?? false,
    conflictingBlockIds: conflict?.conflictingBlockIds ?? [],
    taskTitle,
    projectTitle,
    goalTitle,
    habitTitle,
  });
}

/**
 * Lists time blocks with conflict annotations.
 */
export async function listTimeBlocks(
  userId: string,
  query?: TimeBlocksQueryInput
): Promise<TimeBlockDTO[]> {
  const conditions = [eq(timeBlocks.userId, userId)];

  if (query?.status) {
    conditions.push(eq(timeBlocks.status, query.status));
  }
  if (query?.taskId) {
    conditions.push(eq(timeBlocks.taskId, query.taskId));
  }
  if (query?.habitId) {
    conditions.push(eq(timeBlocks.habitId, query.habitId));
  }
  if (query?.startDate) {
    const start = new Date(query.startDate.includes("T") ? query.startDate : `${query.startDate}T00:00:00.000Z`);
    conditions.push(gte(timeBlocks.endTime, start));
  }
  if (query?.endDate) {
    const end = new Date(query.endDate.includes("T") ? query.endDate : `${query.endDate}T23:59:59.999Z`);
    conditions.push(lte(timeBlocks.startTime, end));
  }

  const rows = await db
    .select()
    .from(timeBlocks)
    .where(and(...conditions))
    .orderBy(timeBlocks.startTime);

  const conflictMap = detectConflicts(rows);

  return rows.map((r) => {
    const c = conflictMap.get(r.id);
    return toTimeBlockDTO(r, {
      hasConflict: c?.hasConflict ?? false,
      hasHardConflict: c?.hasHardConflict ?? false,
      conflictingBlockIds: c?.conflictingBlockIds ?? [],
    });
  });
}

/**
 * Updates an existing time block.
 * Checks hard commitment overlap if timing or commitment level changes.
 * Adjusts linked task's actualDuration if actualMinutes changes on a completed block.
 */
export async function updateTimeBlock(
  userId: string,
  blockId: string,
  rawInput: UpdateTimeBlockInput,
  actor?: ActorInfo
): Promise<TimeBlockDTO> {
  const validated = updateTimeBlockSchema.parse(rawInput);

  const [existing] = await db
    .select()
    .from(timeBlocks)
    .where(and(eq(timeBlocks.userId, userId), eq(timeBlocks.id, blockId)));

  if (!existing) {
    throw new NotFoundError(`Time block with ID '${blockId}' not found`);
  }

  const newStart = validated.startTime ? new Date(validated.startTime) : existing.startTime;
  const newEnd = validated.endTime ? new Date(validated.endTime) : existing.endTime;
  const newCommitment = validated.commitmentLevel ?? existing.commitmentLevel;
  const newStatus = validated.status ?? existing.status;

  if (newEnd <= newStart) {
    throw new InvariantViolationError("End time must be strictly after start time");
  }

  const newDuration =
    validated.durationMinutes ??
    Math.max(1, Math.round((newEnd.getTime() - newStart.getTime()) / (1000 * 60)));

  // If hard commitment, ensure no overlap with other hard commitments
  if (newCommitment === "hard" && newStatus !== "cancelled") {
    const otherHardBlocks = await db
      .select()
      .from(timeBlocks)
      .where(
        and(
          eq(timeBlocks.userId, userId),
          eq(timeBlocks.commitmentLevel, "hard"),
          sql`${timeBlocks.id} != ${blockId}`,
          sql`${timeBlocks.status} != 'cancelled'`
        )
      );

    const collision = findHardCommitmentConflict(
      { id: blockId, startTime: newStart, endTime: newEnd },
      otherHardBlocks
    );

    if (collision) {
      throw new ConflictError(
        `Cannot update hard commitment: overlaps with existing hard commitment '${collision.title}'`,
        collision.id
      );
    }
  }

  // Handle task actualDuration adjustments in a transaction
  return await db.transaction(async (tx) => {
    // If the block is completed and actualMinutes is changing, adjust task analytics
    if (
      existing.status === "completed" &&
      existing.taskId &&
      validated.actualMinutes !== undefined &&
      validated.actualMinutes !== null
    ) {
      const oldActual = existing.actualMinutes ?? 0;
      const diff = validated.actualMinutes - oldActual;

      if (diff !== 0) {
        await tx
          .update(tasks)
          .set({
            actualDuration: sql`GREATEST(0, COALESCE(${tasks.actualDuration}, 0) + ${diff})`,
            updatedAt: new Date(),
          })
          .where(and(eq(tasks.userId, userId), eq(tasks.id, existing.taskId)));
      }
    }

    const [updated] = await tx
      .update(timeBlocks)
      .set({
        title: validated.title ?? existing.title,
        description:
          validated.description !== undefined
            ? validated.description
            : existing.description,
        startTime: newStart,
        endTime: newEnd,
        durationMinutes: newDuration,
        status: newStatus,
        commitmentLevel: newCommitment,
        actualMinutes:
          validated.actualMinutes !== undefined
            ? validated.actualMinutes
            : existing.actualMinutes,
        color: validated.color !== undefined ? validated.color : existing.color,
        taskId: validated.taskId !== undefined ? validated.taskId : existing.taskId,
        projectId:
          validated.projectId !== undefined ? validated.projectId : existing.projectId,
        goalId: validated.goalId !== undefined ? validated.goalId : existing.goalId,
        habitId: validated.habitId !== undefined ? validated.habitId : existing.habitId,
        updatedAt: new Date(),
      })
      .where(and(eq(timeBlocks.userId, userId), eq(timeBlocks.id, blockId)))
      .returning();

    await createAuditLog({
      userId,
      category: "system",
      action: "update_time_block",
      status: "success",
      actor: actor?.actor || "user",
      ipAddress: actor?.ipAddress,
      userAgent: actor?.userAgent,
      details: {
        timeBlockId: blockId,
        updates: validated,
      },
    });

    return toTimeBlockDTO(updated);
  });
}

/**
 * Marks a time block as completed.
 * CAL-03: Transactionally updates linked task's actualDuration by actualMinutes.
 * Optional: can also mark linked task as completed.
 * Optional: if linked to a habit, can automatically log habit entry for the date.
 */
export async function completeTimeBlock(
  userId: string,
  blockId: string,
  rawInput?: CompleteTimeBlockInput,
  actor?: ActorInfo
): Promise<TimeBlockDTO> {
  const validated = rawInput ? completeTimeBlockSchema.parse(rawInput) : {};

  const [existing] = await db
    .select()
    .from(timeBlocks)
    .where(and(eq(timeBlocks.userId, userId), eq(timeBlocks.id, blockId)));

  if (!existing) {
    throw new NotFoundError(`Time block with ID '${blockId}' not found`);
  }

  const actualMinutes = validated.actualMinutes ?? existing.durationMinutes;
  const now = new Date();

  return await db.transaction(async (tx) => {
    // If not previously completed and linked to a task, increment task actualDuration
    if (existing.status !== "completed" && existing.taskId) {
      await tx
        .update(tasks)
        .set({
          actualDuration: sql`GREATEST(0, COALESCE(${tasks.actualDuration}, 0) + ${actualMinutes})`,
          ...(validated.completeLinkedTask
            ? { status: "completed", completedAt: now }
            : {}),
          updatedAt: now,
        })
        .where(and(eq(tasks.userId, userId), eq(tasks.id, existing.taskId)));
    }

    const [updated] = await tx
      .update(timeBlocks)
      .set({
        status: "completed",
        actualMinutes,
        completedAt: now,
        updatedAt: now,
      })
      .where(and(eq(timeBlocks.userId, userId), eq(timeBlocks.id, blockId)))
      .returning();

    // Habit check-in integration (deferred from Plan 02-03)
    if (existing.habitId && validated.logHabitEntry !== false) {
      const blockDate = existing.startTime.toISOString().slice(0, 10);
      try {
        await logHabitEntry(
          userId,
          existing.habitId,
          { date: blockDate, value: 1 },
          actor
        );
      } catch (err) {
        // Idempotent: ignore if already checked in
      }
    }

    await createAuditLog({
      userId,
      category: "system",
      action: "complete_time_block",
      status: "success",
      actor: actor?.actor || "user",
      ipAddress: actor?.ipAddress,
      userAgent: actor?.userAgent,
      details: {
        timeBlockId: blockId,
        actualMinutes,
        taskId: existing.taskId,
        habitId: existing.habitId,
      },
    });

    return toTimeBlockDTO(updated);
  });
}

/**
 * Deletes a time block.
 * If block was completed and linked to a task, transactionally decrements task's actualDuration.
 */
export async function deleteTimeBlock(
  userId: string,
  blockId: string,
  actor?: ActorInfo
): Promise<void> {
  const [existing] = await db
    .select()
    .from(timeBlocks)
    .where(and(eq(timeBlocks.userId, userId), eq(timeBlocks.id, blockId)));

  if (!existing) {
    throw new NotFoundError(`Time block with ID '${blockId}' not found`);
  }

  await db.transaction(async (tx) => {
    // If completed and linked to task, rollback actualDuration
    if (
      existing.status === "completed" &&
      existing.taskId &&
      existing.actualMinutes &&
      existing.actualMinutes > 0
    ) {
      await tx
        .update(tasks)
        .set({
          actualDuration: sql`GREATEST(0, COALESCE(${tasks.actualDuration}, 0) - ${existing.actualMinutes})`,
          updatedAt: new Date(),
        })
        .where(and(eq(tasks.userId, userId), eq(tasks.id, existing.taskId)));
    }

    await tx
      .delete(timeBlocks)
      .where(and(eq(timeBlocks.userId, userId), eq(timeBlocks.id, blockId)));

    await createAuditLog({
      userId,
      category: "system",
      action: "delete_time_block",
      status: "success",
      actor: actor?.actor || "user",
      ipAddress: actor?.ipAddress,
      userAgent: actor?.userAgent,
      details: {
        timeBlockId: blockId,
        title: existing.title,
      },
    });
  });
}

/**
 * Aggregates calendar feed items (time blocks, task deadlines, scheduled tasks, project deadlines, habit cues).
 * Satisfies CAL-01 multi-view calendar aggregation.
 */
export async function getCalendarFeed(
  userId: string,
  query: CalendarFeedQueryInput
): Promise<CalendarFeedDTO> {
  const windowStart = new Date(
    query.startDate.includes("T") ? query.startDate : `${query.startDate}T00:00:00.000Z`
  );
  const windowEnd = new Date(
    query.endDate.includes("T") ? query.endDate : `${query.endDate}T23:59:59.999Z`
  );

  // 1. Fetch time blocks overlapping window
  const blockRows = await db
    .select()
    .from(timeBlocks)
    .where(
      and(
        eq(timeBlocks.userId, userId),
        lte(timeBlocks.startTime, windowEnd),
        gte(timeBlocks.endTime, windowStart)
      )
    )
    .orderBy(timeBlocks.startTime);

  const conflictMap = detectConflicts(blockRows);

  let totalScheduledMinutes = 0;
  let totalCompletedMinutes = 0;
  let conflictCount = 0;

  const annotatedBlocks = blockRows.map((r) => {
    const c = conflictMap.get(r.id);
    const hasConflict = c?.hasConflict ?? false;
    const hasHardConflict = c?.hasHardConflict ?? false;

    if (r.status !== "cancelled") {
      totalScheduledMinutes += r.durationMinutes;
      if (r.status === "completed") {
        totalCompletedMinutes += r.actualMinutes ?? r.durationMinutes;
      }
      if (hasConflict) {
        conflictCount++;
      }
    }

    return toTimeBlockDTO(r, {
      hasConflict,
      hasHardConflict,
      conflictingBlockIds: c?.conflictingBlockIds ?? [],
    });
  });

  const deadlines: CalendarEventDeadline[] = [];

  // 2. Fetch tasks with due dates in window
  const dueTasks = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        sql`${tasks.status} != 'cancelled'`,
        sql`${tasks.dueDate} >= ${windowStart}`,
        sql`${tasks.dueDate} <= ${windowEnd}`
      )
    );

  for (const t of dueTasks) {
    if (t.dueDate) {
      deadlines.push({
        id: `due-${t.id}`,
        type: "task_due",
        title: `Due: ${t.title}`,
        date: t.dueDate.toISOString(),
        entityId: t.id,
        status: t.status,
        priority: t.priority as any,
      });
    }
  }

  // 3. Fetch tasks scheduled in window
  const scheduledTaskRows = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        sql`${tasks.status} != 'completed'`,
        sql`${tasks.status} != 'cancelled'`,
        sql`${tasks.scheduledDate} >= ${windowStart}`,
        sql`${tasks.scheduledDate} <= ${windowEnd}`
      )
    );

  for (const t of scheduledTaskRows) {
    if (t.scheduledDate) {
      deadlines.push({
        id: `sched-${t.id}`,
        type: "task_scheduled",
        title: `Scheduled: ${t.title}`,
        date: t.scheduledDate.toISOString(),
        entityId: t.id,
        status: t.status,
        priority: t.priority as any,
      });
    }
  }

  // 4. Fetch projects with deadlines in window
  const projectDeadlines = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.userId, userId),
        sql`${projects.status} != 'archived'`,
        sql`${projects.deadline} >= ${windowStart}`,
        sql`${projects.deadline} <= ${windowEnd}`
      )
    );

  for (const p of projectDeadlines) {
    if (p.deadline) {
      deadlines.push({
        id: `proj-${p.id}`,
        type: "project_deadline",
        title: `Project Deadline: ${p.name}`,
        date: p.deadline.toISOString(),
        entityId: p.id,
        status: p.status,
        priority: p.priority as any,
      });
    }
  }

  // 5. Fetch habit scheduled cues
  const activeHabits = await db
    .select()
    .from(habits)
    .where(and(eq(habits.userId, userId), eq(habits.status, "active")));

  for (const h of activeHabits) {
    if (h.reminderTime) {
      deadlines.push({
        id: `habit-${h.id}`,
        type: "habit_cue",
        title: `Habit: ${h.title} (${h.timeOfDay})`,
        date: windowStart.toISOString().slice(0, 10),
        time: h.reminderTime,
        entityId: h.id,
        status: h.status,
      });
    }
  }

  return {
    timeBlocks: annotatedBlocks,
    deadlines,
    scheduledTasks: scheduledTaskRows.map((t) => ({
      id: t.id,
      userId: t.userId,
      projectId: t.projectId,
      parentTaskId: t.parentTaskId,
      milestoneId: t.milestoneId,
      title: t.title,
      description: t.description,
      status: t.status as any,
      priority: t.priority as any,
      scheduledDate: t.scheduledDate ? t.scheduledDate.toISOString() : null,
      energyLevel: t.energyLevel as any,
      recurrenceRule: t.recurrenceRule,
      goalId: t.goalId,
      habitId: t.habitId,
      noteId: t.noteId,
      personId: t.personId,
      tags: t.tags ?? [],
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      estimatedDuration: t.estimatedDuration,
      actualDuration: t.actualDuration,
      completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      priorityScore: 0,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    })),
    totalScheduledMinutes,
    totalCompletedMinutes,
    conflictCount,
  };
}
