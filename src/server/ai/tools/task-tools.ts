import { z } from "zod";
import { type LifeOSTool } from "./types";
import {
  createTask,
  listTasks,
  updateTask,
} from "@/server/tasks/service";

export const tasksSearchTool: LifeOSTool = {
  id: "tasks_search",
  name: "tasks_search",
  description: "Search and filter tasks by status, priority, project, or keyword.",
  category: "tasks",
  riskTier: "tier1_readonly",
  schema: z.object({
    query: z.string().optional().describe("Keyword to match against task title or description"),
    status: z
      .enum(["inbox", "todo", "in_progress", "blocked", "completed", "cancelled"])
      .optional()
      .describe("Filter by task status"),
    priority: z
      .enum(["low", "medium", "high", "critical"])
      .optional()
      .describe("Filter by priority"),
    projectId: z.string().uuid().optional().describe("Filter tasks by project UUID"),
    limit: z.number().int().min(1).max(100).optional().default(20),
  }),
  execute: async (ctx, args) => {
    const tasks = await listTasks(ctx.userId, {
      status: args.status,
      priority: args.priority,
      projectId: args.projectId,
    });

    let filtered = tasks;
    if (args.query && args.query.trim()) {
      const q = args.query.toLowerCase().trim();
      filtered = tasks.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description && t.description.toLowerCase().includes(q))
      );
    }

    return filtered.slice(0, args.limit);
  },
};

export const tasksCreateTool: LifeOSTool = {
  id: "tasks_create",
  name: "tasks_create",
  description: "Create a new task with title, optional status, priority, scheduled date, energy level, or linked project/goal.",
  category: "tasks",
  riskTier: "tier3_consequential",
  schema: z.object({
    title: z.string().trim().min(1, "Title is required").max(255),
    description: z.string().trim().max(4000).optional(),
    status: z
      .enum(["inbox", "todo", "in_progress", "blocked", "completed", "cancelled"])
      .optional()
      .default("inbox"),
    priority: z
      .enum(["low", "medium", "high", "critical"])
      .optional()
      .default("medium"),
    scheduledDate: z
      .string()
      .datetime({ message: "scheduledDate must be an ISO datetime string" })
      .optional(),
    energyLevel: z.enum(["low", "medium", "high"]).optional(),
    projectId: z.string().uuid().optional(),
    goalId: z.string().uuid().optional(),
    tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  }),
  previewAction: (args) => ({
    summary: `Create task "${args.title}"${args.priority ? ` [Priority: ${args.priority}]` : ""}`,
    affectedEntities: [{ domain: "tasks", name: args.title }],
    diff: {
      status: { after: args.status ?? "inbox" },
      priority: { after: args.priority ?? "medium" },
    },
  }),
  execute: async (ctx, args) => {
    return await createTask(ctx.userId, {
      title: args.title,
      description: args.description,
      status: args.status,
      priority: args.priority,
      scheduledDate: args.scheduledDate,
      energyLevel: args.energyLevel,
      projectId: args.projectId,
      goalId: args.goalId,
      tags: args.tags,
    });
  },
};

export const tasksCompleteTool: LifeOSTool = {
  id: "tasks_complete",
  name: "tasks_complete",
  description: "Mark an existing task as completed by task UUID.",
  category: "tasks",
  riskTier: "tier3_consequential",
  schema: z.object({
    taskId: z.string().uuid("taskId must be a valid UUID"),
  }),
  previewAction: (args) => ({
    summary: `Mark task ${args.taskId} as completed`,
    affectedEntities: [{ domain: "tasks", id: args.taskId, name: "Task Completion" }],
    diff: {
      status: { before: "open", after: "completed" },
    },
  }),
  execute: async (ctx, args) => {
    return await updateTask(ctx.userId, args.taskId, {
      status: "completed",
    });
  },
};
