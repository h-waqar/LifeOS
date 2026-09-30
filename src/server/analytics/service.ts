import { eq, and, gte, lte, desc } from "drizzle-orm";
import { db } from "@/server/db";
import {
  tasks,
  projects,
  goals,
  habits,
  habitEntries,
  timeBlocks,
  dailyPlans,
  eveningReviews,
  githubActivities,
  financeTransactions,
  analyticsSnapshots,
  type AnalyticsSnapshot,
  type NewAnalyticsSnapshot,
} from "@/server/db/schema";
import type { LifeArea } from "@/types";
import type {
  PeriodFilter,
  AnalyticsDashboardDTO,
  ScheduleOptimizationResult,
  HistoricalRawData,
} from "./types";
import {
  calculateDelta,
  calculateHabitConsistency,
  calculateVelocity,
  calculateTimeAllocation,
  calculateGoalProgressSummary,
  calculateCrossDomainCorrelations,
} from "./calculations";
import { calculateScheduleOptimization } from "./schedule-optimizer";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Analytics service cannot be initialized in the browser."
  );
}

export interface DateRangeOptions {
  period?: PeriodFilter;
  startDate?: string;
  endDate?: string;
}

/**
 * Resolves standard date ranges and matching previous comparison periods.
 */
export function resolveDateRanges(options: DateRangeOptions = {}): {
  periodType: string;
  startDate: string;
  endDate: string;
  previousStartDate: string;
  previousEndDate: string;
  daysCount: number;
} {
  const period = options.period || "30d";
  const now = new Date();

  let startDate = "";
  let endDate = now.toISOString().split("T")[0];
  let daysCount = 30;

  if (period === "7d") {
    daysCount = 7;
    const start = new Date(now.getTime() - 6 * 86400000);
    startDate = start.toISOString().split("T")[0];
  } else if (period === "30d") {
    daysCount = 30;
    const start = new Date(now.getTime() - 29 * 86400000);
    startDate = start.toISOString().split("T")[0];
  } else if (period === "90d") {
    daysCount = 90;
    const start = new Date(now.getTime() - 89 * 86400000);
    startDate = start.toISOString().split("T")[0];
  } else if (period === "month") {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    startDate = new Date(Date.UTC(year, month, 1)).toISOString().split("T")[0];
    const lastDay = new Date(Date.UTC(year, month + 1, 0));
    endDate = lastDay.toISOString().split("T")[0];
    daysCount = lastDay.getUTCDate();
  } else if (period === "custom" && options.startDate && options.endDate) {
    startDate = options.startDate;
    endDate = options.endDate;
    const d1 = new Date(startDate + "T00:00:00Z");
    const d2 = new Date(endDate + "T00:00:00Z");
    daysCount = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1);
  } else {
    daysCount = 30;
    const start = new Date(now.getTime() - 29 * 86400000);
    startDate = start.toISOString().split("T")[0];
  }

  // Calculate previous comparison window of equal duration
  const startDt = new Date(startDate + "T00:00:00Z");
  const prevEndDt = new Date(startDt.getTime() - 86400000);
  const prevStartDt = new Date(prevEndDt.getTime() - (daysCount - 1) * 86400000);

  const previousEndDate = prevEndDt.toISOString().split("T")[0];
  const previousStartDate = prevStartDt.toISOString().split("T")[0];

  return {
    periodType: period,
    startDate,
    endDate,
    previousStartDate,
    previousEndDate,
    daysCount,
  };
}

/**
 * Fetch user-isolated historical raw data across all LifeOS domains.
 * Strictly scopes every query to `eq(table.userId, userId)`.
 */
