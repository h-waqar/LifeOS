/**
 * MCP Prompt Registry Coordinator
 *
 * Registers standard agent prompt templates on the McpServer instance.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpContext } from "../types";
import {
  handleMorningPlanningPrompt,
  handleEveningReviewPrompt,
  handleTaskBreakdownPrompt,
} from "./planning";

export function registerPrompts(server: McpServer, context: McpContext): void {
  // 1. Morning Planning Prompt
  server.registerPrompt(
    "lifeos_morning_planning",
    {
      description: "Guides agent in conducting an interactive morning planning session grounded in schedule, tasks, and habits",
      argsSchema: {
        date: z.string().optional().describe("Date for morning planning in YYYY-MM-DD format (defaults to today)"),
      },
    },
    async (args) => handleMorningPlanningPrompt(context, args)
  );

  // 2. Evening Review Prompt
  server.registerPrompt(
    "lifeos_evening_review",
    {
      description: "Guides agent in conducting a structured evening reflection, celebrating wins, and planning task rollover",
      argsSchema: {
        date: z.string().optional().describe("Date for evening review in YYYY-MM-DD format (defaults to today)"),
      },
    },
    async (args) => handleEveningReviewPrompt(context, args)
  );

  // 3. Task Breakdown Prompt
  server.registerPrompt(
    "lifeos_task_breakdown",
    {
      description: "Guides agent in decomposing a complex goal, project, or task into 3-7 sequenced, atomic subtasks",
      argsSchema: {
        title: z.string().min(1).describe("The title or description of the goal, project, or task to decompose"),
        goalId: z.string().optional().describe("Optional associated Goal ID"),
        projectId: z.string().optional().describe("Optional associated Project ID"),
      },
    },
    async (args) =>
      handleTaskBreakdownPrompt(context, {
        title: args.title,
        goalId: args.goalId,
        projectId: args.projectId,
      })
  );
}
