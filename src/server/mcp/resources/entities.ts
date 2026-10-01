/**
 * MCP Focused Entity Graph Resources
 *
 * Exposes focused personal context resources:
 * - lifeos://context/tasks/today (alias lifeos://tasks/today)
 * - lifeos://context/goals/active (alias lifeos://goals/active)
 * - lifeos://context/projects/active (alias lifeos://projects/active)
 * - lifeos://context/finance/summary (alias lifeos://finance/summary)
 * - lifeos://context/daily-plan (alias lifeos://daily-plan/today)
 * - lifeos://context/notifications (alias lifeos://notifications/unread)
 */

import { listTasks } from "@/server/tasks/service";
import { listGoals } from "@/server/goals/service";
import { listProjects } from "@/server/projects/service";
import { getFinanceSummary } from "@/server/finance/reports-service";
import { getDailyPlan } from "@/server/daily-plan/service";
import { listNotifications, getUnreadCount } from "@/server/notifications/service";
import { verifySessionActive } from "../auth";
import { formatMcpResource } from "../formatters";
import type { McpContext } from "../types";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Today's tasks resource handler. Strictly bounded to 50 items.
 */
export async function handleTasksToday(
  context: McpContext,
  uri: URL
): Promise<ReadResourceResult> {
  verifySessionActive(context);
  const userId = context.user.id;
  const today = new Date().toISOString().slice(0, 10);

  const allTasks = await listTasks(userId);
  const todayTasks = allTasks
    .filter((t) => {
      if (t.status === "completed" || t.status === "cancelled") {
        return false;
      }
      const sched = t.scheduledDate ? new Date(t.scheduledDate).toISOString().slice(0, 10) : null;
      const due = t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : null;
      return sched === today || (due && due <= today);
    })
    .slice(0, 50);

  return formatMcpResource(uri.href, {
    date: today,
    count: todayTasks.length,
    tasks: todayTasks,
  });
}

/**
 * Active goals resource handler. Strictly bounded to 50 items.
 */
export async function handleGoalsActive(
  context: McpContext,
  uri: URL
): Promise<ReadResourceResult> {
  verifySessionActive(context);
  const userId = context.user.id;

  const goals = await listGoals(userId, { status: "active" });
  const boundedGoals = goals.slice(0, 50);

  return formatMcpResource(uri.href, {
    count: boundedGoals.length,
    goals: boundedGoals,
  });
}

/**
 * Active projects resource handler. Strictly bounded to 50 items.
 */
export async function handleProjectsActive(
  context: McpContext,
  uri: URL
): Promise<ReadResourceResult> {
  verifySessionActive(context);
  const userId = context.user.id;

  const projects = await listProjects(userId, { status: "active" });
  const boundedProjects = projects.slice(0, 50);

  return formatMcpResource(uri.href, {
    count: boundedProjects.length,
    projects: boundedProjects,
  });
}

/**
 * Monthly financial health summary. Strictly READ-ONLY aggregated report.
 */
export async function handleFinanceSummary(
  context: McpContext,
  uri: URL
): Promise<ReadResourceResult> {
  verifySessionActive(context);
  const userId = context.user.id;
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  const summary = await getFinanceSummary(userId, currentMonth);

  return formatMcpResource(uri.href, {
    month: currentMonth,
    readOnly: true,
    summary,
  });
}

/**
 * Today's daily plan resource handler.
 */
export async function handleDailyPlan(
  context: McpContext,
  uri: URL
): Promise<ReadResourceResult> {
  verifySessionActive(context);
  const userId = context.user.id;
  const today = new Date().toISOString().slice(0, 10);

  const dailyPlan = await getDailyPlan(userId, today);

  return formatMcpResource(uri.href, {
    date: today,
    dailyPlan,
  });
}

/**
 * Unread notifications resource handler. Strictly bounded to 20 items.
 */
export async function handleNotifications(
  context: McpContext,
  uri: URL
): Promise<ReadResourceResult> {
  verifySessionActive(context);
  const userId = context.user.id;

  const [notifResult, unreadCount] = await Promise.all([
    listNotifications(userId, { unreadOnly: true, limit: 20 }),
    getUnreadCount(userId),
  ]);

  return formatMcpResource(uri.href, {
    unreadCount,
    count: notifResult.notifications.length,
    notifications: notifResult.notifications.slice(0, 20),
  });
}
