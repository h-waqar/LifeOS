import { eq, and, desc, inArray, gte, lte } from "drizzle-orm";
import { db } from "@/server/db";
import {
  habits,
  habitEntries,
  goals,
  type Habit,
  type HabitEntry,
} from "@/server/db/schema";
import { AuthorizationError } from "@/server/auth/guard";
import { createAuditLog } from "@/server/audit";
import {
  calculateStreakStats,
  getStreakCalendar,
  normalizeDate,
  daysDifference,
  type StreakStats,
  type StreakDayInfo,
} from "./streaks";
import {
  createHabitSchema,
  updateHabitSchema,
  logHabitEntrySchema,
} from "./validation";
import type {
  HabitDTO,
  HabitEntryDTO,
  HabitFrequency,
  TimeOfDayCue,
  HabitStatus,
} from "@/types";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Habits service cannot be initialized in the browser."
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

export interface ActorInfo {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface ListHabitsFilters {
  status?: string;
  timeOfDay?: string;
  goalId?: string;
}

function validateUserId(userId: unknown): string {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new AuthorizationError(
      "Authenticated user ID is required to access habits."
    );
  }
  return userId.trim();
}

function validateEntityId(id: unknown, entityName = "Habit"): string {
  if (!id || typeof id !== "string" || !id.trim()) {
    throw new NotFoundError(`${entityName} ID is invalid.`);
  }
  return id.trim();
}

export function toHabitEntryDTO(row: HabitEntry): HabitEntryDTO {
  return {
    id: row.id,
    userId: row.userId,
    habitId: row.habitId,
    date: row.date,
    value: row.value,
    targetValue: row.targetValue,
    notes: row.notes,
    completedAt: row.completedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toHabitDTO(
  row: Habit,
  stats?: StreakStats,
  entries?: HabitEntryDTO[]
): HabitDTO {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    description: row.description,
    frequency: row.frequency as HabitFrequency,
    frequencyTarget: row.frequencyTarget,
    frequencyDays: (row.frequencyDays as number[]) || [],
    intervalDays: row.intervalDays,
    targetValue: row.targetValue,
    unit: row.unit,
    timeOfDay: row.timeOfDay as TimeOfDayCue,
    reminderTime: row.reminderTime,
    goalId: row.goalId,
    identityStatement: row.identityStatement,
    status: row.status as HabitStatus,
    currentStreak: stats !== undefined ? stats.currentStreak : row.currentStreak,
    longestStreak: stats !== undefined ? stats.longestStreak : row.longestStreak,
    completionRate30d: stats?.completionRate30d,
    completionRateAllTime: stats?.completionRateAllTime,
    isCompletedToday: stats?.isCompletedToday,
    entries,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function assertGoalOwnership(
  tx: any,
  userId: string,
  goalId: string
): Promise<void> {
  const [foundGoal] = await tx
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.id, goalId)))
    .limit(1);

  if (!foundGoal) {
    throw new NotFoundError("Goal not found");
  }
}

/**
 * Creates a new habit owned by the authenticated user.
 */
export async function createHabit(
  userId: string,
  input: unknown,
  actorInfo?: ActorInfo
): Promise<HabitDTO> {
  const safeUserId = validateUserId(userId);
  const validated = createHabitSchema.parse(input);

  return await db.transaction(async (tx) => {
    if (validated.goalId) {
      await assertGoalOwnership(tx, safeUserId, validated.goalId);
    }

    const [inserted] = await tx
      .insert(habits)
      .values({
        userId: safeUserId,
        title: validated.title,
        description: validated.description ?? null,
        frequency: validated.frequency,
        frequencyTarget: validated.frequencyTarget,
        frequencyDays: validated.frequencyDays,
        intervalDays: validated.intervalDays,
        targetValue: validated.targetValue,
        unit: validated.unit ?? null,
        timeOfDay: validated.timeOfDay,
        reminderTime: validated.reminderTime ?? null,
        goalId: validated.goalId ?? null,
        identityStatement: validated.identityStatement ?? null,
        status: validated.status,
        currentStreak: 0,
        longestStreak: 0,
      })
      .returning();

    await createAuditLog(
      {
        userId: safeUserId,
        category: "mutation",
        action: "habit.create",
        status: "success",
        details: {
          habitId: inserted.id,
          title: inserted.title,
          frequency: inserted.frequency,
          timeOfDay: inserted.timeOfDay,
          goalId: inserted.goalId,
        },
        ipAddress: actorInfo?.ipAddress,
        userAgent: actorInfo?.userAgent,
      },
      tx
    );

    return toHabitDTO(inserted, {
      currentStreak: 0,
      longestStreak: 0,
      completionRate30d: 0,
      completionRateAllTime: 0,
      isCompletedToday: false,
      totalCompletions: 0,
    });
  });
}

