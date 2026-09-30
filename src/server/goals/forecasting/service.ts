import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import {
  goals,
  projects,
  tasks,
  habits,
  habitEntries,
  timeBlocks,
} from "@/server/db/schema";
import { AuthorizationError } from "@/server/auth/guard";
import { NotFoundError } from "../service";
import { calculateGoalRiskForecast } from "./calculations";
import type {
  GoalRiskForecastDTO,
  GoalForecastSummaryDTO,
  GoalForecastSignalInput,
  GoalRiskLevel,
} from "./types";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Goal forecasting service cannot be executed in the browser."
  );
}

/**
 * Retrieves a deterministic risk forecast for a specific goal owned by the user.
 * Enforces strict user ownership: never returns data belonging to other users.
 */
export async function getGoalRiskForecast(
  userId: string,
  goalId: string
): Promise<GoalRiskForecastDTO> {
  if (!userId) {
    throw new AuthorizationError("Authentication required for goal forecasting");
  }

  // 1. Fetch Goal with ownership verification
  const [goalRow] = await db
    .select()
    .from(goals)
    .where(eq(goals.id, goalId))
    .limit(1);

  if (!goalRow) {
    throw new NotFoundError(`Goal with id '${goalId}' not found`);
  }

  if (goalRow.userId !== userId) {
    throw new AuthorizationError("Unauthorized access to requested goal");
  }

  // 2. Fetch linked projects
  const linkedProjects = await db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      deadline: projects.deadline,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.goalId, goalId)));

  const projectIds = linkedProjects.map((p) => p.id);

  // 3. Fetch linked tasks (both directly linked and via projects)
  const taskConditions = [eq(tasks.goalId, goalId)];
  if (projectIds.length > 0) {
    taskConditions.push(inArray(tasks.projectId, projectIds));
  }

  const linkedTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      projectId: tasks.projectId,
      dueDate: tasks.dueDate,
      completedAt: tasks.completedAt,
      createdAt: tasks.createdAt,
    })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.goalId, goalId)));

  // If there are linked project tasks not captured by direct goalId, query them
  let allTasks = linkedTasks;
  if (projectIds.length > 0) {
    const projectTasks = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
        projectId: tasks.projectId,
        dueDate: tasks.dueDate,
        completedAt: tasks.completedAt,
        createdAt: tasks.createdAt,
      })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), inArray(tasks.projectId, projectIds)));

    const seenTaskIds = new Set(linkedTasks.map((t) => t.id));
    for (const pt of projectTasks) {
      if (!seenTaskIds.has(pt.id)) {
        seenTaskIds.add(pt.id);
        allTasks.push(pt);
      }
    }
  }

  // 4. Fetch linked habits and consistency
  const linkedHabits = await db
    .select({
      id: habits.id,
      title: habits.title,
      frequency: habits.frequency,
      frequencyTarget: habits.frequencyTarget,
      currentStreak: habits.currentStreak,
      status: habits.status,
    })
    .from(habits)
    .where(and(eq(habits.userId, userId), eq(habits.goalId, goalId)));

  const habitSignals = linkedHabits.map((h) => ({
    id: h.id,
    title: h.title,
    // Baseline consistency estimated from current streak and active status
    consistencyRate:
      h.status === "archived" ? 0 : Math.min(100, Math.max(30, h.currentStreak * 10)),
    currentStreak: h.currentStreak,
  }));

  // 5. Fetch linked timeblocks (recent focus minutes)
  const linkedTimeBlocks = await db
    .select({
      durationMinutes: timeBlocks.durationMinutes,
      actualMinutes: timeBlocks.actualMinutes,
      status: timeBlocks.status,
    })
    .from(timeBlocks)
    .where(and(eq(timeBlocks.userId, userId), eq(timeBlocks.goalId, goalId)));

  const totalFocusMinutes = linkedTimeBlocks.reduce(
    (acc, tb) => acc + (tb.actualMinutes || tb.durationMinutes || 0),
    0
  );

  // 6. Build signal input and execute pure calculation
  const mappedProjects = linkedProjects.map((p) => {
    const pTasks = allTasks.filter((t) => t.projectId === p.id);
    const computedProgress =
      p.status === "completed"
        ? 100
        : pTasks.length > 0
        ? Math.round(
            (pTasks.filter((t) => t.status === "completed").length /
              pTasks.length) *
              100
          )
        : 0;

    return {
      id: p.id,
      name: p.name,
      status: p.status,
      progress: computedProgress,
      targetDate: p.deadline,
      createdAt: p.createdAt,
    };
  });

  const signalInput: GoalForecastSignalInput = {
    goalId: goalRow.id,
    goalTitle: goalRow.title,
    goalStatus: goalRow.status,
    priority: goalRow.priority,
    area: goalRow.area,
    horizon: goalRow.horizon,
    currentProgress: goalRow.progress,
    startDate: goalRow.startDate,
    targetDate: goalRow.targetDate,
    createdAt: goalRow.createdAt,
    completedAt: goalRow.completedAt,
    tasks: allTasks,
    projects: mappedProjects,
    habits: habitSignals,
    focusMinutes: totalFocusMinutes,
  };

  return calculateGoalRiskForecast(signalInput);
}

