import type { LifeArea, GoalHorizon, EnergyLevel } from "@/types";
import type {
  MetricDelta,
  TrendDirection,
  TimeAllocationSummary,
  HabitConsistencySummary,
  ProjectVelocitySummary,
  GoalProgressAnalytics,
  CrossDomainCorrelations,
  HistoricalRawData,
} from "./types";

/**
 * Returns an array of ISO date strings (YYYY-MM-DD) between startDate and endDate inclusive.
 */
export function getDatesInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const curr = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");

  if (isNaN(curr.getTime()) || isNaN(end.getTime()) || curr > end) {
    return [startDate];
  }

  while (curr <= end) {
    dates.push(curr.toISOString().split("T")[0]);
    curr.setUTCDate(curr.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Deterministic Delta & Percentage Change Calculation.
 * Handles zero denominators, missing values, and trend direction.
 */
export function calculateDelta(current: number, previous: number): MetricDelta {
  const absoluteDelta = Math.round((current - previous) * 100) / 100;

  let percentageDelta: number | null = null;
  let direction: TrendDirection = "flat";

  if (previous === 0) {
    if (current === 0) {
      percentageDelta = 0;
      direction = "flat";
    } else if (current > 0) {
      percentageDelta = 100;
      direction = "up";
    } else {
      percentageDelta = -100;
      direction = "down";
    }
  } else {
    percentageDelta =
      Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
    if (current > previous) {
      direction = "up";
    } else if (current < previous) {
      direction = "down";
    } else {
      direction = "flat";
    }
  }

  return {
    current: Math.round(current * 100) / 100,
    previous: Math.round(previous * 100) / 100,
    absoluteDelta,
    percentageDelta,
    direction,
  };
}

/**
 * Calculate rolling averages for a daily time series.
 */
export function calculateRollingAverages(
  series: Array<{ date: string; value: number }>,
  windowSize = 7
): Array<{ date: string; value: number; rollingAvg: number }> {
  return series.map((item, idx) => {
    const startIdx = Math.max(0, idx - windowSize + 1);
    const windowSlice = series.slice(startIdx, idx + 1);
    const sum = windowSlice.reduce((acc, curr) => acc + curr.value, 0);
    const rollingAvg =
      windowSlice.length > 0
        ? Math.round((sum / windowSlice.length) * 10) / 10
        : 0;
    return {
      date: item.date,
      value: item.value,
      rollingAvg,
    };
  });
}

/**
 * Calculate Habit Consistency Analytics (INTEL-01)
 */
export function calculateHabitConsistency(
  habits: HistoricalRawData["habits"],
  entries: HistoricalRawData["habitEntries"],
  startDate: string,
  endDate: string,
  previousStats?: { consistencyRate: number; completions: number }
): HabitConsistencySummary {
  const dateRange = getDatesInRange(startDate, endDate);
  const totalDays = dateRange.length;

  const activeHabits = habits.filter((h) => h.status !== "archived");
  const entriesByHabit = new Map<string, Set<string>>();
  const entriesByDate = new Map<string, number>();

  for (const entry of entries) {
    if (!entriesByHabit.has(entry.habitId)) {
      entriesByHabit.set(entry.habitId, new Set());
    }
    entriesByHabit.get(entry.habitId)!.add(entry.date);
    entriesByDate.set(entry.date, (entriesByDate.get(entry.date) || 0) + 1);
  }

  let totalExpected = 0;
  let totalCompletions = 0;
  const timeOfDayCounts: Record<string, number> = {
    morning: 0,
    afternoon: 0,
    evening: 0,
    anytime: 0,
  };

  const habitBreakdown = activeHabits.map((habit) => {
    let expected = 0;
    const completedDates = entriesByHabit.get(habit.id) || new Set();

    // Determine expected days for this habit in dateRange
    if (habit.frequency === "daily") {
      expected = totalDays;
    } else if (habit.frequency === "weekdays") {
      expected = dateRange.filter((d) => {
        const day = new Date(d + "T00:00:00Z").getUTCDay();
        return day >= 1 && day <= 5;
      }).length;
    } else if (habit.frequency === "specific_days" && habit.frequencyDays?.length) {
      expected = dateRange.filter((d) => {
        const day = new Date(d + "T00:00:00Z").getUTCDay();
        return habit.frequencyDays!.includes(day);
      }).length;
    } else if (habit.frequency === "weekly") {
      const weeks = Math.max(1, Math.ceil(totalDays / 7));
      expected = (habit.frequencyTarget || 1) * weeks;
    } else {
      expected = totalDays;
    }

    const actual = dateRange.filter((d) => completedDates.has(d)).length;
    totalExpected += expected;
    totalCompletions += actual;

    const cue = (habit.timeOfDay?.toLowerCase() || "anytime") as keyof typeof timeOfDayCounts;
    if (cue in timeOfDayCounts) {
      timeOfDayCounts[cue] += actual;
    } else {
      timeOfDayCounts.anytime += actual;
    }

    const consistencyRate =
      expected > 0 ? Math.min(100, Math.round((actual / expected) * 1000) / 10) : 0;

    return {
      habitId: habit.id,
      title: habit.title,
      frequency: habit.frequency,
      targetCompletions: expected,
      actualCompletions: actual,
      consistencyRate,
      currentStreak: habit.currentStreak || 0,
      longestStreak: habit.longestStreak || 0,
    };
  });

  const overallConsistencyRate =
    totalExpected > 0
      ? Math.min(100, Math.round((totalCompletions / totalExpected) * 1000) / 10)
      : 0;

  // Perfect days: days where at least activeHabitsCount habits were checked in
  const targetPerDay = activeHabits.length;
  let perfectDaysCount = 0;
  const dailyConsistency = dateRange.map((date) => {
    const completed = entriesByDate.get(date) || 0;
    if (targetPerDay > 0 && completed >= targetPerDay) {
      perfectDaysCount++;
    }
    const rate =
      targetPerDay > 0 ? Math.min(100, Math.round((completed / targetPerDay) * 1000) / 10) : 0;
    return {
      date,
      expected: targetPerDay,
      completed,
      rate,
    };
  });

  const timeOfDayBreakdown = Object.entries(timeOfDayCounts).map(([cue, count]) => ({
    cue: cue as "morning" | "afternoon" | "evening" | "anytime",
    completions: count,
    percentage:
      totalCompletions > 0
        ? Math.round((count / totalCompletions) * 1000) / 10
        : 0,
  }));

  const totalStreaks = activeHabits.reduce((acc, h) => acc + (h.currentStreak || 0), 0);
  const averageStreak =
    activeHabits.length > 0 ? Math.round((totalStreaks / activeHabits.length) * 10) / 10 : 0;
  const longestActiveStreak = activeHabits.reduce(
    (max, h) => Math.max(max, h.longestStreak || 0),
    0
  );

  return {
    overallConsistencyRate,
    activeHabitsCount: activeHabits.length,
    totalCompletions,
    totalExpected,
    perfectDaysCount,
    averageStreak,
    longestActiveStreak,
    habitBreakdown,
    timeOfDayBreakdown,
    dailyConsistency,
    deltas: {
      overallConsistencyRate: calculateDelta(
        overallConsistencyRate,
        previousStats?.consistencyRate ?? 0
      ),
      totalCompletions: calculateDelta(
        totalCompletions,
        previousStats?.completions ?? 0
      ),
    },
  };
}

/**
 * Calculate Project & Task Completion Velocity (INTEL-01)
 */
export function calculateVelocity(
  tasks: HistoricalRawData["tasks"],
  projects: HistoricalRawData["projects"],
  startDate: string,
  endDate: string,
  previousStats?: {
    tasksCompleted: number;
    velocityPerDay: number;
    overdueRate: number;
    accuracy: number;
  }
): ProjectVelocitySummary {
  const dateRange = getDatesInRange(startDate, endDate);
  const totalDays = dateRange.length;

  const completedMap = new Map<string, number>();
  const createdMap = new Map<string, number>();
  for (const d of dateRange) {
    completedMap.set(d, 0);
    createdMap.set(d, 0);
  }

  let tasksCompletedCount = 0;
  let tasksCreatedCount = 0;
  let overdueCount = 0;
  let activeTasksCount = 0;

  let totalActualMinutes = 0;
  let totalEstimatedMinutes = 0;

  const projectCompletedTaskCounts = new Map<string, number>();
  const projectTotalTaskCounts = new Map<string, number>();

  for (const t of tasks) {
    if (t.projectId) {
      projectTotalTaskCounts.set(
        t.projectId,
        (projectTotalTaskCounts.get(t.projectId) || 0) + 1
      );
    }

    const isCompleted = t.status === "completed";
    const completedIso = t.completedAt
      ? new Date(t.completedAt).toISOString().split("T")[0]
      : null;
    const createdIso = t.createdAt
      ? new Date(t.createdAt).toISOString().split("T")[0]
      : null;

    if (isCompleted && completedIso && completedIso >= startDate && completedIso <= endDate) {
      tasksCompletedCount++;
      completedMap.set(completedIso, (completedMap.get(completedIso) || 0) + 1);

      if (t.projectId) {
        projectCompletedTaskCounts.set(
          t.projectId,
          (projectCompletedTaskCounts.get(t.projectId) || 0) + 1
        );
      }

      if (t.actualDuration && t.actualDuration > 0) {
        totalActualMinutes += t.actualDuration;
        totalEstimatedMinutes += t.estimatedDuration || t.actualDuration;
      }
    }

    if (createdIso && createdIso >= startDate && createdIso <= endDate) {
      tasksCreatedCount++;
      createdMap.set(createdIso, (createdMap.get(createdIso) || 0) + 1);
    }

    // Overdue check
    if (t.status !== "completed" && t.status !== "cancelled") {
      activeTasksCount++;
      const isOverdue =
        (t.dueDate && t.dueDate < endDate) ||
        (t.scheduledDate && t.scheduledDate < endDate);
      if (isOverdue) {
        overdueCount++;
      }
    }
  }

  const velocityPerDay =
    totalDays > 0 ? Math.round((tasksCompletedCount / totalDays) * 100) / 100 : 0;
  const velocityPerWeek = Math.round(velocityPerDay * 7 * 10) / 10;

  const overdueRate =
    activeTasksCount > 0
      ? Math.round((overdueCount / activeTasksCount) * 1000) / 10
      : 0;

  const totalPeriodTasks = tasksCompletedCount + activeTasksCount;
  const overallTaskCompletionRate =
    totalPeriodTasks > 0
      ? Math.round((tasksCompletedCount / totalPeriodTasks) * 1000) / 10
      : 0;

  const estimationAccuracy =
    totalEstimatedMinutes > 0
      ? Math.round((totalActualMinutes / totalEstimatedMinutes) * 1000) / 10
      : 100;

  const activeProjects = projects.filter((p) => p.status === "active");
  const completedProjects = projects.filter((p) => p.status === "completed");

  const rawDaily = dateRange.map((date) => ({
    date,
    value: completedMap.get(date) || 0,
    created: createdMap.get(date) || 0,
  }));

  const rollingDaily = calculateRollingAverages(
    rawDaily.map((d) => ({ date: d.date, value: d.value })),
    7
  );

  const dailyVelocity = dateRange.map((date, idx) => ({
    date,
    completedTasks: rawDaily[idx].value,
    createdTasks: rawDaily[idx].created,
    rollingAvg7d: rollingDaily[idx].rollingAvg,
  }));

  const projectBreakdown = projects.map((p) => {
    const totalT = projectTotalTaskCounts.get(p.id) || 0;
    const compT = projectCompletedTaskCounts.get(p.id) || 0;
    const progress =
      typeof p.progress === "number"
        ? p.progress
        : totalT > 0
        ? Math.round((compT / totalT) * 100)
        : p.status === "completed"
        ? 100
        : 0;
    return {
      projectId: p.id,
      projectName: p.name,
      tasksCompleted: compT,
      progress,
      status: p.status,
    };
  });

  return {
    tasksCompletedCount,
    tasksCreatedCount,
    velocityPerDay,
    velocityPerWeek,
    overdueCount,
    overdueRate,
    overallTaskCompletionRate,
    estimationAccuracy,
    activeProjectsCount: activeProjects.length,
    completedProjectsCount: completedProjects.length,
    completedMilestonesCount: 0,
    dailyVelocity,
    projectBreakdown,
    deltas: {
      tasksCompletedCount: calculateDelta(
        tasksCompletedCount,
        previousStats?.tasksCompleted ?? 0
      ),
      velocityPerDay: calculateDelta(
        velocityPerDay,
        previousStats?.velocityPerDay ?? 0
      ),
      overdueRate: calculateDelta(overdueRate, previousStats?.overdueRate ?? 0),
      estimationAccuracy: calculateDelta(
        estimationAccuracy,
        previousStats?.accuracy ?? 100
      ),
    },
  };
}

/**
 * Calculate Time Allocation & Calendar Analytics (INTEL-01)
 */
export function calculateTimeAllocation(
  timeBlocks: HistoricalRawData["timeBlocks"],
  projects: HistoricalRawData["projects"],
  goals: HistoricalRawData["goals"],
  startDate: string,
  endDate: string,
  previousStats?: {
    completedMinutes: number;
    focusMinutes: number;
    completionRate: number;
  }
): TimeAllocationSummary {
  const dateRange = getDatesInRange(startDate, endDate);

  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const goalMap = new Map(goals.map((g) => [g.id, g]));

  let totalScheduledMinutes = 0;
  let totalCompletedMinutes = 0;
  let focusMinutes = 0;

  const areaScheduled = new Map<LifeArea, number>();
  const areaCompleted = new Map<LifeArea, number>();
  const projectMinutes = new Map<string, number>();

  const dailyMinutesMap = new Map<string, { completed: number; focus: number }>();
  for (const d of dateRange) {
    dailyMinutesMap.set(d, { completed: 0, focus: 0 });
  }

  for (const b of timeBlocks) {
    const startIso = new Date(b.startTime).toISOString().split("T")[0];
    if (startIso < startDate || startIso > endDate) continue;

    totalScheduledMinutes += b.durationMinutes;

    // Determine area
    let area: LifeArea = "general";
    if (b.projectId && projectMap.has(b.projectId)) {
      area = projectMap.get(b.projectId)!.area;
    } else if (b.goalId && goalMap.has(b.goalId)) {
      area = goalMap.get(b.goalId)!.area;
    }

    areaScheduled.set(area, (areaScheduled.get(area) || 0) + b.durationMinutes);

    if (b.status === "completed") {
      const mins = b.actualMinutes || b.durationMinutes;
      totalCompletedMinutes += mins;
      areaCompleted.set(area, (areaCompleted.get(area) || 0) + mins);

      if (b.projectId) {
        projectMinutes.set(
          b.projectId,
          (projectMinutes.get(b.projectId) || 0) + mins
        );
      }

      // Focus work criteria: linked to task, project, or goal, or hard commitment
      const isFocus =
        Boolean(b.taskId || b.projectId || b.goalId) ||
        b.commitmentLevel === "hard" ||
        b.durationMinutes >= 30;

      if (isFocus) {
        focusMinutes += mins;
      }

      const dayStats = dailyMinutesMap.get(startIso);
      if (dayStats) {
        dayStats.completed += mins;
        if (isFocus) {
          dayStats.focus += mins;
        }
      }
    }
  }

  const completionRate =
    totalScheduledMinutes > 0
      ? Math.min(100, Math.round((totalCompletedMinutes / totalScheduledMinutes) * 1000) / 10)
      : 0;

  const shallowMinutes = Math.max(0, totalCompletedMinutes - focusMinutes);

  const ALL_AREAS: LifeArea[] = [
    "health",
    "career",
    "finance",
    "personal_development",
    "relationships",
    "general",
  ];

  const areaBreakdown = ALL_AREAS.map((area) => {
    const completed = areaCompleted.get(area) || 0;
    const scheduled = areaScheduled.get(area) || 0;
    return {
      area,
      scheduledMinutes: scheduled,
      completedMinutes: completed,
      percentageOfTotal:
        totalCompletedMinutes > 0
          ? Math.round((completed / totalCompletedMinutes) * 1000) / 10
          : 0,
    };
  });

  const projectBreakdown = projects
    .filter((p) => projectMinutes.has(p.id))
    .map((p) => {
      const minutes = projectMinutes.get(p.id) || 0;
      return {
        projectId: p.id,
        projectName: p.name,
        minutes,
        percentageOfTotal:
          totalCompletedMinutes > 0
            ? Math.round((minutes / totalCompletedMinutes) * 1000) / 10
            : 0,
      };
    })
    .sort((a, b) => b.minutes - a.minutes);

  const dailyDistribution = dateRange.map((date) => {
    const item = dailyMinutesMap.get(date) || { completed: 0, focus: 0 };
    return {
      date,
      completedMinutes: item.completed,
      focusMinutes: item.focus,
    };
  });

  return {
    totalScheduledMinutes,
    totalCompletedMinutes,
    completionRate,
    focusMinutes,
    shallowMinutes,
    areaBreakdown,
    projectBreakdown,
    dailyDistribution,
    deltas: {
      completedMinutes: calculateDelta(
        totalCompletedMinutes,
        previousStats?.completedMinutes ?? 0
      ),
      focusMinutes: calculateDelta(
        focusMinutes,
        previousStats?.focusMinutes ?? 0
      ),
      completionRate: calculateDelta(
        completionRate,
        previousStats?.completionRate ?? 0
      ),
    },
  };
}

/**
 * Calculate Goal Progress Rollup (INTEL-01)
 */
export function calculateGoalProgressSummary(
  goals: HistoricalRawData["goals"],
  previousStats?: { averageProgress: number; completedGoals: number }
): GoalProgressAnalytics {
  const activeGoals = goals.filter(
    (g) => g.status === "in_progress" || g.status === "not_started"
  );
  const completedGoals = goals.filter((g) => g.status === "completed");

  const totalProgress = goals.reduce((acc, g) => acc + (g.progress || 0), 0);
  const averageProgress =
    goals.length > 0 ? Math.round((totalProgress / goals.length) * 10) / 10 : 0;

  const areaMap = new Map<LifeArea, { count: number; totalProgress: number }>();
  const horizonMap = new Map<GoalHorizon, { count: number; totalProgress: number }>();

  let stalledGoalsCount = 0;
  let goalsMovingForwardCount = 0;

  for (const g of goals) {
    // Area
    if (!areaMap.has(g.area)) {
      areaMap.set(g.area, { count: 0, totalProgress: 0 });
    }
    const a = areaMap.get(g.area)!;
    a.count++;
    a.totalProgress += g.progress || 0;

    // Horizon
    if (!horizonMap.has(g.horizon)) {
      horizonMap.set(g.horizon, { count: 0, totalProgress: 0 });
    }
    const h = horizonMap.get(g.horizon)!;
    h.count++;
    h.totalProgress += g.progress || 0;

    if (g.status === "in_progress") {
      if ((g.progress || 0) === 0) {
        stalledGoalsCount++;
      } else {
        goalsMovingForwardCount++;
      }
    }
  }

  const ALL_AREAS: LifeArea[] = [
    "health",
    "career",
    "finance",
    "personal_development",
    "relationships",
    "general",
  ];

  const areaRollup = ALL_AREAS.map((area) => {
    const data = areaMap.get(area) || { count: 0, totalProgress: 0 };
    return {
      area,
      goalsCount: data.count,
      averageProgress:
        data.count > 0
          ? Math.round((data.totalProgress / data.count) * 10) / 10
          : 0,
    };
  });

  const ALL_HORIZONS: GoalHorizon[] = [
    "short_term",
    "medium_term",
    "long_term",
  ];

  const horizonRollup = ALL_HORIZONS.map((horizon) => {
    const data = horizonMap.get(horizon) || { count: 0, totalProgress: 0 };
    return {
      horizon,
      goalsCount: data.count,
      averageProgress:
        data.count > 0
          ? Math.round((data.totalProgress / data.count) * 10) / 10
          : 0,
    };
  });

  const goalList = goals.map((g) => ({
    id: g.id,
    title: g.title,
    area: g.area,
    horizon: g.horizon,
    progress: g.progress,
    targetDate:
      g.targetDate instanceof Date
        ? g.targetDate.toISOString().split("T")[0]
        : typeof g.targetDate === "string"
        ? g.targetDate.split("T")[0]
        : null,
    status: g.status,
  }));

  return {
    totalGoalsCount: goals.length,
    activeGoalsCount: activeGoals.length,
    completedGoalsCount: completedGoals.length,
    averageProgress,
    areaRollup,
    horizonRollup,
    stalledGoalsCount,
    goalsMovingForwardCount,
    goalList,
    deltas: {
      averageProgress: calculateDelta(
        averageProgress,
        previousStats?.averageProgress ?? 0
      ),
      completedGoalsCount: calculateDelta(
        completedGoals.length,
        previousStats?.completedGoals ?? 0
      ),
    },
  };
}

/**
 * Cross-Domain Correlation Analysis (INTEL-01)
 * Computes inter-domain indicators:
 * 1. Habit consistency vs task completion velocity on the same day.
 * 2. Deep work minutes vs Evening Review productivity score.
 * 3. Daily plan completion vs task velocity.
 * 4. GitHub activity overlap with velocity.
 */
export function calculateCrossDomainCorrelations(
  tasks: HistoricalRawData["tasks"],
  entries: HistoricalRawData["habitEntries"],
  timeBlocks: HistoricalRawData["timeBlocks"],
  dailyPlans: HistoricalRawData["dailyPlans"],
  eveningReviews: HistoricalRawData["eveningReviews"],
  githubActivities: HistoricalRawData["githubActivities"] = [],
  startDate: string,
  endDate: string
): CrossDomainCorrelations {
  const dateRange = getDatesInRange(startDate, endDate);

  // Group by date
  const tasksByDate = new Map<string, number>();
  const habitsByDate = new Map<string, number>();
  const focusByDate = new Map<string, number>();
  const reviewScoreByDate = new Map<string, number>();
  const hasPlanByDate = new Map<string, boolean>();
  const commitsByDate = new Map<string, number>();

  for (const d of dateRange) {
    tasksByDate.set(d, 0);
    habitsByDate.set(d, 0);
    focusByDate.set(d, 0);
    hasPlanByDate.set(d, false);
    commitsByDate.set(d, 0);
  }

  for (const t of tasks) {
    if (t.status === "completed" && t.completedAt) {
      const d = new Date(t.completedAt).toISOString().split("T")[0];
      if (tasksByDate.has(d)) {
        tasksByDate.set(d, tasksByDate.get(d)! + 1);
      }
    }
  }

  for (const e of entries) {
    if (habitsByDate.has(e.date)) {
      habitsByDate.set(e.date, habitsByDate.get(e.date)! + 1);
    }
  }

  for (const b of timeBlocks) {
    if (b.status === "completed") {
      const d = new Date(b.startTime).toISOString().split("T")[0];
      if (focusByDate.has(d)) {
        focusByDate.set(d, focusByDate.get(d)! + (b.actualMinutes || b.durationMinutes));
      }
    }
  }

  for (const r of eveningReviews) {
    reviewScoreByDate.set(r.date, r.productivityScore);
  }

  for (const p of dailyPlans) {
    if (p.status === "completed") {
      hasPlanByDate.set(p.date, true);
    }
  }

  for (const g of githubActivities) {
    const d = new Date(g.timestamp).toISOString().split("T")[0];
    if (commitsByDate.has(d)) {
      commitsByDate.set(d, commitsByDate.get(d)! + 1);
    }
  }

  // 1. Habit vs Velocity
  const highHabitTasks: number[] = [];
  const lowHabitTasks: number[] = [];

  for (const d of dateRange) {
    const habitCount = habitsByDate.get(d) || 0;
    const taskCount = tasksByDate.get(d) || 0;
    if (habitCount >= 3) {
      highHabitTasks.push(taskCount);
    } else {
      lowHabitTasks.push(taskCount);
    }
  }

  const avgHighHabits =
    highHabitTasks.length > 0
      ? highHabitTasks.reduce((a, b) => a + b, 0) / highHabitTasks.length
      : 0;
  const avgLowHabits =
    lowHabitTasks.length > 0
      ? lowHabitTasks.reduce((a, b) => a + b, 0) / lowHabitTasks.length
      : 0;

  const habitImpact =
    avgLowHabits > 0
      ? Math.round(((avgHighHabits - avgLowHabits) / avgLowHabits) * 1000) / 10
      : avgHighHabits > 0
      ? 100
      : 0;

  // 2. Focus vs Productivity Score
  const highFocusScores: number[] = [];
  const lowFocusScores: number[] = [];

  for (const d of dateRange) {
    if (reviewScoreByDate.has(d)) {
      const score = reviewScoreByDate.get(d)!;
      const focus = focusByDate.get(d) || 0;
      if (focus >= 90) {
        highFocusScores.push(score);
      } else {
        lowFocusScores.push(score);
      }
    }
  }

  const avgHighFocusScore =
    highFocusScores.length > 0
      ? Math.round(
          (highFocusScores.reduce((a, b) => a + b, 0) / highFocusScores.length) *
            10
        ) / 10
      : 0;
  const avgLowFocusScore =
    lowFocusScores.length > 0
      ? Math.round(
          (lowFocusScores.reduce((a, b) => a + b, 0) / lowFocusScores.length) * 10
        ) / 10
      : 0;

  // 3. Plan impact on velocity
  const plannedTasks: number[] = [];
  const unplannedTasks: number[] = [];

  for (const d of dateRange) {
    const taskCount = tasksByDate.get(d) || 0;
    if (hasPlanByDate.get(d)) {
      plannedTasks.push(taskCount);
    } else {
      unplannedTasks.push(taskCount);
    }
  }

  const avgPlannedTasks =
    plannedTasks.length > 0
      ? Math.round(
          (plannedTasks.reduce((a, b) => a + b, 0) / plannedTasks.length) * 10
        ) / 10
      : 0;
  const avgUnplannedTasks =
    unplannedTasks.length > 0
      ? Math.round(
          (unplannedTasks.reduce((a, b) => a + b, 0) / unplannedTasks.length) * 10
        ) / 10
      : 0;

  const planLift =
    avgUnplannedTasks > 0
      ? Math.round(
          ((avgPlannedTasks - avgUnplannedTasks) / avgUnplannedTasks) * 1000
        ) / 10
      : avgPlannedTasks > 0
      ? 100
      : 0;

  // 4. GitHub overlap
  let totalCommits = 0;
  const highVelocityCommits: number[] = [];
  const lowVelocityCommits: number[] = [];

  for (const d of dateRange) {
    const commits = commitsByDate.get(d) || 0;
    const taskCount = tasksByDate.get(d) || 0;
    totalCommits += commits;
    if (taskCount >= 3) {
      highVelocityCommits.push(commits);
    } else {
      lowVelocityCommits.push(commits);
    }
  }

  const avgHighVelocityCommits =
    highVelocityCommits.length > 0
      ? Math.round(
          (highVelocityCommits.reduce((a, b) => a + b, 0) /
            highVelocityCommits.length) *
            10
        ) / 10
      : 0;
  const avgLowVelocityCommits =
    lowVelocityCommits.length > 0
      ? Math.round(
          (lowVelocityCommits.reduce((a, b) => a + b, 0) /
            lowVelocityCommits.length) *
            10
        ) / 10
      : 0;

  return {
    habitVsVelocityCorrelation: {
      highHabitDaysAvgTasks: Math.round(avgHighHabits * 10) / 10,
      lowHabitDaysAvgTasks: Math.round(avgLowHabits * 10) / 10,
      impactPercentage: habitImpact,
    },
    deepWorkVsProductivityScore: {
      highFocusDaysAvgScore: avgHighFocusScore,
      lowFocusDaysAvgScore: avgLowFocusScore,
      scoreDelta: Math.round((avgHighFocusScore - avgLowFocusScore) * 10) / 10,
    },
    dailyPlanCompletionImpact: {
      plannedDaysAvgVelocity: avgPlannedTasks,
      unplannedDaysAvgVelocity: avgUnplannedTasks,
      velocityLiftPercentage: planLift,
    },
    githubProductivityOverlap: {
      totalCommits,
      avgCommitsOnHighVelocityDays: avgHighVelocityCommits,
      avgCommitsOnLowVelocityDays: avgLowVelocityCommits,
    },
  };
}