/**
 * Retrieves a single habit by ID with calculated pure streak metrics and entry history.
 */
export async function getHabit(
  userId: string,
  habitId: string,
  referenceDate?: string | Date
): Promise<HabitDTO | null> {
  const safeUserId = validateUserId(userId);
  const safeHabitId = validateEntityId(habitId, "Habit");

  const [habitRow] = await db
    .select()
    .from(habits)
    .where(and(eq(habits.userId, safeUserId), eq(habits.id, safeHabitId)))
    .limit(1);

  if (!habitRow) {
    return null;
  }

  const entries = await db
    .select()
    .from(habitEntries)
    .where(
      and(
        eq(habitEntries.userId, safeUserId),
        eq(habitEntries.habitId, safeHabitId)
      )
    )
    .orderBy(desc(habitEntries.date));

  const stats = calculateStreakStats(
    {
      frequency: habitRow.frequency as any,
      frequencyTarget: habitRow.frequencyTarget,
      frequencyDays: habitRow.frequencyDays as any,
      intervalDays: habitRow.intervalDays,
      targetValue: habitRow.targetValue,
      createdAt: habitRow.createdAt,
    },
    entries,
    referenceDate ?? new Date()
  );

  return toHabitDTO(habitRow, stats, entries.map(toHabitEntryDTO));
}

/**
 * Lists habits owned by the authenticated user with calculated streak stats.
 * Uses batch fetching for entries to prevent N+1 query overhead.
 */
export async function listHabits(
  userId: string,
  filters?: ListHabitsFilters,
  referenceDate?: string | Date
): Promise<HabitDTO[]> {
  const safeUserId = validateUserId(userId);

  const conditions = [eq(habits.userId, safeUserId)];

  if (filters?.status) {
    conditions.push(eq(habits.status, filters.status as any));
  }
  if (filters?.timeOfDay) {
    conditions.push(eq(habits.timeOfDay, filters.timeOfDay as any));
  }
  if (filters?.goalId) {
    conditions.push(eq(habits.goalId, filters.goalId));
  }

  const habitRows = await db
    .select()
    .from(habits)
    .where(and(...conditions))
    .orderBy(desc(habits.createdAt));

  if (habitRows.length === 0) {
    return [];
  }

  const habitIds = habitRows.map((h) => h.id);
  const allEntries = await db
    .select()
    .from(habitEntries)
    .where(
      and(
        eq(habitEntries.userId, safeUserId),
        inArray(habitEntries.habitId, habitIds)
      )
    );

  const entriesByHabit = new Map<string, HabitEntry[]>();
  for (const entry of allEntries) {
    const list = entriesByHabit.get(entry.habitId) || [];
    list.push(entry);
    entriesByHabit.set(entry.habitId, list);
  }

  const ref = referenceDate ?? new Date();

  return habitRows.map((h) => {
    const entries = entriesByHabit.get(h.id) || [];
    const stats = calculateStreakStats(
      {
        frequency: h.frequency as any,
        frequencyTarget: h.frequencyTarget,
        frequencyDays: h.frequencyDays as any,
        intervalDays: h.intervalDays,
        targetValue: h.targetValue,
        createdAt: h.createdAt,
      },
      entries,
      ref
    );
    return toHabitDTO(h, stats);
  });
}

/**
 * Updates a habit's configuration with ownership check and schedule recalculation.
 */
