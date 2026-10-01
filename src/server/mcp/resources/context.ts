/**
 * MCP Personal Context Overview Resource
 *
 * Implements lifeos://context/overview (and alias lifeos://context/dashboard)
 * strictly delegating to canonical domain services.
 */

import { getDashboardOverview } from "@/server/dashboard/service";
import { listNotifications, getUnreadCount } from "@/server/notifications/service";
import { listTimeBlocks } from "@/server/calendar/service";
import { verifySessionActive } from "../auth";
import { formatMcpResource } from "../formatters";
import type { McpContext } from "../types";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";

export async function handleContextOverview(
  context: McpContext,
  uri: URL
): Promise<ReadResourceResult> {
  verifySessionActive(context);
  const userId = context.user.id;
  const today = new Date().toISOString().slice(0, 10);

  const [dashboard, notificationsResult, unreadCount, timeBlocks] = await Promise.all([
    getDashboardOverview(userId, today),
    listNotifications(userId, { unreadOnly: true, limit: 10 }),
    getUnreadCount(userId),
    listTimeBlocks(userId, { startDate: today, endDate: today }),
  ]);

  const overviewPayload = {
    date: today,
    user: {
      id: context.user.id,
      name: context.user.name,
      email: context.user.email,
    },
    metrics: dashboard.metrics,
    dailyPlan: dashboard.dailyPlan,
    topPriorities: dashboard.priorities.todayTasks.slice(0, 10),
    upcomingSchedule: timeBlocks.slice(0, 10),
    activeHabits: dashboard.habits,
    goals: {
      activeCount: dashboard.goalsAndProjects.activeGoals.length,
      topGoals: dashboard.goalsAndProjects.activeGoals.slice(0, 5),
    },
    projects: {
      activeCount: dashboard.goalsAndProjects.activeProjects.length,
      topProjects: dashboard.goalsAndProjects.activeProjects.slice(0, 5),
    },
    notifications: {
      unreadCount,
      recent: notificationsResult.notifications.slice(0, 10),
    },
  };

  return formatMcpResource(uri.href, overviewPayload);
}
