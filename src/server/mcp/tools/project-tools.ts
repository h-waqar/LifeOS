/**
 * MCP Project Tools
 *
 * Exposes canonical project management operations to agents:
 * - lifeos_create_project (WRITE)
 * - lifeos_update_project (WRITE)
 *
 * Gated centrally by the Phase 13 Zero-Trust Agent Safety Boundary.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpContext } from "../types";
import { createProject, updateProject } from "@/server/projects/service";
import { verifySessionActive } from "../auth";
import { formatMcpToolSuccess, formatMcpToolError } from "../formatters";
import { executeAgentOperation } from "@/server/agents/safety-boundary";

export function registerProjectTools(server: McpServer, context: McpContext): void {
  // 1. lifeos_create_project
  server.registerTool(
    "lifeos_create_project",
    {
      description: "Create a new project with area, status, priority, dates, and optional parent goal association",
      inputSchema: z.object({
        name: z.string().trim().min(1, "Project name cannot be empty").max(255),
        description: z.string().trim().max(2000).nullish(),
        area: z.enum(["health", "career", "finance", "personal_development", "relationships", "general"]).optional(),
        status: z.enum(["planning", "active", "paused", "completed", "archived"]).optional(),
        priority: z.enum(["low", "medium", "high", "critical"]).optional(),
        startDate: z.string().datetime().nullish(),
        deadline: z.string().datetime().nullish(),
        goalId: z.string().trim().min(1).nullish(),
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
          toolName: "lifeos_create_project",
          arguments: args as Record<string, unknown>,
          challengeId: (args as any).challengeId,
          targetUserId: context.user.id,
          executor: () => createProject(context.user.id, args as any),
        });
        return formatMcpToolSuccess(result.status === "EXECUTED" ? result.data : result);
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );

  // 2. lifeos_update_project
  server.registerTool(
    "lifeos_update_project",
    {
      description: "Update an existing project's name, description, area, status, priority, or dates",
      inputSchema: z.object({
        id: z.string().min(1, "Project ID is required"),
        name: z.string().trim().min(1).max(255).optional(),
        description: z.string().trim().max(2000).nullish(),
        area: z.enum(["health", "career", "finance", "personal_development", "relationships", "general"]).optional(),
        status: z.enum(["planning", "active", "paused", "completed", "archived"]).optional(),
        priority: z.enum(["low", "medium", "high", "critical"]).optional(),
        startDate: z.string().datetime().nullish(),
        deadline: z.string().datetime().nullish(),
        goalId: z.string().trim().min(1).nullish(),
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
          toolName: "lifeos_update_project",
          arguments: args as Record<string, unknown>,
          challengeId: (args as any).challengeId,
          targetUserId: context.user.id,
          executor: () => updateProject(context.user.id, id, data as any),
        });
        return formatMcpToolSuccess(result.status === "EXECUTED" ? result.data : result);
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );
}
