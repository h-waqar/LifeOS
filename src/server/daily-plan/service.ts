import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import {
  dailyPlans,
  eveningReviews,
  tasks,
  habits,
  habitEntries,
  timeBlocks,
  type DailyPlan,
  type EveningReview,
  type Task,
} from "@/server/db/schema";
import { AuthorizationError } from "@/server/auth/guard";
import { createAuditLog } from "@/server/audit";
import {
  saveMorningPlanSchema,
  completeEveningReviewSchema,
  executeRolloverSchema,
  dailyPlanHistoryQuerySchema,
  type SaveMorningPlanInput,
  type CompleteEveningReviewInput,
  type ExecuteRolloverInput,
  type DailyPlanHistoryQueryInput,
} from "./validation";
import { calculateProductivityScore } from "./productivity-score";
import { toTaskDTO, listTasks } from "@/server/tasks/service";
import { listHabits } from "@/server/habits/service";
import { listTimeBlocks } from "@/server/calendar/service";
import { normalizeDate, formatUtc } from "@/server/habits/streaks";
import type {
  DailyPlanDTO,
  EveningReviewDTO,
  DailyPlanContextDTO,
  DailyPlanHistoryDTO,
  DailyPlanDaySummary,
  TaskDTO,
} from "@/types";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Daily plan service cannot be initialized in the browser."
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
  actor?: string;
  ipAddress?: string;
  userAgent?: string;
}

function validateUserId(userId: unknown): string {
  if (typeof userId !== "string" || !userId.trim()) {
    throw new AuthorizationError("Authentication required: missing user identifier.");
  }
  return userId.trim();
}

