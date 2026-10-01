/**
 * MCP Documentation & Planning Tools
 *
 * Exposes canonical documentation search, document retrieval, and planning inspection:
 * - lifeos_search_docs
 * - lifeos_get_doc
 * - lifeos_get_planning_state
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpContext } from "../types";
import { docSearchService } from "@/server/docs/search-service";
import { planningInspector } from "@/server/docs/planning-inspector";
import { verifySessionActive } from "../auth";
import { formatMcpToolSuccess, formatMcpToolError } from "../formatters";
import { executeAgentOperation } from "@/server/agents/safety-boundary";

export function registerDocTools(server: McpServer, context: McpContext): void {
  // 1. lifeos_search_docs
  server.registerTool(
    "lifeos_search_docs",
    {
      description: "Search repository documentation, ADRs, specifications, and phase plans with ranking",
      inputSchema: z
        .object({
          q: z.string().trim().min(1, "Search query is required"),
          source: z.enum(["docs", "planning", "skills", "all"]).optional(),
          limit: z.number().int().min(1).max(20).optional(),
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
          toolName: "lifeos_search_docs",
          arguments: args as Record<string, unknown>,
          targetUserId: context.user.id,
          executor: () =>
            docSearchService.searchDocs({
              q: args.q,
              source: args.source,
              limit: args.limit,
            }),
        });
        const docs = result.status === "EXECUTED" ? result.data : [];
        return formatMcpToolSuccess({ count: docs.length, results: docs });
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );

  // 2. lifeos_get_doc
  server.registerTool(
    "lifeos_get_doc",
    {
      description: "Retrieve sanitized document text by path or ID with optional section filter",
      inputSchema: z
        .object({
          path: z.string().trim().min(1, "Document path is required"),
          section: z.string().trim().optional(),
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
          toolName: "lifeos_get_doc",
          arguments: args as Record<string, unknown>,
          targetUserId: context.user.id,
          executor: () => docSearchService.getDocContent(args.path, args.section),
        });
        return formatMcpToolSuccess(result.status === "EXECUTED" ? result.data : result);
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );

  // 3. lifeos_get_planning_state
  server.registerTool(
    "lifeos_get_planning_state",
    {
      description: "Query current milestone, phase status, key architectural decisions, and pending roadmap tasks",
      inputSchema: z
        .object({
          view: z.enum(["state", "decisions", "summary", "roadmap"]).optional(),
          phase: z.string().optional(),
        })
        .passthrough(),
    },
    async (args) => {
      try {
        verifySessionActive(context);
        const view = args.view ?? "state";

        const result = await executeAgentOperation({
          context: {
            isAgent: Boolean(context.isAgent || context.agent),
            agent: context.agent,
            user: context.user,
            sessionId: context.session?.id,
          },
          toolName: "lifeos_get_planning_state",
          arguments: args as Record<string, unknown>,
          targetUserId: context.user.id,
          executor: async () => {
            if (view === "decisions") {
              const decisions = await planningInspector.getMilestoneDecisions();
              return { count: decisions.length, decisions };
            }

            if (view === "summary") {
              if (!args.phase) {
                throw new Error("Phase identifier is required when querying phase summary.");
              }
              return await planningInspector.getPhaseSummary(args.phase);
            }

            if (view === "roadmap") {
              return await planningInspector.getPendingRoadmap();
            }

            // Default: view === "state"
            return await planningInspector.getCurrentPlanningState();
          },
        });

        return formatMcpToolSuccess(result.status === "EXECUTED" ? result.data : result);
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );
}
