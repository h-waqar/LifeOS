/**
 * MCP Workspace Plan Resources
 *
 * Exposes live, observational plan execution state to external agents:
 * - lifeos://workspace/plans/{planId}
 *
 * Observational only: zero mutations permitted through resources.
 */

import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpContext } from "../types";
import { getPlanExecutionStatus } from "@/server/agents/workspace/plan-inspector";
import { verifySessionActive } from "../auth";
import { formatMcpResource } from "../formatters";

export function registerWorkspaceResources(server: McpServer, context: McpContext): void {
  server.resource(
    "workspace_plan_status",
    new ResourceTemplate("lifeos://workspace/plans/{planId}", { list: undefined }),
    async (uri, vars) => {
      verifySessionActive(context);
      const planId = typeof vars.planId === "string" ? vars.planId : String(vars.planId ?? "");
      const status = await getPlanExecutionStatus(context.user.id, planId);
      return formatMcpResource(uri.href, status);
    }
  );
}
