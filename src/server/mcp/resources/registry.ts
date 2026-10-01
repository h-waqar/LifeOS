/**
 * MCP Resource Registry Coordinator
 *
 * Registers all readable personal context graph resources and their approved
 * aliases on the McpServer instance.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpContext } from "../types";
import { handleContextOverview } from "./context";
import {
  handleTasksToday,
  handleGoalsActive,
  handleProjectsActive,
  handleFinanceSummary,
  handleDailyPlan,
  handleNotifications,
} from "./entities";
import { registerSkillResources } from "./skills";
import { registerPlanningResources } from "./planning";
import { registerWorkspaceResources } from "./workspace";

export function registerResources(server: McpServer, context: McpContext): void {
  // 1. Context Overview & Dashboard
  server.registerResource(
    "context_overview",
    "lifeos://context/overview",
    {
      description: "Aggregated personal context overview: metrics, goals, projects, priorities, and schedule",
      mimeType: "application/json",
    },
    async (uri) => handleContextOverview(context, uri)
  );

  server.registerResource(
    "context_dashboard_alias",
    "lifeos://context/dashboard",
    {
      description: "Alias for lifeos://context/overview",
      mimeType: "application/json",
    },
    async (uri) => handleContextOverview(context, uri)
  );

  // 2. Tasks Today
  server.registerResource(
    "context_tasks_today",
    "lifeos://context/tasks/today",
    {
      description: "Today's scheduled and overdue tasks with priority scores and blocking status (max 50)",
      mimeType: "application/json",
    },
    async (uri) => handleTasksToday(context, uri)
  );

  server.registerResource(
    "tasks_today_alias",
    "lifeos://tasks/today",
    {
      description: "Alias for lifeos://context/tasks/today",
      mimeType: "application/json",
    },
    async (uri) => handleTasksToday(context, uri)
  );

  // 3. Active Goals
  server.registerResource(
    "context_goals_active",
    "lifeos://context/goals/active",
    {
      description: "Active high-level goals with progress rollups, horizons, and target dates (max 50)",
      mimeType: "application/json",
    },
    async (uri) => handleGoalsActive(context, uri)
  );

  server.registerResource(
    "goals_active_alias",
    "lifeos://goals/active",
    {
      description: "Alias for lifeos://context/goals/active",
      mimeType: "application/json",
    },
    async (uri) => handleGoalsActive(context, uri)
  );

  // 4. Active Projects
  server.registerResource(
    "context_projects_active",
    "lifeos://context/projects/active",
    {
      description: "Active projects with milestone progress, areas, and priorities (max 50)",
      mimeType: "application/json",
    },
    async (uri) => handleProjectsActive(context, uri)
  );

  server.registerResource(
    "projects_active_alias",
    "lifeos://projects/active",
    {
      description: "Alias for lifeos://context/projects/active",
      mimeType: "application/json",
    },
    async (uri) => handleProjectsActive(context, uri)
  );

  // 5. Finance Summary (Strictly Read-Only)
  server.registerResource(
    "context_finance_summary",
    "lifeos://context/finance/summary",
    {
      description: "Aggregated monthly financial health report (net worth, cash flow, savings rate). Strictly READ-ONLY.",
      mimeType: "application/json",
    },
    async (uri) => handleFinanceSummary(context, uri)
  );

  server.registerResource(
    "finance_summary_alias",
    "lifeos://finance/summary",
    {
      description: "Alias for lifeos://context/finance/summary",
      mimeType: "application/json",
    },
    async (uri) => handleFinanceSummary(context, uri)
  );

  // 6. Daily Plan
  server.registerResource(
    "context_daily_plan",
    "lifeos://context/daily-plan",
    {
      description: "Today's daily plan status, intentions, morning focus, and evening reflection",
      mimeType: "application/json",
    },
    async (uri) => handleDailyPlan(context, uri)
  );

  server.registerResource(
    "daily_plan_today_alias",
    "lifeos://daily-plan/today",
    {
      description: "Alias for lifeos://context/daily-plan",
      mimeType: "application/json",
    },
    async (uri) => handleDailyPlan(context, uri)
  );

  // 7. Notifications
  server.registerResource(
    "context_notifications",
    "lifeos://context/notifications",
    {
      description: "Recent unread system notifications and alerts (max 20)",
      mimeType: "application/json",
    },
    async (uri) => handleNotifications(context, uri)
  );

  server.registerResource(
    "notifications_unread_alias",
    "lifeos://notifications/unread",
    {
      description: "Alias for lifeos://context/notifications",
      mimeType: "application/json",
    },
    async (uri) => handleNotifications(context, uri)
  );

  // 8. Procedural Skills Catalog & Detail Resources
  registerSkillResources(server, context);

  // 9. Planning Graph State & Decisions Resources
  registerPlanningResources(server, context);

  // 10. Workspace Plan State Resources
  registerWorkspaceResources(server, context);
}
