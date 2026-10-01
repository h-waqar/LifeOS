/**
 * MCP Planning Graph Resources
 *
 * Exposes readable planning state and architectural decision logs:
 * - lifeos://docs/planning/state
 * - lifeos://docs/planning/decisions
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpContext } from "../types";
import { planningInspector } from "@/server/docs/planning-inspector";
import { verifySessionActive } from "../auth";
import { formatMcpResource } from "../formatters";

export function registerPlanningResources(server: McpServer, context: McpContext): void {
  // 1. Current planning state
  server.registerResource(
    "planning_state",
    "lifeos://docs/planning/state",
    {
      description: "Current planning graph state, active milestone, and phase progress",
      mimeType: "application/json",
    },
    async (uri) => {
      verifySessionActive(context);
      const state = await planningInspector.getCurrentPlanningState();
      return formatMcpResource(uri.href, state);
    }
  );

  // 2. Architectural decisions log
  server.registerResource(
    "planning_decisions",
    "lifeos://docs/planning/decisions",
    {
      description: "Key architectural decisions log parsed from PROJECT.md",
      mimeType: "application/json",
    },
    async (uri) => {
      verifySessionActive(context);
      const decisions = await planningInspector.getMilestoneDecisions();
      return formatMcpResource(uri.href, { count: decisions.length, decisions });
    }
  );
}