export async function updateHabit(
  userId: string,
  habitId: string,
  input: unknown,
  actorInfo?: ActorInfo,
  referenceDate?: string | Date
): Promise<HabitDTO> {
  const safeUserId = validateUserId(userId);
  const safeHabitId = validateEntityId(habitId, "Habit");
  const validated = updateHabitSchema.parse(input);

  return await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(habits)
      .where(and(eq(habits.userId, safeUserId), eq(habits.id, safeHabitId)))
      .limit(1)
      .for("update");

    if (!existing) {
      throw new NotFoundError("Habit not found");
    }

    if (validated.goalId !== undefined && validated.goalId !== null) {
      await assertGoalOwnership(tx, safeUserId, validated.goalId);
    }

    const updates: Partial<typeof habits.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (validated.title !== undefined) updates.title = validated.title;
    if (validated.description !== undefined)
      updates.description = validated.description ?? null;
    if (validated.frequency !== undefined)
      updates.frequency = validated.frequency;
    if (validated.frequencyTarget !== undefined)
      updates.frequencyTarget = validated.frequencyTarget;
    if (validated.frequencyDays !== undefined)
      updates.frequencyDays = validated.frequencyDays;
    if (validated.intervalDays !== undefined)
      updates.intervalDays = validated.intervalDays;
    if (validated.targetValue !== undefined)
      updates.targetValue = validated.targetValue;
    if (validated.unit !== undefined) updates.unit = validated.unit ?? null;
    if (validated.timeOfDay !== undefined)
      updates.timeOfDay = validated.timeOfDay;
    if (validated.reminderTime !== undefined)
      updates.reminderTime = validated.reminderTime ?? null;
    if (validated.goalId !== undefined)
      updates.goalId = validated.goalId ?? null;
    if (validated.identityStatement !== undefined)
      updates.identityStatement = validated.identityStatement ?? null;
    if (validated.status !== undefined) updates.status = validated.status;

    const scheduleChanged =
      (validated.frequency !== undefined &&
        validated.frequency !== existing.frequency) ||
      (validated.frequencyTarget !== undefined &&
        validated.frequencyTarget !== existing.frequencyTarget) ||
      (validated.frequencyDays !== undefined &&
        JSON.stringify(validated.frequencyDays) !==
          JSON.stringify(existing.frequencyDays)) ||
      (validated.intervalDays !== undefined &&
        validated.intervalDays !== existing.intervalDays) ||
      (validated.targetValue !== undefined &&
        validated.targetValue !== existing.targetValue);

    const [updatedRow] = await tx
      .update(habits)
      .set(updates)
      .where(and(eq(habits.userId, safeUserId), eq(habits.id, safeHabitId)))
      .returning();

    const entries = await tx
      .select()
      .from(habitEntries)
      .where(
        and(
          eq(habitEntries.userId, safeUserId),
          eq(habitEntries.habitId, safeHabitId)
        )
      )
      .orderBy(desc(habitEntries.date));

    const stats = calculateStreakStats(
      {
        frequency: updatedRow.frequency as any,
        frequencyTarget: updatedRow.frequencyTarget,
        frequencyDays: updatedRow.frequencyDays as any,
        intervalDays: updatedRow.intervalDays,
        targetValue: updatedRow.targetValue,
        createdAt: updatedRow.createdAt,
      },
      entries,
      referenceDate ?? new Date()
    );

    if (
      scheduleChanged ||
      updatedRow.currentStreak !== stats.currentStreak ||
      updatedRow.longestStreak !== stats.longestStreak
    ) {
      await tx
        .update(habits)
        .set({
          currentStreak: stats.currentStreak,
          longestStreak: stats.longestStreak,
        })
        .where(and(eq(habits.userId, safeUserId), eq(habits.id, safeHabitId)));
      updatedRow.currentStreak = stats.currentStreak;
      updatedRow.longestStreak = stats.longestStreak;
    }

    await createAuditLog(
      {
        userId: safeUserId,
        category: "mutation",
        action: "habit.update",
        status: "success",
        details: {
          habitId: updatedRow.id,
          title: updatedRow.title,
          status: updatedRow.status,
          scheduleChanged,
        },
        ipAddress: actorInfo?.ipAddress,
        userAgent: actorInfo?.userAgent,
      },
      tx
    );

    return toHabitDTO(updatedRow, stats);
  });
}

/**
 * Deletes a habit and its entries with cascade semantics.
 */
