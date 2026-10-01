/**
 * MCP Note Tools
 *
 * Exposes canonical note creation to agents:
 * - lifeos_create_note
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpContext } from "../types";
import { createNote } from "@/server/notes/service";
import { verifySessionActive } from "../auth";
import { formatMcpToolSuccess, formatMcpToolError } from "../formatters";
import { executeAgentOperation } from "@/server/agents/safety-boundary";

export function registerNoteTools(server: McpServer, context: McpContext): void {
  // 1. lifeos_create_note
  server.registerTool(
    "lifeos_create_note",
    {
      description: "Create a new knowledge note with wikilinks, tags, area, and optional project/goal links",
      inputSchema: z.object({
        title: z.string().trim().min(1, "Note title cannot be empty").max(255),
        content: z.string().optional().default(""),
        noteType: z.enum(["quick", "meeting", "research", "idea", "journal", "documentation", "reference", "learning"]).optional().default("quick"),
        area: z.enum(["health", "career", "finance", "personal_development", "relationships", "general"]).optional().default("general"),
        tags: z.array(z.string().trim().min(1).max(50)).optional().default([]),
        isPinned: z.boolean().optional().default(false),
        projectId: z.string().trim().min(1).nullable().optional(),
        goalId: z.string().trim().min(1).nullable().optional(),
        taskId: z.string().trim().min(1).nullable().optional(),
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
          toolName: "lifeos_create_note",
          arguments: args as Record<string, unknown>,
          challengeId: (args as any).challengeId,
          targetUserId: context.user.id,
          executor: () => createNote(context.user.id, args as any),
        });
        return formatMcpToolSuccess(result.status === "EXECUTED" ? result.data : result);
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );
}