export function toDailyPlanDTO(row: DailyPlan): DailyPlanDTO {
  return {
    id: row.id,
    userId: row.userId,
    date: row.date,
    status: row.status as DailyPlanDTO["status"],
    priorityTaskIds: Array.isArray(row.priorityTaskIds) ? row.priorityTaskIds : [],
    habitIntentionIds: Array.isArray(row.habitIntentionIds) ? row.habitIntentionIds : [],
    morningNotes: row.morningNotes,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toEveningReviewDTO(row: EveningReview): EveningReviewDTO {
  return {
    id: row.id,
    userId: row.userId,
    dailyPlanId: row.dailyPlanId,
    date: row.date,
    productivityScore: row.productivityScore,
    positiveReflections: row.positiveReflections,
    challengesReflections: row.challengesReflections,
    notes: row.notes,
    completedTaskIds: Array.isArray(row.completedTaskIds) ? row.completedTaskIds : [],
    incompleteTaskIds: Array.isArray(row.incompleteTaskIds) ? row.incompleteTaskIds : [],
    rolledOverTaskIds: Array.isArray(row.rolledOverTaskIds) ? row.rolledOverTaskIds : [],
    completedHabitIds: Array.isArray(row.completedHabitIds) ? row.completedHabitIds : [],
    completedAt: row.completedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Retrieves the full daily planning context for a specific calendar day.
 */
export async function getDailyPlan(
  userId: string,
  dateInput: string
): Promise<DailyPlanContextDTO> {
  const safeUserId = validateUserId(userId);
  const date = normalizeDate(dateInput);

  // 1. Fetch Daily Plan and Evening Review in parallel
  const [dailyPlanRows, eveningReviewRows] = await Promise.all([
    db
      .select()
      .from(dailyPlans)
      .where(and(eq(dailyPlans.userId, safeUserId), eq(dailyPlans.date, date))),
    db
      .select()
      .from(eveningReviews)
      .where(and(eq(eveningReviews.userId, safeUserId), eq(eveningReviews.date, date))),
  ]);

  const planRow = dailyPlanRows[0] || null;
  const reviewRow = eveningReviewRows[0] || null;

  // 2. Fetch Priority Tasks
  let priorityTaskIds = planRow?.priorityTaskIds || [];
  let priorityTasks: TaskDTO[] = [];

  if (priorityTaskIds.length > 0) {
    const taskRows = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, safeUserId),
          inArray(tasks.id, priorityTaskIds)
        )
      );
    priorityTasks = taskRows.map((t) => toTaskDTO(t));
  }

  // Also include any tasks explicitly scheduled for this date that may not be in priorityTaskIds
  const scheduledTasks = await listTasks(safeUserId, { scheduledDate: date });
  for (const st of scheduledTasks) {
    if (!priorityTasks.some((pt) => pt.id === st.id)) {
      priorityTasks.push(st);
    }
  }

  // 3. Fetch Overdue Tasks (dueDate < date OR scheduledDate < date, and incomplete)
  const overdueTasks = await listTasks(safeUserId, { overdue: true });

  // 4. Fetch Habits for Today
  const allHabits = await listHabits(safeUserId, { status: "active" });
  // Determine completion for this specific date
  const habitIds = allHabits.map((h) => h.id);
  const entriesForDate =
    habitIds.length > 0
      ? await db
          .select()
          .from(habitEntries)
          .where(
            and(
              eq(habitEntries.userId, safeUserId),
              eq(habitEntries.date, date),
              inArray(habitEntries.habitId, habitIds)
            )
          )
      : [];

  const completedHabitIdSet = new Set(entriesForDate.map((e) => e.habitId));
  const todayHabits = allHabits.map((h) => ({
    ...h,
    isCompletedToday: completedHabitIdSet.has(h.id),
  }));

  // 5. Fetch Time Blocks for Today
  const todayTimeBlocks = await listTimeBlocks(safeUserId, {
    startDate: date,
    endDate: date,
  });

  // 6. Fetch Suggested Backlog Tasks (not scheduled, todo/inbox, highest priority score)
  const allUserTasks = await listTasks(safeUserId, { sortBy: "priority_score", sortDir: "desc" });
  const suggestedTasks = allUserTasks
    .filter(
      (t) =>
        t.status !== "completed" &&
        t.status !== "cancelled" &&
        !t.scheduledDate &&
        !priorityTasks.some((pt) => pt.id === t.id)
    )
    .slice(0, 10);

  return {
    date,
    plan: planRow ? toDailyPlanDTO(planRow) : null,
    review: reviewRow ? toEveningReviewDTO(reviewRow) : null,
    priorityTasks,
    overdueTasks,
    todayHabits,
    todayTimeBlocks,
    suggestedTasks,
  };
}

/**
 * Creates or updates the Morning Daily Plan for a calendar day. (PLAN-01)
 */
export async function saveMorningPlan(
  userId: string,
  rawInput: SaveMorningPlanInput,
  actor?: ActorInfo
): Promise<DailyPlanDTO> {
  const safeUserId = validateUserId(userId);
  const validated = saveMorningPlanSchema.parse(rawInput);
  const date = normalizeDate(validated.date);

  // Validate task ownership for all selected priority tasks
  if (validated.priorityTaskIds.length > 0) {
    const userTasks = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, safeUserId),
          inArray(tasks.id, validated.priorityTaskIds)
        )
      );

    if (userTasks.length !== validated.priorityTaskIds.length) {
      throw new InvariantViolationError(
        "One or more selected priority tasks do not exist or belong to another user."
      );
    }
  }

  // Update scheduledDate to today for any selected priority tasks that have no schedule
  if (validated.priorityTaskIds.length > 0) {
    const scheduledDateTime = new Date(`${date}T00:00:00.000Z`);
    await db
      .update(tasks)
      .set({
        scheduledDate: scheduledDateTime,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tasks.userId, safeUserId),
          inArray(tasks.id, validated.priorityTaskIds),
          sql`${tasks.scheduledDate} IS NULL`
        )
      );
  }

  const status = validated.complete ? "completed" : "in_progress";
  const completedAt = validated.complete ? new Date() : null;

  // Upsert daily_plans row
  const [saved] = await db
    .insert(dailyPlans)
    .values({
      userId: safeUserId,
      date,
      status,
      priorityTaskIds: validated.priorityTaskIds,
      habitIntentionIds: validated.habitIntentionIds,
      morningNotes: validated.morningNotes ?? null,
      completedAt,
    })
    .onConflictDoUpdate({
      target: [dailyPlans.userId, dailyPlans.date],
      set: {
        status,
        priorityTaskIds: validated.priorityTaskIds,
        habitIntentionIds: validated.habitIntentionIds,
        morningNotes: validated.morningNotes ?? null,
        completedAt: validated.complete ? new Date() : sql`${dailyPlans.completedAt}`,
        updatedAt: new Date(),
      },
    })
    .returning();

  await createAuditLog({
    userId: safeUserId,
    category: "mutation",
    action: validated.complete ? "daily_plan.completed" : "daily_plan.saved",
    status: "success",
    actor: actor?.actor || safeUserId,
    details: {
      planId: saved.id,
      date,
      priorityTasksCount: validated.priorityTaskIds.length,
      habitIntentionsCount: validated.habitIntentionIds.length,
      status: saved.status,
    },
    ipAddress: actor?.ipAddress,
    userAgent: actor?.userAgent,
  });

  return toDailyPlanDTO(saved);
}