export async function deleteHabit(
  userId: string,
  habitId: string,
  actorInfo?: ActorInfo
): Promise<{ success: boolean; id: string }> {
  const safeUserId = validateUserId(userId);
  const safeHabitId = validateEntityId(habitId, "Habit");

  return await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(habits)
      .where(and(eq(habits.userId, safeUserId), eq(habits.id, safeHabitId)))
      .limit(1)
      .for("update");

    if (!existing) {
      throw new NotFoundError("Habit not found");
    }

    await tx
      .delete(habits)
      .where(and(eq(habits.userId, safeUserId), eq(habits.id, safeHabitId)));

    await createAuditLog(
      {
        userId: safeUserId,
        category: "mutation",
        action: "habit.delete",
        status: "success",
        details: {
          habitId: safeHabitId,
          title: existing.title,
        },
        ipAddress: actorInfo?.ipAddress,
        userAgent: actorInfo?.userAgent,
      },
      tx
    );

    return { success: true, id: safeHabitId };
  });
}

/**
 * Idempotently logs or updates a habit completion entry for a calendar date.
 * Updates cached current_streak and longest_streak transactionally using pure calculation engine.
 */
export async function logHabitEntry(
  userId: string,
  habitId: string,
  input: unknown,
  actorInfo?: ActorInfo,
  referenceDate?: string | Date
): Promise<{ entry: HabitEntryDTO; stats: StreakStats }> {
  const safeUserId = validateUserId(userId);
  const safeHabitId = validateEntityId(habitId, "Habit");
  const validated = logHabitEntrySchema.parse(input);

  return await db.transaction(async (tx) => {
    const [habitRow] = await tx
      .select()
      .from(habits)
      .where(and(eq(habits.userId, safeUserId), eq(habits.id, safeHabitId)))
      .limit(1)
      .for("update");

    if (!habitRow) {
      throw new NotFoundError("Habit not found");
    }

    if (habitRow.status === "archived") {
      throw new InvariantViolationError(
        "Cannot log entries for an archived habit"
      );
    }

    const targetVal =
      validated.targetValue !== undefined && validated.targetValue > 0
        ? validated.targetValue
        : habitRow.targetValue;

    const val = validated.value !== undefined ? validated.value : targetVal;

    // Idempotent upsert on (user_id, habit_id, date)
    const [existingEntry] = await tx
      .select()
      .from(habitEntries)
      .where(
        and(
          eq(habitEntries.userId, safeUserId),
          eq(habitEntries.habitId, safeHabitId),
          eq(habitEntries.date, validated.date)
        )
      )
      .limit(1)
      .for("update");

    let entryRow: HabitEntry;
    if (existingEntry) {
      const [updated] = await tx
        .update(habitEntries)
        .set({
          value: val,
          targetValue: targetVal,
          notes:
            validated.notes !== undefined
              ? validated.notes
              : existingEntry.notes,
          completedAt: new Date(),
        })
        .where(eq(habitEntries.id, existingEntry.id))
        .returning();
      entryRow = updated;
    } else {
      const [inserted] = await tx
        .insert(habitEntries)
        .values({
          userId: safeUserId,
          habitId: safeHabitId,
          date: validated.date,
          value: val,
          targetValue: targetVal,
          notes: validated.notes ?? null,
          completedAt: new Date(),
        })
        .returning();
      entryRow = inserted;
    }

    const allEntries = await tx
      .select()
      .from(habitEntries)
      .where(
        and(
          eq(habitEntries.userId, safeUserId),
          eq(habitEntries.habitId, safeHabitId)
        )
      );

    const stats = calculateStreakStats(
      {
        frequency: habitRow.frequency as any,
        frequencyTarget: habitRow.frequencyTarget,
        frequencyDays: habitRow.frequencyDays as any,
        intervalDays: habitRow.intervalDays,
        targetValue: habitRow.targetValue,
        createdAt: habitRow.createdAt,
      },
      allEntries,
      referenceDate ?? validated.date
    );

    await tx
      .update(habits)
      .set({
        currentStreak: stats.currentStreak,
        longestStreak: stats.longestStreak,
        updatedAt: new Date(),
      })
      .where(and(eq(habits.userId, safeUserId), eq(habits.id, safeHabitId)));

    await createAuditLog(
      {
        userId: safeUserId,
        category: "mutation",
        action: "habit_entry.log",
        status: "success",
        details: {
          habitId: safeHabitId,
          entryId: entryRow.id,
          date: entryRow.date,
          value: entryRow.value,
          targetValue: entryRow.targetValue,
          currentStreak: stats.currentStreak,
          longestStreak: stats.longestStreak,
        },
        ipAddress: actorInfo?.ipAddress,
        userAgent: actorInfo?.userAgent,
      },
      tx
    );

    return { entry: toHabitEntryDTO(entryRow), stats };
  });
}

