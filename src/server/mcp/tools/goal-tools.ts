/**
 * MCP Goal Tools
 *
 * Exposes canonical goal management operations to agents:
 * - lifeos_create_goal
 * - lifeos_update_goal
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpContext } from "../types";
import { createGoal, updateGoal } from "@/server/goals/service";
import { verifySessionActive } from "../auth";
import { formatMcpToolSuccess, formatMcpToolError } from "../formatters";
import { executeAgentOperation } from "@/server/agents/safety-boundary";

export function registerGoalTools(server: McpServer, context: McpContext): void {
  // 1. lifeos_create_goal
  server.registerTool(
    "lifeos_create_goal",
    {
      description: "Create a new goal with horizon, target metrics, dates, and life area",
      inputSchema: z.object({
        title: z.string().trim().min(1, "Goal title cannot be empty").max(255),
        description: z.string().trim().max(4000).nullish(),
        horizon: z.enum(["long_term", "medium_term", "short_term"]).optional(),
        area: z.enum(["health", "career", "finance", "personal_development", "relationships", "general"]).optional(),
        status: z.enum(["not_started", "in_progress", "completed", "paused", "archived"]).optional(),
        priority: z.enum(["low", "medium", "high", "critical"]).optional(),
        metricType: z.enum(["none", "numeric", "currency", "boolean", "percentage"]).optional(),
        targetValue: z.number().nullish(),
        currentValue: z.number().nullish(),
        unit: z.string().trim().max(50).nullish(),
        startDate: z.string().datetime().nullish(),
        targetDate: z.string().datetime().nullish(),
        challengeId: z.string().optional(),
      }).passthrough(),
    },
    async (args) => {
      try {
        verifySessionActive(context);
        const result = await executeAgentOperation({
          context: {
            isAgent: Boolean(context.isAgent || context.agent),
            agent: context.agent,
            user: context.user,
            sessionId: context.session?.id,
          },
          toolName: "lifeos_create_goal",
          arguments: args as Record<string, unknown>,
          challengeId: (args as any).challengeId,
          targetUserId: context.user.id,
          executor: () => createGoal(context.user.id, args as any),
        });
        return formatMcpToolSuccess(result.status === "EXECUTED" ? result.data : result);
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );

  // 2. lifeos_update_goal
  server.registerTool(
    "lifeos_update_goal",
    {
      description: "Update an existing goal's progress, target values, status, or horizon",
      inputSchema: z.object({
        id: z.string().min(1, "Goal ID is required"),
        title: z.string().trim().min(1).max(255).optional(),
        description: z.string().trim().max(4000).nullish(),
        horizon: z.enum(["long_term", "medium_term", "short_term"]).optional(),
        area: z.enum(["health", "career", "finance", "personal_development", "relationships", "general"]).optional(),
        status: z.enum(["not_started", "in_progress", "completed", "paused", "archived"]).optional(),
        priority: z.enum(["low", "medium", "high", "critical"]).optional(),
        metricType: z.enum(["none", "numeric", "currency", "boolean", "percentage"]).optional(),
        targetValue: z.number().nullish(),
        currentValue: z.number().nullish(),
        unit: z.string().trim().max(50).nullish(),
        startDate: z.string().datetime().nullish(),
        targetDate: z.string().datetime().nullish(),
        challengeId: z.string().optional(),
      }).passthrough(),
    },
    async (args) => {
      try {
        verifySessionActive(context);
        const { id, challengeId: _cid, ...data } = args as any;
        const result = await executeAgentOperation({
          context: {
            isAgent: Boolean(context.isAgent || context.agent),
            agent: context.agent,
            user: context.user,
            sessionId: context.session?.id,
          },
          toolName: "lifeos_update_goal",
          arguments: args as Record<string, unknown>,
          challengeId: (args as any).challengeId,
          targetUserId: context.user.id,
          executor: () => updateGoal(context.user.id, id, data as any),
        });
        return formatMcpToolSuccess(result.status === "EXECUTED" ? result.data : result);
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );
}
