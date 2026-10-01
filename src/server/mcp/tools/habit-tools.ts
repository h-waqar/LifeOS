/**
 * MCP Habit Tools
 *
 * Exposes canonical habit logging to agents:
 * - lifeos_log_habit
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpContext } from "../types";
import { logHabitEntry } from "@/server/habits/service";
import { verifySessionActive } from "../auth";
import { formatMcpToolSuccess, formatMcpToolError } from "../formatters";
import { executeAgentOperation } from "@/server/agents/safety-boundary";

export function registerHabitTools(server: McpServer, context: McpContext): void {
  // 1. lifeos_log_habit
  server.registerTool(
    "lifeos_log_habit",
    {
      description: "Log a habit completion or check-in entry for a calendar date",
      inputSchema: z.object({
        habitId: z.string().min(1, "Habit ID is required"),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
        value: z.number().min(0, "Value must be non-negative").optional(),
        notes: z.string().trim().max(1000, "Notes cannot exceed 1000 characters").nullish(),
        challengeId: z.string().optional(),
      }).passthrough(),
    },
    async (args) => {
      try {
        verifySessionActive(context);
        const { habitId, challengeId: _cid, ...entryInput } = args as any;
        const result = await executeAgentOperation({
          context: {
            isAgent: Boolean(context.isAgent || context.agent),
            agent: context.agent,
            user: context.user,
            sessionId: context.session?.id,
          },
          toolName: "lifeos_log_habit",
          arguments: args as Record<string, unknown>,
          challengeId: (args as any).challengeId,
          targetUserId: context.user.id,
          executor: () => logHabitEntry(context.user.id, habitId, entryInput),
        });
        return formatMcpToolSuccess(result.status === "EXECUTED" ? result.data : result);
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );
}
