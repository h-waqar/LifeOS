import { z } from "zod";
import { type LifeOSTool } from "./types";
import {
  createTimeBlock,
  listTimeBlocks,
} from "@/server/calendar/service";

export const calendarListTool: LifeOSTool = {
  id: "calendar_list",
  name: "calendar_list",
  description: "List scheduled time blocks and calendar events within an optional date range.",
  category: "calendar",
  riskTier: "tier1_readonly",
  schema: z.object({
    startDate: z
      .string()
      .optional()
      .describe("Start of range (ISO date or datetime string, e.g. 2026-09-23)"),
    endDate: z
      .string()
      .optional()
      .describe("End of range (ISO date or datetime string, e.g. 2026-09-30)"),
    status: z
      .enum(["scheduled", "in_progress", "completed", "cancelled"])
      .optional()
      .describe("Filter by block status"),
  }),
  execute: async (ctx, args) => {
    return await listTimeBlocks(ctx.userId, {
      startDate: args.startDate,
      endDate: args.endDate,
      status: args.status,
    });
  },
};

export const calendarScheduleTool: LifeOSTool = {
  id: "calendar_schedule",
  name: "calendar_schedule",
  description: "Schedule a time block on the user calendar with start and end times.",
  category: "calendar",
  riskTier: "tier3_consequential",
  schema: z.object({
    title: z.string().trim().min(1, "Title is required").max(255),
    startTime: z
      .string()
      .datetime({ message: "startTime must be an ISO 8601 datetime string" }),
    endTime: z
      .string()
      .datetime({ message: "endTime must be an ISO 8601 datetime string" }),
    taskId: z.string().uuid().optional().describe("Optional linked task UUID"),
    projectId: z.string().uuid().optional().describe("Optional linked project UUID"),
    goalId: z.string().uuid().optional().describe("Optional linked goal UUID"),
    commitmentLevel: z
      .enum(["soft", "hard"])
      .optional()
      .default("soft"),
    description: z.string().trim().max(4000).optional(),
  }),
  previewAction: (args) => ({
    summary: `Schedule "${args.title}" [${args.commitmentLevel ?? "soft"}] from ${args.startTime} to ${args.endTime}`,
    affectedEntities: [{ domain: "calendar", name: args.title }],
    diff: {
      startTime: { after: args.startTime },
      endTime: { after: args.endTime },
    },
  }),
  execute: async (ctx, args) => {
    return await createTimeBlock(ctx.userId, {
      title: args.title,
      startTime: args.startTime,
      endTime: args.endTime,
      taskId: args.taskId,
      projectId: args.projectId,
      goalId: args.goalId,
      commitmentLevel: args.commitmentLevel,
      description: args.description,
    });
  },
};
