import { z } from "zod";
import { type LifeOSTool } from "./types";
import { listGoals } from "@/server/goals/service";
import { listProjects } from "@/server/projects/service";

export const goalsListTool: LifeOSTool = {
  id: "goals_list",
  name: "goals_list",
  description: "List strategic goals with real-time calculated progress, horizons, and life areas.",
  category: "goals",
  riskTier: "tier1_readonly",
  schema: z.object({
    status: z
      .enum(["not_started", "in_progress", "completed", "cancelled", "paused"])
      .optional()
      .describe("Filter by goal status"),
    horizon: z
      .enum(["weekly", "monthly", "quarterly", "yearly", "lifetime"])
      .optional()
      .describe("Filter by goal horizon"),
    area: z
      .enum(["health", "wealth", "career", "relationships", "personal_growth", "other"])
      .optional()
      .describe("Filter by life area"),
  }),
  execute: async (ctx, args) => {
    return await listGoals(ctx.userId, {
      status: args.status,
      horizon: args.horizon,
      area: args.area,
    });
  },
};

export const projectsListTool: LifeOSTool = {
  id: "projects_list",
  name: "projects_list",
  description: "List active or archived projects with task completion metrics and linked goals.",
  category: "projects",
  riskTier: "tier1_readonly",
  schema: z.object({
    status: z
      .enum(["backlog", "planning", "in_progress", "paused", "completed", "cancelled"])
      .optional()
      .describe("Filter by project status"),
    area: z
      .enum(["health", "wealth", "career", "relationships", "personal_growth", "other"])
      .optional()
      .describe("Filter by life area"),
    goalId: z.string().uuid().optional().describe("Filter by parent goal UUID"),
  }),
  execute: async (ctx, args) => {
    return await listProjects(ctx.userId, {
      status: args.status,
      area: args.area,
      goalId: args.goalId,
    });
  },
};
