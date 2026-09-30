import type {
  GoalForecastSignalInput,
  GoalRiskForecastDTO,
  GoalRiskLevel,
  DataSufficiency,
  ContributingRiskFactor,
  GoalForecastSignals,
} from "./types";

const MS_PER_DAY = 86_400_000;

function parseDate(val: Date | string | null | undefined): Date | null {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function roundToDecimals(val: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

/**
 * Pure deterministic calculation engine for Goal Risk Forecasting (INTEL-02).
 * Evaluates goal status, target deadlines, historical task and project velocity,
 * overdue bottlenecks, and habit consistency to produce explainable risk projections.
 */
export function calculateGoalRiskForecast(
  input: GoalForecastSignalInput
): GoalRiskForecastDTO {
  const asOf = parseDate(input.asOfDate) || new Date();
  const asOfTime = asOf.getTime();

  const createdAt = parseDate(input.createdAt) || asOf;
  const startDate = parseDate(input.startDate) || createdAt;
  const targetDate = parseDate(input.targetDate);
  const completedAt = parseDate(input.completedAt);

  const boundedProgress = Math.min(100, Math.max(0, input.currentProgress));
  const isCompleted =
    input.goalStatus === "completed" || boundedProgress >= 100;

  // 1. Task Diagnostics & Metrics
  const tasks = input.tasks || [];
  const totalTasks = tasks.length;
  let completedTasks = 0;
  let overdueTasks = 0;
  let recentCompletedTasks = 0;

  const recentWindowDays = 30;
  const recentThresholdTime = asOfTime - recentWindowDays * MS_PER_DAY;

  for (const t of tasks) {
    const isTaskCompleted =
      t.status === "completed" || Boolean(t.completedAt);
    if (isTaskCompleted) {
      completedTasks++;
      const compDate = parseDate(t.completedAt) || parseDate(t.createdAt);
      if (compDate && compDate.getTime() >= recentThresholdTime) {
        recentCompletedTasks++;
      }
    } else {
      // Check overdue for open tasks
      const dueDate = parseDate(t.dueDate);
      if (dueDate && dueDate.getTime() < asOfTime) {
        overdueTasks++;
      }
    }
  }

  const openTasks = Math.max(0, totalTasks - completedTasks);
  const overdueTaskRate =
    openTasks > 0 ? roundToDecimals(overdueTasks / openTasks, 4) : 0;

  // 2. Project Diagnostics
  const projects = input.projects || [];
  const totalProjects = projects.length;
  let completedProjects = 0;
  let projectProgressSum = 0;
  let stalledProjectsCount = 0;

  for (const p of projects) {
    if (p.status === "completed" || p.progress >= 100) {
      completedProjects++;
    } else if (p.progress === 0 && (p.status === "active" || p.status === "planning")) {
      stalledProjectsCount++;
    }
    projectProgressSum += Math.min(100, Math.max(0, p.progress));
  }

  const averageProjectProgress =
    totalProjects > 0 ? roundToDecimals(projectProgressSum / totalProjects, 1) : 0;

  // 3. Habit Consistency
  const habits = input.habits || [];
  const linkedHabitsCount = habits.length;
  let averageHabitConsistency: number | null = null;
  if (linkedHabitsCount > 0) {
    const consistencySum = habits.reduce(
      (sum, h) => sum + Math.min(100, Math.max(0, h.consistencyRate)),
      0
    );
    averageHabitConsistency = roundToDecimals(consistencySum / linkedHabitsCount, 1);
  }

  // 4. Focus Time
  const focusMinutes = Math.max(0, input.focusMinutes || 0);
  const recentFocusHours = roundToDecimals(focusMinutes / 60, 1);

  // 5. Timeline, Elapsed Days, and Deadlines
  const elapsedDays = Math.max(
    0.1,
    roundToDecimals((asOfTime - startDate.getTime()) / MS_PER_DAY, 1)
  );

  let daysRemaining: number | null = null;
  let isOverdue = false;
  let expectedProgressByTimeline: number | null = null;
  let progressGap: number | null = null;

  if (targetDate) {
    const targetTime = targetDate.getTime();
    const remainingMs = targetTime - asOfTime;
    daysRemaining = roundToDecimals(remainingMs / MS_PER_DAY, 1);

    if (daysRemaining < 0 && !isCompleted) {
      isOverdue = true;
    }

    // Expected progress based on linear timeline
    const totalDurationMs = targetTime - startDate.getTime();
    if (totalDurationMs > 0) {
      const elapsedMs = Math.max(0, asOfTime - startDate.getTime());
      const linearRatio = Math.min(1, Math.max(0, elapsedMs / totalDurationMs));
      expectedProgressByTimeline = roundToDecimals(linearRatio * 100, 1);
      progressGap = roundToDecimals(
        Math.max(-100, expectedProgressByTimeline - boundedProgress),
        1
      );
    }
  }

  // 6. Velocity Calculations (% progress per day)
  let currentVelocityPerDay = 0;

  if (isCompleted) {
    currentVelocityPerDay = roundToDecimals(100 / elapsedDays, 2);
  } else if (boundedProgress > 0) {
    // Derive velocity from progress over elapsed days, adjusted by recent activity
    const overallVelocity = boundedProgress / elapsedDays;
    if (totalTasks > 0) {
      const taskCompletionRate = completedTasks / totalTasks;
      const recentTaskVelocity = recentCompletedTasks / Math.min(recentWindowDays, elapsedDays);
      // Weight overall progress velocity with recent task momentum
      const taskMomentumFactor =
        recentTaskVelocity > 0 ? 1.0 : completedTasks === 0 ? 0.5 : 0.8;
      currentVelocityPerDay = roundToDecimals(
        Math.max(0, overallVelocity * taskMomentumFactor),
        3
      );
    } else {
      currentVelocityPerDay = roundToDecimals(Math.max(0, overallVelocity), 3);
    }
  }

  let requiredVelocityPerDay: number | null = null;
  let velocityRatio: number | null = null;

  if (!isCompleted && targetDate && daysRemaining !== null) {
    const remainingProgress = Math.max(0, 100 - boundedProgress);
    if (daysRemaining > 0) {
      requiredVelocityPerDay = roundToDecimals(
        remainingProgress / Math.max(0.5, daysRemaining),
        3
      );
      if (requiredVelocityPerDay > 0) {
        velocityRatio = roundToDecimals(
          currentVelocityPerDay / requiredVelocityPerDay,
          2
        );
      } else {
        velocityRatio = 1.0;
      }
    } else {
      // Overdue
      requiredVelocityPerDay = null;
      velocityRatio = 0;
    }
  }

  // 7. Projected Completion Date & Window
  let projectedCompletionDate: string | null = null;
  let projectedCompletionWindow: { earliestDate: string; latestDate: string } | null = null;
  let daysToCompleteProjected: number | null = null;

  if (isCompleted) {
    projectedCompletionDate = completedAt
      ? completedAt.toISOString()
      : asOf.toISOString();
    daysToCompleteProjected = 0;
  } else if (currentVelocityPerDay > 0) {
    const remainingProgress = Math.max(0, 100 - boundedProgress);
    const projectedDays = remainingProgress / currentVelocityPerDay;
    daysToCompleteProjected = roundToDecimals(projectedDays, 1);

    const projectedMs = asOfTime + projectedDays * MS_PER_DAY;
    projectedCompletionDate = new Date(projectedMs).toISOString();

    // Optimistic (25% faster) and Conservative (25% slower)
    const earliestMs = asOfTime + (projectedDays / 1.25) * MS_PER_DAY;
    const latestMs = asOfTime + (projectedDays / 0.75) * MS_PER_DAY;
    projectedCompletionWindow = {
      earliestDate: new Date(earliestMs).toISOString(),
      latestDate: new Date(latestMs).toISOString(),
    };
  }

  // 8. Data Sufficiency & Confidence
  const dataPointsCount =
    totalTasks +
    totalProjects +
    linkedHabitsCount +
    (focusMinutes > 0 ? 1 : 0) +
    (boundedProgress > 0 ? 1 : 0);

  let dataSufficiency: DataSufficiency = "sufficient";
  let sufficientData = true;
  let confidenceScore = 0.85;
  let sufficiencyExplanation =
    "Sufficient historical activity and task signals available for accurate forecasting.";

  if (isCompleted) {
    confidenceScore = 1.0;
    sufficiencyExplanation = "Goal is fully completed; historical verification complete.";
  } else if (dataPointsCount === 0 && elapsedDays < 3) {
    dataSufficiency = "insufficient";
    sufficientData = false;
    confidenceScore = 0.25;
    sufficiencyExplanation =
      "Insufficient activity logged. Establishing tasks, projects, or progress logs will improve forecast confidence.";
  } else if (dataPointsCount < 3 || elapsedDays < 5) {
    dataSufficiency = "sparse";
    sufficientData = true;
    confidenceScore = 0.55;
    sufficiencyExplanation =
      "Sparse activity logged. Forecast provides early estimates with moderate confidence.";
  } else {
    confidenceScore = roundToDecimals(
      Math.min(0.95, 0.65 + 0.03 * Math.min(10, dataPointsCount)),
      2
    );
  }

  // 9. Risk Contributing Factors & Recommendations
  const contributingFactors: ContributingRiskFactor[] = [];
  const actionableRecommendations: string[] = [];

  // Completed State
  if (isCompleted) {
    const signals: GoalForecastSignals = {
      totalTasks,
      completedTasks,
      openTasks,
      overdueTasks,
      overdueTaskRate,
      totalProjects,
      completedProjects,
      averageProjectProgress,
      stalledProjectsCount,
      linkedHabitsCount,
      averageHabitConsistency,
      recentFocusHours,
      expectedProgressByTimeline,
      progressGap,
      historicalDaysSampled: elapsedDays,
    };

    return {
      goalId: input.goalId,
      goalTitle: input.goalTitle,
      status: input.goalStatus,
      priority: input.priority,
      area: input.area,
      horizon: input.horizon,
      currentProgress: 100,
      targetDate: targetDate ? targetDate.toISOString() : null,
      daysRemaining,
      isOverdue: false,
      currentVelocityPerDay,
      requiredVelocityPerDay,
      velocityRatio: 1.0,
      projectedCompletionDate,
      projectedCompletionWindow,
      daysToCompleteProjected,
      riskLevel: "completed",
      riskScore: 0,
      confidenceScore: 1.0,
      dataSufficiency,
      sufficientData,
      dataPointsCount,
      sufficiencyExplanation,
      signals,
      contributingFactors: [],
      actionableRecommendations: [
        "Goal is completed. Review retrospective learnings or archive linked projects.",
      ],
      generatedAt: asOf.toISOString(),
    };
  }

  // Factor: Overdue Goal
  if (isOverdue) {
    contributingFactors.push({
      code: "OVERDUE_DEADLINE",
      severity: "critical",
      factor: `Goal deadline expired ${Math.abs(daysRemaining || 0)} days ago with ${100 - boundedProgress}% progress remaining.`,
      impactWeight: 0.45,
      observedMetric: `${daysRemaining} days remaining`,
    });
    actionableRecommendations.push(
      "Goal deadline has passed. Reschedule target date or descope remaining deliverables."
    );
  }

  // Factor: Velocity Deficit
  if (!isOverdue && requiredVelocityPerDay !== null && requiredVelocityPerDay > 0) {
    if (currentVelocityPerDay <= 0) {
      contributingFactors.push({
        code: "STALLED_PROGRESS",
        severity: "high",
        factor: `Progress is currently stalled. Required velocity is ${requiredVelocityPerDay}% per day to finish on time.`,
        impactWeight: 0.35,
        observedMetric: `0.00% / day vs ${requiredVelocityPerDay}% required`,
      });
      actionableRecommendations.push(
        `Resume momentum: Schedule focus blocks to deliver at least ${requiredVelocityPerDay}% daily progress.`
      );
    } else if (velocityRatio !== null && velocityRatio < 0.5) {
      contributingFactors.push({
        code: "SEVERE_VELOCITY_DEFICIT",
        severity: "high",
        factor: `Current velocity (${currentVelocityPerDay}%/day) is less than half the required velocity (${requiredVelocityPerDay}%/day).`,
        impactWeight: 0.3,
        observedMetric: `${velocityRatio * 100}% of required velocity`,
      });
      actionableRecommendations.push(
        `Accelerate execution: Double daily task output or adjust goal scope to avoid deadline slippage.`
      );
    } else if (velocityRatio !== null && velocityRatio < 0.85) {
      contributingFactors.push({
        code: "MODERATE_VELOCITY_DEFICIT",
        severity: "medium",
        factor: `Current velocity (${currentVelocityPerDay}%/day) trails required velocity (${requiredVelocityPerDay}%/day).`,
        impactWeight: 0.2,
        observedMetric: `${velocityRatio * 100}% of required velocity`,
      });
      actionableRecommendations.push(
        `Increase weekly completion pace by ~${roundToDecimals((requiredVelocityPerDay - currentVelocityPerDay) * 7, 1)}% to realign with target schedule.`
      );
    }
  }

  // Factor: Overdue Tasks Bottleneck
  if (overdueTasks > 0) {
    const severity: ContributingRiskFactor["severity"] =
      overdueTaskRate >= 0.5 ? "high" : "medium";
    contributingFactors.push({
      code: "OVERDUE_TASKS",
      severity,
      factor: `${overdueTasks} linked ${overdueTasks === 1 ? "task is" : "tasks are"} overdue (${Math.round(overdueTaskRate * 100)}% of open tasks).`,
      impactWeight: 0.25,
      observedMetric: `${overdueTasks} overdue tasks`,
    });
    actionableRecommendations.push(
      `Clear bottlenecks: Reschedule or complete the ${overdueTasks} overdue tasks to restore delivery flow.`
    );
  }

  // Factor: Timeline Gap
  if (progressGap !== null && progressGap > 15) {
    contributingFactors.push({
      code: "TIMELINE_SLIPPAGE",
      severity: progressGap > 30 ? "high" : "medium",
      factor: `Progress is lagging ${progressGap}% behind linear schedule trajectory.`,
      impactWeight: 0.2,
      observedMetric: `${boundedProgress}% actual vs ${expectedProgressByTimeline}% expected`,
    });
  }

  // Factor: Stalled Projects
  if (stalledProjectsCount > 0) {
    contributingFactors.push({
      code: "STALLED_PROJECTS",
      severity: "medium",
      factor: `${stalledProjectsCount} linked ${stalledProjectsCount === 1 ? "project has" : "projects have"} zero progress.`,
      impactWeight: 0.15,
      observedMetric: `${stalledProjectsCount} inactive projects`,
    });
    actionableRecommendations.push(
      "Unblock stalled projects: Break down initial project steps into high-priority tasks."
    );
  }

  // Factor: Low Habit Consistency
  if (averageHabitConsistency !== null && averageHabitConsistency < 50) {
    contributingFactors.push({
      code: "LOW_HABIT_CONSISTENCY",
      severity: "low",
      factor: `Linked habit consistency is low (${averageHabitConsistency}%).`,
      impactWeight: 0.1,
      observedMetric: `${averageHabitConsistency}% consistency`,
    });
    actionableRecommendations.push(
      "Re-establish daily habit check-ins to build baseline consistency."
    );
  }

  // Factor: Imminent Deadline with High Remaining Work
  if (
    targetDate &&
    daysRemaining !== null &&
    daysRemaining > 0 &&
    daysRemaining <= 7 &&
    boundedProgress < 80
  ) {
    contributingFactors.push({
      code: "IMMINENT_DEADLINE",
      severity: "high",
      factor: `Deadline in ${daysRemaining} days with ${100 - boundedProgress}% progress remaining.`,
      impactWeight: 0.25,
      observedMetric: `${daysRemaining} days remaining`,
    });
    actionableRecommendations.push(
      "Urgent sprint required: Focus exclusively on essential deliverables to make the upcoming deadline."
    );
  }

  // Factor: Missing Deadline
  if (!targetDate) {
    contributingFactors.push({
      code: "NO_TARGET_DEADLINE",
      severity: "low",
      factor: "No target deadline set; risk assessed from current momentum and open tasks.",
      impactWeight: 0.05,
    });
    actionableRecommendations.push(
      "Assign a target completion date to enable accurate velocity trajectory forecasting."
    );
  }

  // 10. Composite Risk Score (0 to 100)
  let riskScore = 0;

  if (isOverdue) {
    riskScore = Math.min(100, 90 + Math.min(10, Math.floor(Math.abs(daysRemaining || 0) / 2)));
  } else {
    // Component 1: Velocity Deficit (0 to 40 points)
    let velocityDeficitScore = 0;
    if (requiredVelocityPerDay !== null && requiredVelocityPerDay > 0) {
      if (currentVelocityPerDay <= 0) {
        velocityDeficitScore = 40;
      } else if (velocityRatio !== null) {
        if (velocityRatio < 1.0) {
          velocityDeficitScore = Math.min(40, Math.round((1 - velocityRatio) * 40));
        }
      }
    } else if (!targetDate && boundedProgress === 0 && elapsedDays > 14) {
      velocityDeficitScore = 25;
    }

    // Component 2: Overdue Task Pressure (0 to 25 points)
    const overdueTaskScore = Math.min(25, Math.round(overdueTaskRate * 25));

    // Component 3: Timeline Gap (0 to 20 points)
    let timelineGapScore = 0;
    if (progressGap !== null && progressGap > 0) {
      timelineGapScore = Math.min(20, Math.round((progressGap / 50) * 20));
    }

    // Component 4: Project & Habit Health (0 to 15 points)
    let projectHabitScore = 0;
    if (totalProjects > 0 && stalledProjectsCount > 0) {
      projectHabitScore += Math.round((stalledProjectsCount / totalProjects) * 10);
    }
    if (averageHabitConsistency !== null && averageHabitConsistency < 60) {
      projectHabitScore += Math.round(((60 - averageHabitConsistency) / 60) * 5);
    }

    riskScore = Math.min(
      95,
      Math.max(0, velocityDeficitScore + overdueTaskScore + timelineGapScore + projectHabitScore)
    );
  }

  // Map to Risk Level
  let riskLevel: GoalRiskLevel = "on_track";
  if (isOverdue || riskScore >= 90) {
    riskLevel = "critical";
  } else if (riskScore >= 75) {
    riskLevel = "high_risk";
  } else if (riskScore >= 50) {
    riskLevel = "medium_risk";
  } else if (riskScore >= 25) {
    riskLevel = "low_risk";
  } else {
    riskLevel = "on_track";
  }

  // Default healthy recommendation if none produced
  if (actionableRecommendations.length === 0) {
    actionableRecommendations.push(
      "Goal is currently on track. Maintain current weekly task execution pace."
    );
  }

  const signals: GoalForecastSignals = {
    totalTasks,
    completedTasks,
    openTasks,
    overdueTasks,
    overdueTaskRate,
    totalProjects,
    completedProjects,
    averageProjectProgress,
    stalledProjectsCount,
    linkedHabitsCount,
    averageHabitConsistency,
    recentFocusHours,
    expectedProgressByTimeline,
    progressGap,
    historicalDaysSampled: elapsedDays,
  };

  return {
    goalId: input.goalId,
    goalTitle: input.goalTitle,
    status: input.goalStatus,
    priority: input.priority,
    area: input.area,
    horizon: input.horizon,
    currentProgress: boundedProgress,
    targetDate: targetDate ? targetDate.toISOString() : null,
    daysRemaining,
    isOverdue,
    currentVelocityPerDay,
    requiredVelocityPerDay,
    velocityRatio,
    projectedCompletionDate,
    projectedCompletionWindow,
    daysToCompleteProjected,
    riskLevel,
    riskScore,
    confidenceScore,
    dataSufficiency,
    sufficientData,
    dataPointsCount,
    sufficiencyExplanation,
    signals,
    contributingFactors,
    actionableRecommendations,
    generatedAt: asOf.toISOString(),
  };
}
