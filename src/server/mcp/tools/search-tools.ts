/**
 * MCP Search Tools
 *
 * Exposes canonical hybrid search to agents:
 * - lifeos_search
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpContext } from "../types";
import { search } from "@/server/search/service";
import { verifySessionActive } from "../auth";
import { formatMcpToolSuccess, formatMcpToolError } from "../formatters";
import { executeAgentOperation } from "@/server/agents/safety-boundary";

export function registerSearchTools(server: McpServer, context: McpContext): void {
  // 1. lifeos_search
  server.registerTool(
    "lifeos_search",
    {
      description: "Search across all personal entities (notes, tasks, projects, goals, people, learning, content)",
      inputSchema: z.object({
        q: z.string().trim().min(1, "Search query must not be empty").max(200),
        type: z.enum(["note", "task", "project", "goal", "person", "learning", "content", "all"]).optional(),
        limit: z.number().int().min(1).max(100).optional(),
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
          toolName: "lifeos_search",
          arguments: args as Record<string, unknown>,
          targetUserId: context.user.id,
          executor: () => search(context.user.id, args as any),
        });
        return formatMcpToolSuccess(result.status === "EXECUTED" ? result.data : result);
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );
}