/**
 * Completes the Evening Review for a calendar day, calculating the productivity score. (PLAN-02)
 */
export async function completeEveningReview(
  userId: string,
  rawInput: CompleteEveningReviewInput,
  actor?: ActorInfo
): Promise<EveningReviewDTO> {
  const safeUserId = validateUserId(userId);
  const validated = completeEveningReviewSchema.parse(rawInput);
  const date = normalizeDate(validated.date);

  // Fetch morning plan if exists
  const [existingPlan] = await db
    .select()
    .from(dailyPlans)
    .where(and(eq(dailyPlans.userId, safeUserId), eq(dailyPlans.date, date)));

  // Determine tasks for today
  const priorityIds = existingPlan?.priorityTaskIds || [];
  let todayTasks = await listTasks(safeUserId, { scheduledDate: date });
  if (priorityIds.length > 0) {
    const priorityTaskRows = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, safeUserId), inArray(tasks.id, priorityIds)));
    for (const pt of priorityTaskRows) {
      if (!todayTasks.some((t) => t.id === pt.id)) {
        todayTasks.push(toTaskDTO(pt));
      }
    }
  }

  const completedTaskIds =
    validated.completedTaskIds ??
    todayTasks.filter((t) => t.status === "completed").map((t) => t.id);
  const incompleteTaskIds =
    validated.incompleteTaskIds ??
    todayTasks.filter((t) => t.status !== "completed").map((t) => t.id);

  // Determine habits for today
  const activeHabits = await listHabits(safeUserId, { status: "active" });
  const habitIds = activeHabits.map((h) => h.id);
  const entriesForDate =
    habitIds.length > 0
      ? await db
          .select({ habitId: habitEntries.habitId })
          .from(habitEntries)
          .where(
            and(
              eq(habitEntries.userId, safeUserId),
              eq(habitEntries.date, date),
              inArray(habitEntries.habitId, habitIds)
            )
          )
      : [];
  const completedHabitIds =
    validated.completedHabitIds ?? entriesForDate.map((e) => e.habitId);

  // Determine time blocks for today
  const timeBlocksForDate = await listTimeBlocks(safeUserId, {
    startDate: date,
    endDate: date,
  });
  const completedTimeBlocks = timeBlocksForDate.filter(
    (b) => b.status === "completed"
  );

  // Calculate deterministic productivity score
  const scoreResult = calculateProductivityScore({
    plannedTasksCount: todayTasks.length,
    completedTasksCount: completedTaskIds.length,
    plannedHabitsCount: activeHabits.length,
    completedHabitsCount: completedHabitIds.length,
    plannedTimeBlocksCount: timeBlocksForDate.length,
    completedTimeBlocksCount: completedTimeBlocks.length,
    selfRating: validated.selfRating,
  });

  // Upsert evening review
  const [saved] = await db
    .insert(eveningReviews)
    .values({
      userId: safeUserId,
      dailyPlanId: existingPlan?.id ?? null,
      date,
      productivityScore: scoreResult.score,
      positiveReflections: validated.positiveReflections ?? null,
      challengesReflections: validated.challengesReflections ?? null,
      notes: validated.notes ?? null,
      completedTaskIds,
      incompleteTaskIds,
      completedHabitIds,
      completedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [eveningReviews.userId, eveningReviews.date],
      set: {
        dailyPlanId: existingPlan?.id ?? null,
        productivityScore: scoreResult.score,
        positiveReflections: validated.positiveReflections ?? null,
        challengesReflections: validated.challengesReflections ?? null,
        notes: validated.notes ?? null,
        completedTaskIds,
        incompleteTaskIds,
        completedHabitIds,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();

  await createAuditLog({
    userId: safeUserId,
    category: "mutation",
    action: "evening_review.completed",
    status: "success",
    actor: actor?.actor || safeUserId,
    details: {
      reviewId: saved.id,
      date,
      productivityScore: scoreResult.score,
      completedTasksCount: completedTaskIds.length,
      incompleteTasksCount: incompleteTaskIds.length,
      completedHabitsCount: completedHabitIds.length,
    },
    ipAddress: actor?.ipAddress,
    userAgent: actor?.userAgent,
  });

  return toEveningReviewDTO(saved);
}

/**
 * Executes Zero-Duplication Rollover for incomplete daily tasks. (PLAN-03)
 *
 * Invariants:
 * - Mutates existing canonical task rows directly (`scheduledDate`).
 * - Zero new task rows inserted (asserted in tests: total task count before === after).
 * - Zero duplicate time blocks created.
 * - Entire operation is transactional and idempotent.
 * - Multi-tenant isolation verified per task row.
 */
export async function executeRollover(
  userId: string,
  rawInput: ExecuteRolloverInput,
  actor?: ActorInfo
): Promise<{
  success: boolean;
  rolledOverCount: number;
  tasks: TaskDTO[];
  summary: { carriedOver: number; rescheduled: number; backlogged: number };
}> {
  const safeUserId = validateUserId(userId);
  const validated = executeRolloverSchema.parse(rawInput);
  const currentDateStr = normalizeDate(validated.date);

  const taskIds = validated.actions.map((a) => a.taskId);

  // Compute tomorrow's date string
  const currD = new Date(`${currentDateStr}T00:00:00.000Z`);
  const tomorrowD = new Date(currD);
  tomorrowD.setUTCDate(tomorrowD.getUTCDate() + 1);
  const tomorrowStr = formatUtc(tomorrowD);

  let carriedOver = 0;
  let rescheduled = 0;
  let backlogged = 0;

  const updatedTasks: Task[] = [];

  await db.transaction(async (tx) => {
    // 1. Verify task ownership for all targeted tasks
    const existingUserTasks = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, safeUserId), inArray(tasks.id, taskIds)));

    if (existingUserTasks.length !== taskIds.length) {
      throw new InvariantViolationError(
        "One or more tasks targeted for rollover do not exist or belong to another user."
      );
    }

    const taskMap = new Map(existingUserTasks.map((t) => [t.id, t]));

    // 2. Perform zero-duplication mutations on canonical task rows
    for (const actionItem of validated.actions) {
      const task = taskMap.get(actionItem.taskId);
      if (!task) continue;

      if (actionItem.action === "carry_over") {
        const targetDateObj = new Date(`${tomorrowStr}T00:00:00.000Z`);
        const [updated] = await tx
          .update(tasks)
          .set({
            scheduledDate: targetDateObj,
            updatedAt: new Date(),
          })
          .where(and(eq(tasks.userId, safeUserId), eq(tasks.id, task.id)))
          .returning();
        updatedTasks.push(updated);
        carriedOver++;
      } else if (actionItem.action === "reschedule") {
        if (!actionItem.targetDate) {
          throw new InvariantViolationError(
            `Target date is required when rescheduling task "${task.title}".`
          );
        }
        const targetDateObj = new Date(
          `${normalizeDate(actionItem.targetDate)}T00:00:00.000Z`
        );
        const [updated] = await tx
          .update(tasks)
          .set({
            scheduledDate: targetDateObj,
            updatedAt: new Date(),
          })
          .where(and(eq(tasks.userId, safeUserId), eq(tasks.id, task.id)))
          .returning();
        updatedTasks.push(updated);
        rescheduled++;
      } else if (actionItem.action === "backlog") {
        const [updated] = await tx
          .update(tasks)
          .set({
            scheduledDate: null,
            updatedAt: new Date(),
          })
          .where(and(eq(tasks.userId, safeUserId), eq(tasks.id, task.id)))
          .returning();
        updatedTasks.push(updated);
        backlogged++;
      }
    }

    // 3. Update or initialize evening review record with rolledOverTaskIds
    const [existingReview] = await tx
      .select()
      .from(eveningReviews)
      .where(
        and(
          eq(eveningReviews.userId, safeUserId),
          eq(eveningReviews.date, currentDateStr)
        )
      );

    const mergedRolledOverIds = Array.from(
      new Set([
        ...(existingReview?.rolledOverTaskIds || []),
        ...taskIds,
      ])
    );

    if (existingReview) {
      await tx
        .update(eveningReviews)
        .set({
          rolledOverTaskIds: mergedRolledOverIds,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(eveningReviews.userId, safeUserId),
            eq(eveningReviews.id, existingReview.id)
          )
        );
    } else {
      await tx.insert(eveningReviews).values({
        userId: safeUserId,
        date: currentDateStr,
        productivityScore: 0,
        rolledOverTaskIds: mergedRolledOverIds,
        completedAt: new Date(),
      });
    }
  });

  await createAuditLog({
    userId: safeUserId,
    category: "mutation",
    action: "daily_plan.rollover_executed",
    status: "success",
    actor: actor?.actor || safeUserId,
    details: {
      date: currentDateStr,
      carriedOver,
      rescheduled,
      backlogged,
      totalRolledOver: updatedTasks.length,
      taskIds,
    },
    ipAddress: actor?.ipAddress,
    userAgent: actor?.userAgent,
  });

  return {
    success: true,
    rolledOverCount: updatedTasks.length,
    tasks: updatedTasks.map((t) => toTaskDTO(t)),
    summary: {
      carriedOver,
      rescheduled,
      backlogged,
    },
  };
}