/**
 * Single-click toggle: removes entry if present, creates entry if absent.
 * Recalculates and updates streak cache transactionally.
 */
export async function toggleHabitEntry(
  userId: string,
  habitId: string,
  date?: string,
  actorInfo?: ActorInfo,
  referenceDate?: string | Date
): Promise<{
  toggled: boolean;
  completed: boolean;
  entry: HabitEntryDTO | null;
  stats: StreakStats;
}> {
  const safeUserId = validateUserId(userId);
  const safeHabitId = validateEntityId(habitId, "Habit");
  const targetDate = date
    ? normalizeDate(date)
    : normalizeDate(referenceDate ?? new Date());

  return await db.transaction(async (tx) => {
    const [habitRow] = await tx
      .select()
      .from(habits)
      .where(and(eq(habits.userId, safeUserId), eq(habits.id, safeHabitId)))
      .limit(1)
      .for("update");

    if (!habitRow) {
      throw new NotFoundError("Habit not found");
    }

    if (habitRow.status === "archived") {
      throw new InvariantViolationError(
        "Cannot log entries for an archived habit"
      );
    }

    const [existingEntry] = await tx
      .select()
      .from(habitEntries)
      .where(
        and(
          eq(habitEntries.userId, safeUserId),
          eq(habitEntries.habitId, safeHabitId),
          eq(habitEntries.date, targetDate)
        )
      )
      .limit(1)
      .for("update");

    let completed: boolean;
    let entryRow: HabitEntry | null = null;

    if (existingEntry) {
      await tx
        .delete(habitEntries)
        .where(eq(habitEntries.id, existingEntry.id));
      completed = false;
    } else {
      const [inserted] = await tx
        .insert(habitEntries)
        .values({
          userId: safeUserId,
          habitId: safeHabitId,
          date: targetDate,
          value: habitRow.targetValue,
          targetValue: habitRow.targetValue,
          completedAt: new Date(),
        })
        .returning();
      entryRow = inserted;
      completed = true;
    }

    const allEntries = await tx
      .select()
      .from(habitEntries)
      .where(
        and(
          eq(habitEntries.userId, safeUserId),
          eq(habitEntries.habitId, safeHabitId)
        )
      );

    const stats = calculateStreakStats(
      {
        frequency: habitRow.frequency as any,
        frequencyTarget: habitRow.frequencyTarget,
        frequencyDays: habitRow.frequencyDays as any,
        intervalDays: habitRow.intervalDays,
        targetValue: habitRow.targetValue,
        createdAt: habitRow.createdAt,
      },
      allEntries,
      referenceDate ?? targetDate
    );

    await tx
      .update(habits)
      .set({
        currentStreak: stats.currentStreak,
        longestStreak: stats.longestStreak,
        updatedAt: new Date(),
      })
      .where(and(eq(habits.userId, safeUserId), eq(habits.id, safeHabitId)));

    await createAuditLog(
      {
        userId: safeUserId,
        category: "mutation",
        action: "habit_entry.toggle",
        status: "success",
        details: {
          habitId: safeHabitId,
          date: targetDate,
          completed,
          currentStreak: stats.currentStreak,
          longestStreak: stats.longestStreak,
        },
        ipAddress: actorInfo?.ipAddress,
        userAgent: actorInfo?.userAgent,
      },
      tx
    );

    return {
      toggled: true,
      completed,
      entry: entryRow ? toHabitEntryDTO(entryRow) : null,
      stats,
    };
  });
}

/**
 * Deletes a habit check-in entry for a given date.
 * Recalculates streak stats transactionally.
 */