export async function fetchHistoricalData(
  userId: string,
  minDate: string,
  maxDate: string
): Promise<HistoricalRawData> {
  const [
    userTasks,
    userProjects,
    userGoals,
    userHabits,
    userHabitEntries,
    userTimeBlocks,
    userDailyPlans,
    userReviews,
    userGithub,
    userFinances,
  ] = await Promise.all([
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
        energyLevel: tasks.energyLevel,
        estimatedDuration: tasks.estimatedDuration,
        actualDuration: tasks.actualDuration,
        dueDate: tasks.dueDate,
        scheduledDate: tasks.scheduledDate,
        completedAt: tasks.completedAt,
        createdAt: tasks.createdAt,
        projectId: tasks.projectId,
        goalId: tasks.goalId,
      })
      .from(tasks)
      .where(eq(tasks.userId, userId)),

    db
      .select({
        id: projects.id,
        name: projects.name,
        status: projects.status,
        area: projects.area,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(eq(projects.userId, userId)),

    db
      .select({
        id: goals.id,
        title: goals.title,
        status: goals.status,
        progress: goals.progress,
        area: goals.area,
        horizon: goals.horizon,
        targetDate: goals.targetDate,
        updatedAt: goals.updatedAt,
      })
      .from(goals)
      .where(eq(goals.userId, userId)),

    db
      .select({
        id: habits.id,
        title: habits.title,
        frequency: habits.frequency,
        frequencyTarget: habits.frequencyTarget,
        frequencyDays: habits.frequencyDays,
        timeOfDay: habits.timeOfDay,
        currentStreak: habits.currentStreak,
        longestStreak: habits.longestStreak,
        status: habits.status,
      })
      .from(habits)
      .where(eq(habits.userId, userId)),

    db
      .select({
        id: habitEntries.id,
        habitId: habitEntries.habitId,
        date: habitEntries.date,
        completedAt: habitEntries.completedAt,
      })
      .from(habitEntries)
      .where(
        and(
          eq(habitEntries.userId, userId),
          gte(habitEntries.date, minDate),
          lte(habitEntries.date, maxDate)
        )
      ),

    db
      .select({
        id: timeBlocks.id,
        title: timeBlocks.title,
        startTime: timeBlocks.startTime,
        endTime: timeBlocks.endTime,
        durationMinutes: timeBlocks.durationMinutes,
        actualMinutes: timeBlocks.actualMinutes,
        status: timeBlocks.status,
        commitmentLevel: timeBlocks.commitmentLevel,
        projectId: timeBlocks.projectId,
        goalId: timeBlocks.goalId,
        taskId: timeBlocks.taskId,
      })
      .from(timeBlocks)
      .where(eq(timeBlocks.userId, userId)),

    db
      .select({
        id: dailyPlans.id,
        date: dailyPlans.date,
        status: dailyPlans.status,
        priorityTaskIds: dailyPlans.priorityTaskIds,
        completedAt: dailyPlans.completedAt,
      })
      .from(dailyPlans)
      .where(
        and(
          eq(dailyPlans.userId, userId),
          gte(dailyPlans.date, minDate),
          lte(dailyPlans.date, maxDate)
        )
      ),

    db
      .select({
        id: eveningReviews.id,
        date: eveningReviews.date,
        productivityScore: eveningReviews.productivityScore,
        completedTaskIds: eveningReviews.completedTaskIds,
      })
      .from(eveningReviews)
      .where(
        and(
          eq(eveningReviews.userId, userId),
          gte(eveningReviews.date, minDate),
          lte(eveningReviews.date, maxDate)
        )
      ),

    db
      .select({
        id: githubActivities.id,
        activityType: githubActivities.activityType,
        timestamp: githubActivities.timestamp,
      })
      .from(githubActivities)
      .where(eq(githubActivities.userId, userId))
      .catch(() => []),

    db
      .select({
        id: financeTransactions.id,
        transactionType: financeTransactions.transactionType,
        amount: financeTransactions.amount,
        date: financeTransactions.date,
      })
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          gte(financeTransactions.date, new Date(minDate + "T00:00:00Z")),
          lte(financeTransactions.date, new Date(maxDate + "T23:59:59Z"))
        )
      )
      .catch(() => []),
  ]);

  return {
    tasks: userTasks,
    projects: userProjects.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      area: p.area as LifeArea,
      createdAt: p.createdAt,
      completedAt: p.status === "completed" ? p.updatedAt : null,
    })),
    goals: userGoals,
    habits: userHabits,
    habitEntries: userHabitEntries,
    timeBlocks: userTimeBlocks,
    dailyPlans: userDailyPlans,
    eveningReviews: userReviews,
    githubActivities: userGithub,
    financeTransactions: userFinances,
  };
}

/**
 * Main Service Entrypoint: Computes the complete Cross-Domain Personal Analytics Dashboard (INTEL-01, INTEL-04).
 */
