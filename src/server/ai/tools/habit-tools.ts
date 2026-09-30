import { z } from "zod";
import { type LifeOSTool } from "./types";
import {
  listHabits,
  logHabitEntry,
} from "@/server/habits/service";

export const habitsListTool: LifeOSTool = {
  id: "habits_list",
  name: "habits_list",
  description: "List tracked habits with current streaks, frequency targets, and completion rates.",
  category: "habits",
  riskTier: "tier1_readonly",
  schema: z.object({
    status: z
      .enum(["active", "paused", "archived"])
      .optional()
      .describe("Filter by habit status"),
    timeOfDay: z
      .enum(["morning", "afternoon", "evening", "anytime"])
      .optional()
      .describe("Filter by time of day"),
    goalId: z.string().uuid().optional().describe("Filter by linked goal UUID"),
  }),
  execute: async (ctx, args) => {
    return await listHabits(ctx.userId, {
      status: args.status,
      timeOfDay: args.timeOfDay,
      goalId: args.goalId,
    });
  },
};

export const habitsLogTool: LifeOSTool = {
  id: "habits_log",
  name: "habits_log",
  description: "Log a habit check-in or progress value for a specific date (defaults to today).",
  category: "habits",
  riskTier: "tier3_consequential",
  schema: z.object({
    habitId: z.string().uuid("habitId must be a valid UUID"),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be in YYYY-MM-DD format")
      .optional()
      .describe("Date to record check-in for (defaults to today)"),
    value: z
      .number()
      .positive("value must be greater than zero")
      .optional()
      .describe("Numeric completion value (defaults to target value)"),
    notes: z.string().trim().max(1000).optional(),
  }),
  previewAction: (args) => {
    const targetDate = args.date ?? new Date().toISOString().slice(0, 10);
    return {
      summary: `Log habit check-in for habit ${args.habitId} on ${targetDate}${args.value ? ` (value: ${args.value})` : ""}`,
      affectedEntities: [{ domain: "habits", id: args.habitId, name: "Habit Check-in" }],
      diff: {
        date: { after: targetDate },
        value: { after: args.value ?? 1 },
      },
    };
  },
  execute: async (ctx, args) => {
    const logDate = args.date ?? new Date().toISOString().slice(0, 10);
    return await logHabitEntry(ctx.userId, args.habitId, {
      date: logDate,
      value: args.value,
      notes: args.notes,
    });
  },
};