export async function deleteHabitEntry(
  userId: string,
  habitId: string,
  date: string,
  actorInfo?: ActorInfo,
  referenceDate?: string | Date
): Promise<{ success: boolean; stats: StreakStats }> {
  const safeUserId = validateUserId(userId);
  const safeHabitId = validateEntityId(habitId, "Habit");
  const targetDate = normalizeDate(date);

  return await db.transaction(async (tx) => {
    const [habitRow] = await tx
      .select()
      .from(habits)
      .where(and(eq(habits.userId, safeUserId), eq(habits.id, safeHabitId)))
      .limit(1)
      .for("update");

    if (!habitRow) {
      throw new NotFoundError("Habit not found");
    }

    const [existing] = await tx
      .select()
      .from(habitEntries)
      .where(
        and(
          eq(habitEntries.userId, safeUserId),
          eq(habitEntries.habitId, safeHabitId),
          eq(habitEntries.date, targetDate)
        )
      )
      .limit(1)
      .for("update");

    if (!existing) {
      throw new NotFoundError("Habit entry not found for date");
    }

    await tx
      .delete(habitEntries)
      .where(eq(habitEntries.id, existing.id));

    const allEntries = await tx
      .select()
      .from(habitEntries)
      .where(
        and(
          eq(habitEntries.userId, safeUserId),
          eq(habitEntries.habitId, safeHabitId)
        )
      );

    const stats = calculateStreakStats(
      {
        frequency: habitRow.frequency as any,
        frequencyTarget: habitRow.frequencyTarget,
        frequencyDays: habitRow.frequencyDays as any,
        intervalDays: habitRow.intervalDays,
        targetValue: habitRow.targetValue,
        createdAt: habitRow.createdAt,
      },
      allEntries,
      referenceDate ?? targetDate
    );

    await tx
      .update(habits)
      .set({
        currentStreak: stats.currentStreak,
        longestStreak: stats.longestStreak,
        updatedAt: new Date(),
      })
      .where(and(eq(habits.userId, safeUserId), eq(habits.id, safeHabitId)));

    await createAuditLog(
      {
        userId: safeUserId,
        category: "mutation",
        action: "habit_entry.delete",
        status: "success",
        details: {
          habitId: safeHabitId,
          date: targetDate,
        },
        ipAddress: actorInfo?.ipAddress,
        userAgent: actorInfo?.userAgent,
      },
      tx
    );

    return { success: true, stats };
  });
}

/**
 * Retrieves entry history and completion matrix for calendar/heatmap visualization.
 */
export async function getHabitHistory(
  userId: string,
  habitId: string,
  startDate: string,
  endDate: string
): Promise<{
  entries: HabitEntryDTO[];
  calendar: StreakDayInfo[];
}> {
  const safeUserId = validateUserId(userId);
  const safeHabitId = validateEntityId(habitId, "Habit");
  const startStr = normalizeDate(startDate);
  const endStr = normalizeDate(endDate);

  if (startStr > endStr) {
    throw new InvariantViolationError(
      "startDate must be before or equal to endDate"
    );
  }

  const [habitRow] = await db
    .select()
    .from(habits)
    .where(and(eq(habits.userId, safeUserId), eq(habits.id, safeHabitId)))
    .limit(1);

  if (!habitRow) {
    throw new NotFoundError("Habit not found");
  }

  const entries = await db
    .select()
    .from(habitEntries)
    .where(
      and(
        eq(habitEntries.userId, safeUserId),
        eq(habitEntries.habitId, safeHabitId),
        gte(habitEntries.date, startStr),
        lte(habitEntries.date, endStr)
      )
    )
    .orderBy(desc(habitEntries.date));

  const daysCount = daysDifference(startStr, endStr) + 1;
  const calendar = getStreakCalendar(
    {
      frequency: habitRow.frequency as any,
      frequencyTarget: habitRow.frequencyTarget,
      frequencyDays: habitRow.frequencyDays as any,
      intervalDays: habitRow.intervalDays,
      targetValue: habitRow.targetValue,
      createdAt: habitRow.createdAt,
    },
    entries,
    daysCount,
    endStr
  );

  return {
    entries: entries.map(toHabitEntryDTO),
    calendar,
  };
}
