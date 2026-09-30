import { tool, type CoreTool } from "ai";
import { type LifeOSTool, type ToolContext } from "./types";
import {
  tasksSearchTool,
  tasksCreateTool,
  tasksCompleteTool,
} from "./task-tools";
import {
  calendarListTool,
  calendarScheduleTool,
} from "./calendar-tools";
import {
  goalsListTool,
  projectsListTool,
} from "./goal-project-tools";
import {
  habitsListTool,
  habitsLogTool,
} from "./habit-tools";
import {
  notesSearchTool,
  notesCreateTool,
} from "./note-tools";
import {
  peopleSearchTool,
  peopleLogInteractionTool,
} from "./people-tools";
import {
  financeGetSummaryTool,
  financeCreateTransactionTool,
} from "./finance-tools";
import {
  contentListTool,
  contentCreateIdeaTool,
} from "./content-tools";

import { interceptToolCall } from "../hitl/gate-service";

export const ALL_TOOLS: LifeOSTool[] = [
  // Tasks (3)
  tasksSearchTool,
  tasksCreateTool,
  tasksCompleteTool,
  // Calendar (2)
  calendarListTool,
  calendarScheduleTool,
  // Goals & Projects (2)
  goalsListTool,
  projectsListTool,
  // Habits (2)
  habitsListTool,
  habitsLogTool,
  // Notes (2)
  notesSearchTool,
  notesCreateTool,
  // People (2)
  peopleSearchTool,
  peopleLogInteractionTool,
  // Finance (2)
  financeGetSummaryTool,
  financeCreateTransactionTool,
  // Content (2)
  contentListTool,
  contentCreateIdeaTool,
];

const TOOLS_BY_ID = new Map<string, LifeOSTool>(
  ALL_TOOLS.map((t) => [t.id, t])
);

export function getToolById(id: string): LifeOSTool | undefined {
  return TOOLS_BY_ID.get(id);
}

export function getToolsByCategory(category: string): LifeOSTool[] {
  return ALL_TOOLS.filter((t) => t.category === category);
}

export function getAllTools(): LifeOSTool[] {
  return ALL_TOOLS;
}

/**
 * Converts LifeOS tools to the Vercel AI SDK CoreTool format.
 * Automatically injects the authenticated ToolContext into execute closures.
 */
export function toAiSdkTools(
  ctx: ToolContext,
  toolIds?: string[]
): Record<string, CoreTool> {
  const selectedTools = toolIds
    ? toolIds.map((id) => TOOLS_BY_ID.get(id)).filter((t): t is LifeOSTool => !!t)
    : ALL_TOOLS;

  const result: Record<string, CoreTool> = {};

  for (const t of selectedTools) {
    result[t.id] = tool({
      description: t.description,
      parameters: t.schema,
      execute: async (args) => {
        const intercept = await interceptToolCall(ctx, t, args);
        if (intercept.isPending) {
          return {
            status: "pending_confirmation",
            actionId: intercept.actionId,
            preview: intercept.preview,
            message: intercept.message,
          };
        }
        return intercept.result;
      },
    });
  }

  return result;
}

/**
 * Generates a concise markdown summary of registered tools for system prompt injection.
 */
export function getToolsSummary(): string {
  const categories = new Map<string, LifeOSTool[]>();
  for (const t of ALL_TOOLS) {
    const list = categories.get(t.category) ?? [];
    list.push(t);
    categories.set(t.category, list);
  }

  const lines: string[] = ["### Available Operational Tools:"];
  for (const [cat, tools] of categories) {
    const toolNames = tools.map((t) => `\`${t.id}\` (${t.riskTier})`).join(", ");
    lines.push(`- **${cat.toUpperCase()}**: ${toolNames}`);
  }
  return lines.join("\n");
}
