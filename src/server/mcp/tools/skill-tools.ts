/**
 * MCP Procedural Skill Tools
 *
 * Exposes canonical skills discovery and instruction retrieval to agents:
 * - lifeos_list_skills
 * - lifeos_get_skill
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpContext } from "../types";
import { skillsRegistry } from "@/server/skills/registry";
import { verifySessionActive } from "../auth";
import { formatMcpToolSuccess, formatMcpToolError } from "../formatters";
import { executeAgentOperation } from "@/server/agents/safety-boundary";

export function registerSkillTools(server: McpServer, context: McpContext): void {
  // 1. lifeos_list_skills
  server.registerTool(
    "lifeos_list_skills",
    {
      description: "Query available procedural skills, descriptions, and trigger conditions",
      inputSchema: z
        .object({
          tag: z.string().optional(),
          query: z.string().optional(),
        })
        .passthrough(),
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
          toolName: "lifeos_list_skills",
          arguments: args as Record<string, unknown>,
          targetUserId: context.user.id,
          executor: () =>
            skillsRegistry.listSkills({
              tag: args?.tag,
              query: args?.query,
            }),
        });
        const skills = result.status === "EXECUTED" ? result.data : [];
        return formatMcpToolSuccess({ count: skills.length, skills });
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );

  // 2. lifeos_get_skill
  server.registerTool(
    "lifeos_get_skill",
    {
      description:
        "Retrieve complete procedural skill guidance, allowed operations, and verification criteria by name",
      inputSchema: z
        .object({
          name: z.string().trim().min(1, "Skill name is required"),
        })
        .passthrough(),
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
          toolName: "lifeos_get_skill",
          arguments: args as Record<string, unknown>,
          targetUserId: context.user.id,
          executor: () => skillsRegistry.getSkill(args.name),
        });
        return formatMcpToolSuccess(result.status === "EXECUTED" ? result.data : result);
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );
}
