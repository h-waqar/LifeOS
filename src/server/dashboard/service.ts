import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { AuthorizationError } from "@/server/auth/guard";
import { getDailyPlan, getDailyPlanHistory } from "@/server/daily-plan/service";
import { listGoals } from "@/server/goals/service";
import { listProjects } from "@/server/projects/service";
import { listTasks } from "@/server/tasks/service";
import type {
  DashboardOverviewDTO,
  DashboardMetricsDTO,
  DashboardDailyPlanSummaryDTO,
  DashboardPrioritiesDTO,
  DashboardScheduleDTO,
  DashboardHabitsDTO,
  DashboardGoalsAndProjectsDTO,
  DashboardRecentTrendDTO,
  GoalDTO,
} from "@/types";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Dashboard service cannot be initialized in the browser."
  );
}

function validateUserId(userId: string): string {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new AuthorizationError(
      "Unauthorized: Missing or invalid user identity."
    );
  }
  return userId.trim();
}

function normalizeDate(dateStr: string): string {
  const match = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) {
    return new Date().toISOString().slice(0, 10);
  }
  return match[1];
}

const HORIZON_ORDER: Record<string, number> = {
  long_term: 1,
  medium_term: 2,
  short_term: 3,
};

const PRIORITY_ORDER: Record<string, number> = {
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
};

/**
 * Aggregates all Phase 2 domain modules into a unified executive dashboard view model.
 * Preserves canonical progress rollups, streak calculations, and zero-duplication rollover.
 */