/**
 * Retrieves risk forecasts for all active goals owned by the user,
 * along with a high-level portfolio risk distribution summary.
 */
export async function getAllGoalsRiskForecasts(
  userId: string,
  options?: {
    horizon?: string;
    area?: string;
    status?: string;
  }
): Promise<GoalForecastSummaryDTO> {
  if (!userId) {
    throw new AuthorizationError("Authentication required for goal forecasting");
  }

  // Fetch all user goals matching criteria
  const userGoals = await db
    .select()
    .from(goals)
    .where(eq(goals.userId, userId));

  const filteredGoals = userGoals.filter((g) => {
    if (options?.horizon && options.horizon !== "all" && g.horizon !== options.horizon) {
      return false;
    }
    if (options?.area && options.area !== "all" && g.area !== options.area) {
      return false;
    }
    if (options?.status && options.status !== "all" && g.status !== options.status) {
      return false;
    }
    return true;
  });

  const forecasts: GoalRiskForecastDTO[] = [];

  for (const g of filteredGoals) {
    try {
      const forecast = await getGoalRiskForecast(userId, g.id);
      forecasts.push(forecast);
    } catch (err) {
      console.error(`Failed to calculate forecast for goal ${g.id}:`, err);
    }
  }

  // Compute portfolio distribution
  let onTrackCount = 0;
  let lowRiskCount = 0;
  let mediumRiskCount = 0;
  let highRiskCount = 0;
  let criticalCount = 0;
  let completedCount = 0;
  let overdueCount = 0;
  let totalScore = 0;

  const atRiskGoals: Array<{
    id: string;
    title: string;
    riskLevel: GoalRiskLevel;
    riskScore: number;
    reason: string;
  }> = [];

  for (const f of forecasts) {
    totalScore += f.riskScore;
    if (f.isOverdue) overdueCount++;

    switch (f.riskLevel) {
      case "completed":
        completedCount++;
        break;
      case "on_track":
        onTrackCount++;
        break;
      case "low_risk":
        lowRiskCount++;
        break;
      case "medium_risk":
        mediumRiskCount++;
        break;
      case "high_risk":
        highRiskCount++;
        atRiskGoals.push({
          id: f.goalId,
          title: f.goalTitle,
          riskLevel: f.riskLevel,
          riskScore: f.riskScore,
          reason: f.contributingFactors[0]?.factor || "Elevated trajectory risk",
        });
        break;
      case "critical":
        criticalCount++;
        atRiskGoals.push({
          id: f.goalId,
          title: f.goalTitle,
          riskLevel: f.riskLevel,
          riskScore: f.riskScore,
          reason: f.contributingFactors[0]?.factor || "Critical failure risk / Overdue",
        });
        break;
    }
  }

  // Sort at-risk goals by risk score descending
  atRiskGoals.sort((a, b) => b.riskScore - a.riskScore);

  const totalGoals = forecasts.length;
  const averageRiskScore =
    totalGoals > 0 ? Math.round(totalScore / totalGoals) : 0;

  return {
    totalGoals,
    onTrackCount,
    lowRiskCount,
    mediumRiskCount,
    highRiskCount,
    criticalCount,
    completedCount,
    overdueCount,
    averageRiskScore,
    atRiskGoals,
    forecasts,
    generatedAt: new Date().toISOString(),
  };
}
