/**
 * MCP Tools Registry Coordinator
 *
 * Registers all canonical domain tools and asserts the financial shield boundary
 * (zero financial mutation tools permitted).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpContext } from "../types";
import { registerTaskTools } from "./task-tools";
import { registerProjectTools } from "./project-tools";
import { registerGoalTools } from "./goal-tools";
import { registerNoteTools } from "./note-tools";
import { registerSearchTools } from "./search-tools";
import { registerHabitTools } from "./habit-tools";
import { registerSkillTools } from "./skill-tools";
import { registerDocTools } from "./doc-tools";

export function registerTools(server: McpServer, context: McpContext): void {
  // 1. Task tools (3)
  registerTaskTools(server, context);

  // 2. Project tools (2)
  registerProjectTools(server, context);

  // 3. Goal tools (2)
  registerGoalTools(server, context);

  // 4. Note tools (1)
  registerNoteTools(server, context);

  // 5. Search tools (1)
  registerSearchTools(server, context);

  // 6. Habit tools (1)
  registerHabitTools(server, context);

  // 7. Skill tools (2)
  registerSkillTools(server, context);

  // 8. Documentation & Planning tools (3)
  registerDocTools(server, context);

  // Assert Financial Shield Boundary
  const registeredTools = (server as unknown as { _registeredTools?: Record<string, unknown> })._registeredTools;
  if (registeredTools) {
    const prohibitedWords = ["transaction", "transfer", "account", "balance", "money", "wallet"];
    for (const toolName of Object.keys(registeredTools)) {
      const lower = toolName.toLowerCase();
      for (const word of prohibitedWords) {
        if (lower.includes(word)) {
          throw new Error(
            `Financial shield violation: Prohibited financial mutation tool '${toolName}' detected in MCP registry.`
          );
        }
      }
    }
  }
}