export async function getDashboardOverview(
  authenticatedUserId: string,
  dateInput?: string
): Promise<DashboardOverviewDTO> {
  const safeUserId = validateUserId(authenticatedUserId);
  const date = normalizeDate(
    dateInput || new Date().toISOString().slice(0, 10)
  );

  // Formatted date string for greeting, e.g. "Wednesday, September 16, 2026"
  const dateObj = new Date(date + "T00:00:00Z");
  const todayFormatted = !isNaN(dateObj.getTime())
    ? dateObj.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : date;

  // 1. Fetch user name for personalized greeting
  const userPromise = db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, safeUserId))
    .limit(1);

  // 2. Fetch all canonical domain aggregates concurrently with composite tenant filtering
  const [
    userRows,
    dailyPlanContext,
    activeGoals,
    activeProjects,
    allTasks,
    dailyPlanHistory,
  ] = await Promise.all([
    userPromise,
    getDailyPlan(safeUserId, date),
    listGoals(safeUserId, { status: "in_progress" }),
    listProjects(safeUserId, { status: "active" }),
    listTasks(safeUserId, { sortBy: "priority_score", sortDir: "desc" }),
    getDailyPlanHistory(safeUserId, { days: 7 }).catch(() => null),
  ]);

  const userName = userRows[0]?.name || "LifeOS Owner";

  // 3. Compute Metrics
  const pendingTasks = allTasks.filter(
    (t) => t.status !== "completed" && t.status !== "cancelled"
  );
  const completedTasks = allTasks.filter((t) => t.status === "completed");
  const overdueTasks = dailyPlanContext.overdueTasks || [];
  const criticalTasks = pendingTasks.filter(
    (t) => t.priority === "critical" || t.priority === "high"
  );

  const todayHabits = dailyPlanContext.todayHabits || [];
  const completedHabitsCount = todayHabits.filter(
    (h) => !!h.isCompletedToday
  ).length;

  const todayBlocks = dailyPlanContext.todayTimeBlocks || [];
  const totalScheduledMinutes = todayBlocks.reduce(
    (acc, b) => acc + (b.durationMinutes || 0),
    0
  );
  const completedMinutes = todayBlocks
    .filter((b) => b.status === "completed")
    .reduce(
      (acc, b) => acc + (b.actualMinutes ?? b.durationMinutes ?? 0),
      0
    );

  const metrics: DashboardMetricsDTO = {
    activeGoalsCount: activeGoals.length,
    activeProjectsCount: activeProjects.length,
    pendingTasksCount: pendingTasks.length,
    completedTasksCount: completedTasks.length,
    overdueTasksCount: overdueTasks.length,
    criticalTasksCount: criticalTasks.length,
    todayHabitsTotal: todayHabits.length,
    todayHabitsCompleted: completedHabitsCount,
    todayTimeBlocksCount: todayBlocks.length,
    todayProductivityScore:
      dailyPlanContext.review?.productivityScore ?? null,
  };

  // 4. Daily Plan Summary
  const dailyPlan: DashboardDailyPlanSummaryDTO = {
    hasPlan: !!dailyPlanContext.plan,
    planStatus: dailyPlanContext.plan
      ? dailyPlanContext.plan.status
      : "none",
    completedAt: dailyPlanContext.plan?.completedAt ?? null,
    morningNotes: dailyPlanContext.plan?.morningNotes ?? null,
    hasReview: !!dailyPlanContext.review,
    reviewCompleted: !!dailyPlanContext.review,
    productivityScore:
      dailyPlanContext.review?.productivityScore ?? null,
    rolledOverCount:
      dailyPlanContext.review?.rolledOverTaskIds?.length ?? 0,
  };

  // 5. Priorities (Ranked by canonical priority score)
  const priorityTaskIds = new Set(
    (dailyPlanContext.priorityTasks || []).map((t) => t.id)
  );
  const extraCriticalTasks = criticalTasks
    .filter((t) => !priorityTaskIds.has(t.id))
    .slice(0, 5);

  const priorities: DashboardPrioritiesDTO = {
    todayTasks: dailyPlanContext.priorityTasks || [],
    overdueTasks: overdueTasks,
    criticalTasks: extraCriticalTasks,
  };

  // 6. Schedule
  const schedule: DashboardScheduleDTO = {
    todayBlocks,
    totalScheduledMinutes,
    completedMinutes,
  };

  // 7. Habits
  const habitCompletionRate =
    todayHabits.length > 0
      ? Math.round((completedHabitsCount / todayHabits.length) * 100)
      : 0;

  const habits: DashboardHabitsDTO = {
    items: todayHabits,
    completionRateToday: habitCompletionRate,
  };

  // 8. Goals and Projects Hierarchy
  // Sort goals by horizon: long_term -> medium_term -> short_term, then priority
  const sortedGoals = [...activeGoals].sort((a, b) => {
    const hDiff =
      (HORIZON_ORDER[a.horizon] ?? 99) - (HORIZON_ORDER[b.horizon] ?? 99);
    if (hDiff !== 0) return hDiff;
    const pDiff =
      (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
    if (pDiff !== 0) return pDiff;
    return b.progress - a.progress;
  });

  // Sort projects by priority, then progress
  const sortedProjects = [...activeProjects].sort((a, b) => {
    const pDiff =
      (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
    if (pDiff !== 0) return pDiff;
    return b.progress - a.progress;
  });

  const goalsAndProjects: DashboardGoalsAndProjectsDTO = {
    activeGoals: sortedGoals,
    activeProjects: sortedProjects,
  };

  // 9. Recent Trend (from daily plan history)
  let recentTrend: DashboardRecentTrendDTO | undefined;
  if (dailyPlanHistory) {
    recentTrend = {
      averageProductivityScore: dailyPlanHistory.averageProductivityScore,
      morningPlanCompletionRate: dailyPlanHistory.morningPlanCompletionRate,
      eveningReviewCompletionRate: dailyPlanHistory.eveningReviewCompletionRate,
    };
  }

  return {
    date,
    greeting: {
      userName,
      todayFormatted,
    },
    metrics,
    dailyPlan,
    priorities,
    schedule,
    habits,
    goalsAndProjects,
    recentTrend,
  };
}