/**
 * Retrieves daily plan completion history for weekly and monthly trend analysis. (PLAN-04)
 */
export async function getDailyPlanHistory(
  userId: string,
  rawInput?: DailyPlanHistoryQueryInput
): Promise<DailyPlanHistoryDTO> {
  const safeUserId = validateUserId(userId);
  const validated = dailyPlanHistoryQuerySchema.parse(rawInput || {});

  const daysCount = validated.days || 30;
  const now = new Date();

  const endDateStr = validated.endDate || formatUtc(now);
  let startDateStr = validated.startDate;

  if (!startDateStr) {
    const startD = new Date(`${endDateStr}T00:00:00.000Z`);
    startD.setUTCDate(startD.getUTCDate() - (daysCount - 1));
    startDateStr = formatUtc(startD);
  }

  // Query plans and reviews within date range
  const [plans, reviews] = await Promise.all([
    db
      .select()
      .from(dailyPlans)
      .where(
        and(
          eq(dailyPlans.userId, safeUserId),
          gte(dailyPlans.date, startDateStr),
          lte(dailyPlans.date, endDateStr)
        )
      ),
    db
      .select()
      .from(eveningReviews)
      .where(
        and(
          eq(eveningReviews.userId, safeUserId),
          gte(eveningReviews.date, startDateStr),
          lte(eveningReviews.date, endDateStr)
        )
      ),
  ]);

  const planMap = new Map(plans.map((p) => [p.date, p]));
  const reviewMap = new Map(reviews.map((r) => [r.date, r]));

  // Generate sequence of dates from startDate to endDate
  const summaries: DailyPlanDaySummary[] = [];
  const cur = new Date(`${startDateStr}T00:00:00.000Z`);
  const end = new Date(`${endDateStr}T00:00:00.000Z`);

  let completedMorningCount = 0;
  let completedEveningCount = 0;
  let totalScoreSum = 0;
  let scoreDaysCount = 0;

  while (cur <= end) {
    const dStr = formatUtc(cur);
    const plan = planMap.get(dStr);
    const review = reviewMap.get(dStr);

    const hasMorningPlan = !!plan;
    const morningPlanCompleted = plan?.status === "completed";
    const hasEveningReview = !!review;

    if (morningPlanCompleted) completedMorningCount++;
    if (hasEveningReview) {
      completedEveningCount++;
      totalScoreSum += review.productivityScore;
      scoreDaysCount++;
    }

    summaries.push({
      date: dStr,
      hasMorningPlan,
      morningPlanCompleted,
      hasEveningReview,
      productivityScore: review ? review.productivityScore : null,
      priorityTasksCount: plan?.priorityTaskIds?.length || 0,
      completedPriorityTasksCount: review?.completedTaskIds?.length || 0,
      habitsCount: plan?.habitIntentionIds?.length || 0,
      completedHabitsCount: review?.completedHabitIds?.length || 0,
      reflections: review
        ? {
            positive: review.positiveReflections,
            challenges: review.challengesReflections,
            notes: review.notes,
          }
        : null,
    });

    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  // Reverse so newest date is first in history list
  summaries.reverse();

  const totalDays = summaries.length;
  const morningPlanCompletionRate =
    totalDays > 0 ? Math.round((completedMorningCount / totalDays) * 100) : 0;
  const eveningReviewCompletionRate =
    totalDays > 0 ? Math.round((completedEveningCount / totalDays) * 100) : 0;
  const averageProductivityScore =
    scoreDaysCount > 0 ? Math.round(totalScoreSum / scoreDaysCount) : 0;

  return {
    totalDays,
    morningPlanCompletionRate,
    eveningReviewCompletionRate,
    averageProductivityScore,
    days: summaries,
  };
}
