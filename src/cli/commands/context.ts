/**
 * CLI Context & Status Inspection Commands
 *
 * Implements 'lifeos status' and 'lifeos context'.
 * Strictly reuses canonical application services without raw SQL:
 * - getDashboardOverview (@/server/dashboard/service)
 * - listNotifications / getUnreadCount (@/server/notifications/service)
 * - listTimeBlocks (@/server/calendar/service)
 */

import { getDashboardOverview } from "@/server/dashboard/service";
import { listNotifications, getUnreadCount } from "@/server/notifications/service";
import { listTimeBlocks } from "@/server/calendar/service";
import { assertNoCallerSpoofing } from "../auth";
import type { CommandResult, ParsedArgs, CommandContext } from "../types";
import { formatTable } from "../formatters";
import { executeAgentOperation } from "@/server/agents/safety-boundary";

export interface AggregatedLifeContext {
  date: string;
  user: { id: string; name: string; email: string };
  metrics: {
    tasksCompletedToday: number;
    tasksPendingToday: number;
    habitsCompletedToday: number;
    habitsTotalToday: number;
    activeGoalsCount: number;
    activeProjectsCount: number;
    productivityScore: number | null;
  };
  goals: unknown[];
  projects: unknown[];
  tasks: {
    priority: unknown[];
    overdue: unknown[];
  };
  schedule: unknown[];
  notifications: {
    unreadCount: number;
    items: unknown[];
  };
  habits: {
    items: unknown[];
  };
}

export async function aggregateContext(
  context: CommandContext,
  dateInput?: string
): Promise<AggregatedLifeContext> {
  const userId = context.user.id;
  const today = dateInput || new Date().toISOString().slice(0, 10);
  const todayStart = `${today}T00:00:00.000Z`;
  const todayEnd = `${today}T23:59:59.999Z`;

  const [dashboard, unreadCount, notifs, timeBlocks] = await Promise.all([
    getDashboardOverview(userId, today),
    getUnreadCount(userId),
    listNotifications(userId, { unreadOnly: true, limit: 10 }),
    listTimeBlocks(userId, { startDate: todayStart, endDate: todayEnd }),
  ]);

  return {
    date: today,
    user: context.user,
    metrics: {
      tasksCompletedToday: dashboard.metrics.completedTasksCount,
      tasksPendingToday: dashboard.metrics.pendingTasksCount,
      habitsCompletedToday: dashboard.metrics.todayHabitsCompleted,
      habitsTotalToday: dashboard.metrics.todayHabitsTotal,
      activeGoalsCount: dashboard.metrics.activeGoalsCount,
      activeProjectsCount: dashboard.metrics.activeProjectsCount,
      productivityScore: dashboard.metrics.todayProductivityScore,
    },
    goals: dashboard.goalsAndProjects.activeGoals,
    projects: dashboard.goalsAndProjects.activeProjects,
    tasks: {
      priority: dashboard.priorities.todayTasks,
      overdue: dashboard.priorities.overdueTasks,
    },
    schedule: timeBlocks,
    notifications: {
      unreadCount,
      items: notifs.notifications,
    },
    habits: {
      items: dashboard.habits.items,
    },
  };
}

async function runStatusAction(
  parsed: ParsedArgs,
  context: CommandContext
): Promise<CommandResult<AggregatedLifeContext>> {
  const date = parsed.flags.date as string | undefined;
  const agg = await aggregateContext(context, date);

  // Build human-friendly report
  const lines: string[] = [];
  lines.push(`=== LifeOS Status (${agg.date}) ===`);
  lines.push(`User: ${agg.user.name} <${agg.user.email}>`);
  lines.push(
    `Tasks: ${agg.metrics.tasksCompletedToday} completed, ${agg.metrics.tasksPendingToday} pending | Habits: ${agg.metrics.habitsCompletedToday}/${agg.metrics.habitsTotalToday} | Active Goals: ${agg.metrics.activeGoalsCount} | Unread: ${agg.notifications.unreadCount}`
  );
  lines.push("");

  // Top Tasks
  lines.push("--- Top Priority Tasks ---");
  const taskRows = (agg.tasks.priority as any[]).map((t) => ({
    id: t.id.slice(0, 8),
    title: t.title,
    priority: t.priority,
    status: t.status,
  }));
  lines.push(
    formatTable(
      [
        { key: "id", label: "ID", width: 10 },
        { key: "title", label: "Title", width: 32 },
        { key: "priority", label: "Priority", width: 10 },
        { key: "status", label: "Status", width: 12 },
      ],
      taskRows,
      { emptyMessage: "(no priority tasks)" }
    )
  );
  lines.push("");

  // Active Goals
  lines.push("--- Active Goals ---");
  const goalRows = (agg.goals as any[]).map((g) => ({
    id: g.id.slice(0, 8),
    title: g.title,
    horizon: g.horizon,
    progress: `${Math.round(g.progress ?? 0)}%`,
  }));
  lines.push(
    formatTable(
      [
        { key: "id", label: "ID", width: 10 },
        { key: "title", label: "Goal Title", width: 32 },
        { key: "horizon", label: "Horizon", width: 14 },
        { key: "progress", label: "Progress", width: 10 },
      ],
      goalRows,
      { emptyMessage: "(no active goals)" }
    )
  );

  return {
    data: agg,
    message: lines.join("\n"),
  };
}

export async function handleStatus(
  parsed: ParsedArgs,
  context?: CommandContext
): Promise<CommandResult<AggregatedLifeContext>> {
  assertNoCallerSpoofing(parsed.flags);
  if (!context) {
    throw new Error("Command requires an authenticated context.");
  }

  if (context.isAgent) {
    const result = await executeAgentOperation({
      context: {
        isAgent: true,
        agent: context.agent,
        user: context.user,
        sessionId: context.session?.id,
      },
      toolName: "status",
      arguments: parsed.flags as Record<string, unknown>,
      targetUserId: context.user.id,
      executor: () => runStatusAction(parsed, context),
    });

    if (result.status === "CHALLENGE_REQUIRED") {
      return {
        data: result as any,
        message: result.message,
      };
    }

    return result.data as CommandResult<AggregatedLifeContext>;
  }

  return runStatusAction(parsed, context);
}

export async function handleContext(
  parsed: ParsedArgs,
  context?: CommandContext
): Promise<CommandResult<AggregatedLifeContext>> {
  assertNoCallerSpoofing(parsed.flags);
  if (!context) {
    throw new Error("Command requires an authenticated context.");
  }

  if (context.isAgent) {
    const result = await executeAgentOperation({
      context: {
        isAgent: true,
        agent: context.agent,
        user: context.user,
        sessionId: context.session?.id,
      },
      toolName: "context",
      arguments: parsed.flags as Record<string, unknown>,
      targetUserId: context.user.id,
      executor: () => runStatusAction(parsed, context),
    });

    if (result.status === "CHALLENGE_REQUIRED") {
      return {
        data: result as any,
        message: result.message,
      };
    }

    return result.data as CommandResult<AggregatedLifeContext>;
  }

  return runStatusAction(parsed, context);
}

