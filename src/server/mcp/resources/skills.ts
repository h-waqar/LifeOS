/**
 * MCP Procedural Skills Resources
 *
 * Exposes readable skill catalogs and individual skill instructions:
 * - lifeos://skills/list
 * - lifeos://skills/{name}
 */

import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpContext } from "../types";
import { skillsRegistry } from "@/server/skills/registry";
import { verifySessionActive } from "../auth";
import { formatMcpResource } from "../formatters";

export function registerSkillResources(server: McpServer, context: McpContext): void {
  // 1. Catalog of all available skills
  server.registerResource(
    "skills_list",
    "lifeos://skills/list",
    {
      description: "Structured JSON catalog of all registered procedural skills and metadata",
      mimeType: "application/json",
    },
    async (uri) => {
      verifySessionActive(context);
      const skills = await skillsRegistry.listSkills();
      return formatMcpResource(uri.href, { count: skills.length, skills });
    }
  );

  // 2. Individual skill guidance by name (ResourceTemplate)
  server.resource(
    "skill_by_name",
    new ResourceTemplate("lifeos://skills/{name}", { list: undefined }),
    async (uri, vars) => {
      verifySessionActive(context);
      const name = typeof vars.name === "string" ? vars.name : String(vars.name ?? "");
      const skill = await skillsRegistry.getSkill(name);
      return formatMcpResource(uri.href, skill);
    }
  );
}