export async function getAnalyticsDashboard(
  userId: string,
  options: DateRangeOptions = {}
): Promise<AnalyticsDashboardDTO> {
  const range = resolveDateRanges(options);

  // Fetch full data covering previous comparison window through current window
  const rawData = await fetchHistoricalData(
    userId,
    range.previousStartDate,
    range.endDate
  );

  // 1. Previous Period Stats (for deterministic deltas)
  const prevHabits = calculateHabitConsistency(
    rawData.habits,
    rawData.habitEntries,
    range.previousStartDate,
    range.previousEndDate
  );

  const prevVelocity = calculateVelocity(
    rawData.tasks,
    rawData.projects,
    range.previousStartDate,
    range.previousEndDate
  );

  const prevTime = calculateTimeAllocation(
    rawData.timeBlocks,
    rawData.projects,
    rawData.goals,
    range.previousStartDate,
    range.previousEndDate
  );

  const prevGoals = calculateGoalProgressSummary(rawData.goals);

  // 2. Current Period Core Analytics
  const habitConsistency = calculateHabitConsistency(
    rawData.habits,
    rawData.habitEntries,
    range.startDate,
    range.endDate,
    {
      consistencyRate: prevHabits.overallConsistencyRate,
      completions: prevHabits.totalCompletions,
    }
  );

  const projectVelocity = calculateVelocity(
    rawData.tasks,
    rawData.projects,
    range.startDate,
    range.endDate,
    {
      tasksCompleted: prevVelocity.tasksCompletedCount,
      velocityPerDay: prevVelocity.velocityPerDay,
      overdueRate: prevVelocity.overdueRate,
      accuracy: prevVelocity.estimationAccuracy,
    }
  );

  const timeAllocation = calculateTimeAllocation(
    rawData.timeBlocks,
    rawData.projects,
    rawData.goals,
    range.startDate,
    range.endDate,
    {
      completedMinutes: prevTime.totalCompletedMinutes,
      focusMinutes: prevTime.focusMinutes,
      completionRate: prevTime.completionRate,
    }
  );

  const goalProgress = calculateGoalProgressSummary(rawData.goals, {
    averageProgress: prevGoals.averageProgress,
    completedGoals: prevGoals.completedGoalsCount,
  });

  const correlations = calculateCrossDomainCorrelations(
    rawData.tasks,
    rawData.habitEntries,
    rawData.timeBlocks,
    rawData.dailyPlans,
    rawData.eveningReviews,
    rawData.githubActivities,
    range.startDate,
    range.endDate
  );

  // 3. Schedule Optimization Recommendations (INTEL-04)
  const scheduleOptimization = calculateScheduleOptimization(
    rawData.tasks,
    rawData.timeBlocks,
    rawData.eveningReviews
  );

  // 4. Evening Review Productivity Score Aggregates
  const currentReviews = rawData.eveningReviews.filter(
    (r) => r.date >= range.startDate && r.date <= range.endDate
  );
  const prevReviews = rawData.eveningReviews.filter(
    (r) => r.date >= range.previousStartDate && r.date <= range.previousEndDate
  );

  const currentAvgScore =
    currentReviews.length > 0
      ? Math.round(
          (currentReviews.reduce((acc, r) => acc + (r.productivityScore || 0), 0) /
            currentReviews.length) *
            10
        ) / 10
      : 80;

  const prevAvgScore =
    prevReviews.length > 0
      ? Math.round(
          (prevReviews.reduce((acc, r) => acc + (r.productivityScore || 0), 0) /
            prevReviews.length) *
            10
        ) / 10
      : 80;

  // 5. Finance Overview (optional enrichment)
  let financeOverview: AnalyticsDashboardDTO["financeOverview"] | undefined;
  if (rawData.financeTransactions && rawData.financeTransactions.length > 0) {
    let income = 0;
    let expenses = 0;
    for (const tx of rawData.financeTransactions) {
      const d =
        tx.date instanceof Date
          ? tx.date.toISOString().split("T")[0]
          : typeof tx.date === "string"
          ? tx.date.split("T")[0]
          : "";
      const amt =
        typeof tx.amount === "number" ? tx.amount : parseFloat(tx.amount) || 0;
      if (d >= range.startDate && d <= range.endDate) {
        if (tx.transactionType === "income") income += amt;
        if (tx.transactionType === "expense") expenses += amt;
      }
    }
    const netSavings = income - expenses;
    const savingsRate =
      income > 0 ? Math.round((netSavings / income) * 1000) / 10 : 0;
    financeOverview = {
      totalIncome: Math.round(income * 100) / 100,
      totalExpenses: Math.round(expenses * 100) / 100,
      netSavings: Math.round(netSavings * 100) / 100,
      savingsRate,
    };
  }

  // 6. GitHub Overview (optional enrichment)
  let githubStats: AnalyticsDashboardDTO["githubStats"] | undefined;
  if (rawData.githubActivities && rawData.githubActivities.length > 0) {
    const periodActivities = rawData.githubActivities.filter((a) => {
      const d = new Date(a.timestamp).toISOString().split("T")[0];
      return d >= range.startDate && d <= range.endDate;
    });
    githubStats = {
      totalCommits: periodActivities.filter((a) => a.activityType === "commit").length,
      totalPRs: periodActivities.filter((a) => a.activityType === "pull_request").length,
      totalIssues: periodActivities.filter((a) => a.activityType === "issue").length,
    };
  }

  // 7. High-Level Overview Metrics
  const totalFocusHours =
    Math.round((timeAllocation.focusMinutes / 60) * 10) / 10;
  const prevFocusHours =
    Math.round((prevTime.focusMinutes / 60) * 10) / 10;

  return {
    period: {
      periodType: range.periodType,
      startDate: range.startDate,
      endDate: range.endDate,
      previousStartDate: range.previousStartDate,
      previousEndDate: range.previousEndDate,
      daysCount: range.daysCount,
    },
    overview: {
      totalFocusHours,
      taskCompletionRate: projectVelocity.overallTaskCompletionRate,
      habitConsistencyRate: habitConsistency.overallConsistencyRate,
      averageProductivityScore: currentAvgScore,
      deltas: {
        focusHours: calculateDelta(totalFocusHours, prevFocusHours),
        taskCompletionRate: calculateDelta(
          projectVelocity.overallTaskCompletionRate,
          prevVelocity.overallTaskCompletionRate
        ),
        habitConsistencyRate: calculateDelta(
          habitConsistency.overallConsistencyRate,
          prevHabits.overallConsistencyRate
        ),
        productivityScore: calculateDelta(currentAvgScore, prevAvgScore),
      },
    },
    timeAllocation,
    habitConsistency,
    projectVelocity,
    goalProgress,
    correlations,
    scheduleOptimization,
    financeOverview,
    githubStats,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Service function: Schedule Optimization Recommender (INTEL-04)
 */
export async function getScheduleRecommendations(
  userId: string
): Promise<ScheduleOptimizationResult> {
  const minDate = new Date(Date.now() - 60 * 86400000).toISOString().split("T")[0];
  const maxDate = new Date().toISOString().split("T")[0];
  const rawData = await fetchHistoricalData(userId, minDate, maxDate);
  return calculateScheduleOptimization(
    rawData.tasks,
    rawData.timeBlocks,
    rawData.eveningReviews
  );
}

/**
 * Save an Analytics Snapshot for historical archiving / fast retrieval.
 */
export async function saveAnalyticsSnapshot(
  userId: string,
  snapshot: {
    periodType: "7d" | "30d" | "90d" | "day" | "week" | "month" | "quarter" | "year" | "custom";
    startDate: string;
    endDate: string;
    metrics: Record<string, unknown>;
  }
): Promise<AnalyticsSnapshot> {
  const existing = await db
    .select()
    .from(analyticsSnapshots)
    .where(
      and(
        eq(analyticsSnapshots.userId, userId),
        eq(analyticsSnapshots.periodType, snapshot.periodType),
        eq(analyticsSnapshots.startDate, snapshot.startDate),
        eq(analyticsSnapshots.endDate, snapshot.endDate)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    const [updated] = await db
      .update(analyticsSnapshots)
      .set({
        metrics: snapshot.metrics,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(analyticsSnapshots.userId, userId),
          eq(analyticsSnapshots.id, existing[0].id)
        )
      )
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(analyticsSnapshots)
    .values({
      userId,
      periodType: snapshot.periodType,
      startDate: snapshot.startDate,
      endDate: snapshot.endDate,
      metrics: snapshot.metrics,
    })
    .returning();

  return created;
}

/**
 * Query historical snapshots for a user.
 */
export async function getHistoricalSnapshots(
  userId: string,
  periodType?: string
): Promise<AnalyticsSnapshot[]> {
  if (periodType) {
    return db
      .select()
      .from(analyticsSnapshots)
      .where(
        and(
          eq(analyticsSnapshots.userId, userId),
          eq(analyticsSnapshots.periodType, periodType as any)
        )
      )
      .orderBy(desc(analyticsSnapshots.startDate));
  }

  return db
    .select()
    .from(analyticsSnapshots)
    .where(eq(analyticsSnapshots.userId, userId))
    .orderBy(desc(analyticsSnapshots.startDate));
}
