/**
 * MCP Task Tools
 *
 * Exposes canonical task management operations to agents:
 * - lifeos_create_task (WRITE)
 * - lifeos_update_task (WRITE)
 * - lifeos_delete_task (DESTRUCTIVE, gated by HITL challenge)
 *
 * Gated centrally by the Phase 13 Zero-Trust Agent Safety Boundary.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpContext } from "../types";
import { createTask, updateTask, deleteTask, listTasks, getTask, NotFoundError } from "@/server/tasks/service";
import { verifySessionActive } from "../auth";
import { formatMcpToolSuccess, formatMcpToolError } from "../formatters";
import { executeAgentOperation } from "@/server/agents/safety-boundary";

export function registerTaskTools(server: McpServer, context: McpContext): void {
  // 1. lifeos_list_tasks (READ)
  server.registerTool(
    "lifeos_list_tasks",
    {
      description: "List tasks strictly scoped to the authenticated user with multi-criteria filtering (projectId, status, priority, energyLevel, overdue)",
      inputSchema: z.object({
        projectId: z.string().trim().min(1).optional(),
        status: z.enum(["inbox", "todo", "in_progress", "blocked", "completed", "cancelled"]).optional(),
        priority: z.enum(["low", "medium", "high", "critical"]).optional(),
        energyLevel: z.enum(["low", "medium", "high"]).optional(),
        overdue: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).optional(),
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
          toolName: "lifeos_list_tasks",
          arguments: args as Record<string, unknown>,
          targetUserId: context.user.id,
          executor: async () => {
            const taskList = await listTasks(context.user.id, {
              projectId: args.projectId,
              status: args.status,
              priority: args.priority,
              energyLevel: args.energyLevel,
              overdue: args.overdue,
            });
            if (args.limit && args.limit > 0) {
              return taskList.slice(0, args.limit);
            }
            return taskList;
          },
        });
        return formatMcpToolSuccess(result.status === "EXECUTED" ? result.data : result);
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );

  // 2. lifeos_get_task (READ)
  server.registerTool(
    "lifeos_get_task",
    {
      description: "Get canonical task representation by ID strictly scoped to the authenticated user",
      inputSchema: z.object({
        id: z.string().trim().min(1, "Task ID is required"),
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
          toolName: "lifeos_get_task",
          arguments: args as Record<string, unknown>,
          targetUserId: context.user.id,
          executor: async () => {
            const task = await getTask(context.user.id, args.id);
            if (!task) {
              throw new NotFoundError(`Task not found: '${args.id}'`);
            }
            return task;
          },
        });
        return formatMcpToolSuccess(result.status === "EXECUTED" ? result.data : result);
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );

  // 3. lifeos_create_task (WRITE)
  server.registerTool(
    "lifeos_create_task",
    {
      description: "Create a new task with priority, scheduling, project/goal association, and duration",
      inputSchema: z.object({
        title: z.string().trim().min(1, "Task title cannot be empty").max(255),
        description: z.string().trim().max(4000).nullish(),
        status: z.enum(["inbox", "todo", "in_progress", "blocked", "completed", "cancelled"]).optional(),
        priority: z.enum(["low", "medium", "high", "critical"]).optional(),
        scheduledDate: z.string().datetime({ message: "scheduledDate must be a valid ISO 8601 string" }).nullish(),
        energyLevel: z.enum(["low", "medium", "high"]).nullish(),
        tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
        projectId: z.string().trim().min(1).nullish(),
        milestoneId: z.string().trim().min(1).nullish(),
        dueDate: z.string().datetime({ message: "dueDate must be a valid ISO 8601 string" }).nullish(),
        estimatedDuration: z.number().int().min(0).max(10080).nullish(),
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
          toolName: "lifeos_create_task",
          arguments: args as Record<string, unknown>,
          challengeId: (args as any).challengeId,
          targetUserId: context.user.id,
          executor: () => createTask(context.user.id, args as any),
        });
        return formatMcpToolSuccess(result.status === "EXECUTED" ? result.data : result);
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );

  // 2. lifeos_update_task
  server.registerTool(
    "lifeos_update_task",
    {
      description: "Update an existing task's properties, status, priority, or scheduling",
      inputSchema: z.object({
        id: z.string().min(1, "Task ID is required"),
        title: z.string().trim().min(1).max(255).optional(),
        description: z.string().trim().max(4000).nullish(),
        status: z.enum(["inbox", "todo", "in_progress", "blocked", "completed", "cancelled"]).optional(),
        priority: z.enum(["low", "medium", "high", "critical"]).optional(),
        scheduledDate: z.string().datetime().nullish(),
        energyLevel: z.enum(["low", "medium", "high"]).nullish(),
        tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
        projectId: z.string().trim().min(1).nullish(),
        milestoneId: z.string().trim().min(1).nullish(),
        dueDate: z.string().datetime().nullish(),
        estimatedDuration: z.number().int().min(0).max(10080).nullish(),
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
          toolName: "lifeos_update_task",
          arguments: args as Record<string, unknown>,
          challengeId: (args as any).challengeId,
          targetUserId: context.user.id,
          executor: () => updateTask(context.user.id, id, data as any),
        });
        return formatMcpToolSuccess(result.status === "EXECUTED" ? result.data : result);
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );

  // 3. lifeos_delete_task (DESTRUCTIVE - Mandatory HITL Challenge Gate)
  server.registerTool(
    "lifeos_delete_task",
    {
      description: "Delete a task by ID. Enforces authenticated user ownership and mandatory human-in-the-loop (HITL) approval challenge.",
      inputSchema: z.object({
        id: z.string().min(1, "Task ID is required"),
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
          toolName: "lifeos_delete_task",
          arguments: args as Record<string, unknown>,
          challengeId: (args as any).challengeId,
          targetUserId: context.user.id,
          executor: () => deleteTask(context.user.id, args.id),
        });
        return formatMcpToolSuccess(result.status === "EXECUTED" ? result.data : result);
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );
}
