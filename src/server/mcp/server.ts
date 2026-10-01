/**
 * LifeOS MCP Server Factory & Capability Negotiation
 *
 * Instantiates the McpServer instance with registered capabilities:
 * resources, tools, prompts, and logging.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpContext, LifeOSMcpServerOptions } from "./types";
import { registerResources } from "./resources/registry";
import { registerPrompts } from "./prompts/registry";
import { registerTools } from "./tools/registry";

export function createLifeOSMcpServer(
  context: McpContext,
  options?: LifeOSMcpServerOptions
): McpServer {
  const server = new McpServer(
    {
      name: options?.name ?? "lifeos",
      version: options?.version ?? "0.1.0",
    },
    {
      capabilities: {
        resources: {
          listChanged: true,
        },
        tools: {
          listChanged: true,
        },
        prompts: {
          listChanged: true,
        },
        logging: {},
      },
    }
  );

  registerResources(server, context);
  registerPrompts(server, context);
  registerTools(server, context);

  return server;
}
