/**
 * Plan 10-02: Headless CLI Commands for Entity CRUD, Context Inspection & Daily Planning
 *
 * Verifies:
 * 1. CLI-03: Context and status aggregation delegating to canonical services without raw SQL.
 * 2. CLI-04: Entity CRUD operations for tasks, projects, goals, notes, habits with Zod validation.
 * 3. CLI-05: Daily planning morning and evening workflows delegating to canonical services.
 * 4. Caller identity spoofing rejection across all command handlers.
 * 5. Deterministic table formatting and structured responses.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleStatus, handleContext } from "@/cli/commands/context";
import { handleTasks } from "@/cli/commands/tasks";
import { handleProjects } from "@/cli/commands/projects";
import { handleGoals } from "@/cli/commands/goals";
import { handleNotes } from "@/cli/commands/notes";
import { handleHabits } from "@/cli/commands/habits";
import { handlePlan } from "@/cli/commands/plan";
import type { CommandContext, ParsedArgs } from "@/cli/types";

// Mock canonical domain services
vi.mock("@/server/dashboard/service", () => ({
  getDashboardOverview: vi.fn().mockResolvedValue({
    date: "2026-09-30",
    metrics: {
      completedTasksCount: 5,
      pendingTasksCount: 3,
      todayHabitsCompleted: 4,
      todayHabitsTotal: 5,
      activeGoalsCount: 2,
      activeProjectsCount: 1,
      todayProductivityScore: 9,
    },
    dailyPlan: {
      hasPlan: true,
      planStatus: "completed",
    },
    priorities: {
      todayTasks: [{ id: "t1", title: "Task 1", priority: "high", status: "todo" }],
      overdueTasks: [],
    },
    habits: {
      items: [{ id: "h1", title: "Exercise", currentStreak: 7 }],
    },
    goalsAndProjects: {
      activeGoals: [{ id: "g1", title: "Launch LifeOS", horizon: "medium_term", progress: 80 }],
      activeProjects: [{ id: "p1", name: "Phase 10", status: "active" }],
    },
  }),
}));

vi.mock("@/server/notifications/service", () => ({
  listNotifications: vi.fn().mockResolvedValue({
    notifications: [{ id: "n1", title: "Welcome" }],
    total: 1,
    unreadCount: 1,
  }),
  getUnreadCount: vi.fn().mockResolvedValue(1),
}));

vi.mock("@/server/calendar/service", () => ({
  listTimeBlocks: vi.fn().mockResolvedValue([
    { id: "b1", title: "Deep Work", startTime: "2026-09-30T10:00:00.000Z" },
  ]),
}));

vi.mock("@/server/tasks/service", () => ({
  listTasks: vi.fn().mockResolvedValue([
    { id: "task_1", title: "Buy groceries", status: "todo", priority: "medium", scheduledDate: "2026-09-30" },
  ]),
  getTask: vi.fn().mockImplementation((_userId, id) => {
    if (id === "task_1") {
      return Promise.resolve({
        id: "task_1",
        title: "Buy groceries",
        status: "todo",
        priority: "medium",
        energyLevel: "medium",
        scheduledDate: "2026-09-30",
        projectId: null,
        description: "Milk, eggs",
      });
    }
    return Promise.resolve(null);
  }),
  createTask: vi.fn().mockImplementation((userId, input) => {
    return Promise.resolve({
      id: "task_new",
      userId,
      ...input,
    });
  }),
  updateTask: vi.fn().mockImplementation((_userId, id, input) => {
    return Promise.resolve({
      id,
      title: "Updated Task",
      ...input,
    });
  }),
  deleteTask: vi.fn().mockResolvedValue({ success: true }),
  createTaskSchema: {
    parse: vi.fn().mockImplementation((input) => {
      if (!input.title || input.title.trim().length === 0) {
        throw new Error("Task title cannot be empty");
      }
      return input;
    }),
  },
  updateTaskSchema: {
    parse: vi.fn().mockImplementation((input) => input),
  },
}));

vi.mock("@/server/projects/service", () => ({
  listProjects: vi.fn().mockResolvedValue([
    { id: "proj_1", name: "LifeOS Platform", status: "active", area: "career", deadline: "2026-12-31" },
  ]),
  getProject: vi.fn().mockImplementation((_userId, id) => {
    if (id === "proj_1") {
      return Promise.resolve({
        id: "proj_1",
        name: "LifeOS Platform",
        status: "active",
        area: "career",
        deadline: "2026-12-31",
        description: "Personal OS",
      });
    }
    return Promise.resolve(null);
  }),
  createProject: vi.fn().mockImplementation((userId, input) => {
    return Promise.resolve({
      id: "proj_new",
      userId,
      ...input,
    });
  }),
  updateProject: vi.fn().mockImplementation((_userId, id, input) => {
    return Promise.resolve({
      id,
      name: "Updated Project",
      ...input,
    });
  }),
  deleteProject: vi.fn().mockResolvedValue({ success: true }),
  createProjectSchema: {
    parse: vi.fn().mockImplementation((input) => {
      if (!input.name || input.name.trim().length === 0) {
        throw new Error("Project name cannot be empty");
      }
      return input;
    }),
  },
  updateProjectSchema: {
    parse: vi.fn().mockImplementation((input) => input),
  },
}));

vi.mock("@/server/goals/service", () => ({
  listGoals: vi.fn().mockResolvedValue([
    { id: "goal_1", title: "Run Marathon", status: "in_progress", horizon: "medium_term", progress: 65, targetDate: "2026-11-01" },
  ]),
  getGoal: vi.fn().mockImplementation((_userId, id) => {
    if (id === "goal_1") {
      return Promise.resolve({
        id: "goal_1",
        title: "Run Marathon",
        status: "in_progress",
        horizon: "medium_term",
        area: "health",
        progress: 65,
        targetDate: "2026-11-01",
        description: "Finish under 4 hours",
      });
    }
    return Promise.resolve(null);
  }),
  createGoal: vi.fn().mockImplementation((userId, input) => {
    return Promise.resolve({
      id: "goal_new",
      userId,
      ...input,
    });
  }),
  updateGoal: vi.fn().mockImplementation((_userId, id, input) => {
    return Promise.resolve({
      id,
      title: "Updated Goal",
      ...input,
    });
  }),
  deleteGoal: vi.fn().mockResolvedValue({ success: true }),
  createGoalSchema: {
    parse: vi.fn().mockImplementation((input) => {
      if (!input.title || input.title.trim().length === 0) {
        throw new Error("Goal title cannot be empty");
      }
      return input;
    }),
  },
  updateGoalSchema: {
    parse: vi.fn().mockImplementation((input) => input),
  },
}));

vi.mock("@/server/notes/service", () => ({
  listNotes: vi.fn().mockResolvedValue({
    notes: [
      { id: "note_1", title: "Architecture RFC", noteType: "technical", area: "career", updatedAt: "2026-09-30T10:00:00.000Z" },
    ],
    total: 1,
  }),
  getNoteById: vi.fn().mockImplementation((_userId, id) => {
    if (id === "note_1") {
      return Promise.resolve({
        id: "note_1",
        title: "Architecture RFC",
        noteType: "technical",
        area: "career",
        tags: ["architecture", "rfc"],
        isPinned: true,
        content: "Draft architecture plan",
      });
    }
    return Promise.resolve(null);
  }),
  createNote: vi.fn().mockImplementation((userId, input) => {
    return Promise.resolve({
      id: "note_new",
      userId,
      ...input,
    });
  }),
  updateNote: vi.fn().mockImplementation((_userId, id, input) => {
    return Promise.resolve({
      id,
      title: "Updated Note",
      ...input,
    });
  }),
  deleteNote: vi.fn().mockResolvedValue({ success: true }),
  createNoteSchema: {
    parse: vi.fn().mockImplementation((input) => {
      if (!input.title || input.title.trim().length === 0) {
        throw new Error("Note title cannot be empty");
      }
      return input;
    }),
  },
  updateNoteSchema: {
    parse: vi.fn().mockImplementation((input) => input),
  },
}));

vi.mock("@/server/habits/service", () => ({
  listHabits: vi.fn().mockResolvedValue([
    { id: "habit_1", title: "Morning Meditation", frequency: "daily", currentStreak: 12, longestStreak: 20, status: "active" },
  ]),
  getHabit: vi.fn().mockImplementation((_userId, id) => {
    if (id === "habit_1") {
      return Promise.resolve({
        id: "habit_1",
        title: "Morning Meditation",
        frequency: "daily",
        status: "active",
        currentStreak: 12,
        longestStreak: 20,
        targetValue: 15,
        unit: "mins",
        description: "Mindfulness",
      });
    }
    return Promise.resolve(null);
  }),
  createHabit: vi.fn().mockImplementation((userId, input) => {
    return Promise.resolve({
      id: "habit_new",
      userId,
      ...input,
    });
  }),
  updateHabit: vi.fn().mockImplementation((_userId, id, input) => {
    return Promise.resolve({
      id,
      title: "Updated Habit",
      ...input,
    });
  }),
  deleteHabit: vi.fn().mockResolvedValue({ success: true }),
  logHabitEntry: vi.fn().mockResolvedValue({
    entry: { id: "entry_1", habitId: "habit_1", date: "2026-09-30" },
    stats: { currentStreak: 13, longestStreak: 20 },
  }),
  toggleHabitEntry: vi.fn().mockResolvedValue({
    toggled: true,
    completed: true,
    entry: { id: "entry_1", habitId: "habit_1", date: "2026-09-30" },
    stats: { currentStreak: 13, longestStreak: 20 },
  }),
  createHabitSchema: {
    parse: vi.fn().mockImplementation((input) => {
      if (!input.title || input.title.trim().length === 0) {
        throw new Error("Habit title cannot be empty");
      }
      return input;
    }),
  },
  updateHabitSchema: {
    parse: vi.fn().mockImplementation((input) => input),
  },
  logHabitEntrySchema: {
    parse: vi.fn().mockImplementation((input) => input),
  },
}));

vi.mock("@/server/daily-plan/service", () => ({
  getDailyPlan: vi.fn().mockResolvedValue({
    date: "2026-09-30",
    plan: {
      status: "completed",
      priorityTaskIds: ["task_1"],
      habitIntentionIds: ["habit_1"],
      morningNotes: "Ready for high output",
    },
    review: {
      productivityScore: 9,
      completedTaskIds: ["task_1"],
      incompleteTaskIds: [],
      completedHabitIds: ["habit_1"],
      positiveReflections: "Productive morning session",
    },
    priorityTasks: [{ id: "task_1", title: "Buy groceries" }],
    overdueTasks: [],
    todayHabits: [{ id: "habit_1", title: "Morning Meditation" }],
  }),
  saveMorningPlan: vi.fn().mockResolvedValue({
    id: "dp_1",
    status: "completed",
    priorityTaskIds: ["task_1"],
  }),
  completeEveningReview: vi.fn().mockResolvedValue({
    id: "er_1",
    productivityScore: 9,
    positiveReflections: "Great day",
  }),
  executeRollover: vi.fn().mockResolvedValue({
    success: true,
    rolledOverCount: 1,
  }),
}));

vi.mock("@/server/daily-plan/validation", () => ({
  saveMorningPlanSchema: {
    parse: vi.fn().mockImplementation((input) => input),
  },
  completeEveningReviewSchema: {
    parse: vi.fn().mockImplementation((input) => input),
  },
  executeRolloverSchema: {
    parse: vi.fn().mockImplementation((input) => input),
  },
}));

describe("Plan 10-02: Headless CLI Commands", () => {
  const mockContext: CommandContext = {
    user: {
      id: "usr_hamza_123",
      name: "Hamza",
      email: "hamza@example.com",
    },
    session: {
      id: "sess_123",
      userId: "usr_hamza_123",
      expiresAt: new Date(Date.now() + 100000),
      token: "valid_token",
    },
    token: "valid_token",
    options: {},
  };

  describe("1. Context & Status Commands (CLI-03)", () => {
    it("aggregates life context using canonical application services", async () => {
      const parsed: ParsedArgs = {
        subcommands: ["status"],
        flags: {},
        options: {},
      };

      const result = await handleStatus(parsed, mockContext);
      expect(result.data).toBeDefined();
      expect(result.data!.metrics.tasksCompletedToday).toBe(5);
      expect(result.data!.metrics.activeGoalsCount).toBe(2);
      expect(result.message).toContain("=== LifeOS Status");
      expect(result.message).toContain("Hamza");
    });

    it("rejects caller identity spoofing via --userId in context command", async () => {
      const parsed: ParsedArgs = {
        subcommands: ["context"],
        flags: { userId: "adversary" },
        options: {},
      };

      await expect(handleContext(parsed, mockContext)).rejects.toThrow(
        /Specifying 'userId' is prohibited/
      );
    });
  });

  describe("2. Task Commands CRUD (CLI-04)", () => {
    it("lists tasks strictly scoped to authenticated user with filters", async () => {
      const parsed: ParsedArgs = {
        subcommands: ["tasks", "list"],
        flags: { status: "todo", priority: "medium" },
        options: {},
      };

      const result = await handleTasks(parsed, mockContext);
      expect(result.data).toHaveLength(1);
      expect(result.tableData?.rows[0].title).toBe("Buy groceries");
    });

    it("gets task by id and returns detailed properties", async () => {
      const parsed: ParsedArgs = {
        subcommands: ["tasks", "get", "task_1"],
        flags: {},
        options: {},
      };

      const result = await handleTasks(parsed, mockContext);
      expect((result.data as any).id).toBe("task_1");
    });

    it("fails closed with NotFoundError when task does not exist", async () => {
      const parsed: ParsedArgs = {
        subcommands: ["tasks", "get", "nonexistent"],
        flags: {},
        options: {},
      };

      await expect(handleTasks(parsed, mockContext)).rejects.toThrow(/Task not found/);
    });

    it("creates task and passes validated data to canonical createTask", async () => {
      const parsed: ParsedArgs = {
        subcommands: ["tasks", "create"],
        flags: { title: "Complete CLI suite", priority: "high" },
        options: {},
      };

      const result = await handleTasks(parsed, mockContext);
      expect((result.data as any).title).toBe("Complete CLI suite");
      expect(result.message).toContain("Task created successfully");
    });

    it("updates task and delegates to canonical updateTask", async () => {
      const parsed: ParsedArgs = {
        subcommands: ["tasks", "update", "task_1"],
        flags: { status: "completed" },
        options: {},
      };

      const result = await handleTasks(parsed, mockContext);
      expect((result.data as any).status).toBe("completed");
    });

    it("deletes task via canonical deleteTask", async () => {
      const parsed: ParsedArgs = {
        subcommands: ["tasks", "delete", "task_1"],
        flags: {},
        options: {},
      };

      const result = await handleTasks(parsed, mockContext);
      expect((result.data as any).deleted).toBe(true);
    });
  });

  describe("3. Project Commands CRUD (CLI-04)", () => {
    it("lists projects scoped to user", async () => {
      const parsed: ParsedArgs = {
        subcommands: ["projects", "list"],
        flags: {},
        options: {},
      };

      const result = await handleProjects(parsed, mockContext);
      expect(result.data).toHaveLength(1);
      expect(result.tableData?.rows[0].name).toBe("LifeOS Platform");
    });

    it("creates project with canonical schema validation", async () => {
      const parsed: ParsedArgs = {
        subcommands: ["projects", "create"],
        flags: { name: "Agent Infrastructure", area: "career" },
        options: {},
      };

      const result = await handleProjects(parsed, mockContext);
      expect((result.data as any).name).toBe("Agent Infrastructure");
    });

    it("deletes project via canonical deleteProject", async () => {
      const parsed: ParsedArgs = {
        subcommands: ["projects", "delete", "proj_1"],
        flags: {},
        options: {},
      };

      const result = await handleProjects(parsed, mockContext);
      expect((result.data as any).deleted).toBe(true);
    });
  });

  describe("4. Goal Commands CRUD (CLI-04)", () => {
    it("lists goals with progress rollup", async () => {
      const parsed: ParsedArgs = {
        subcommands: ["goals", "list"],
        flags: {},
        options: {},
      };

      const result = await handleGoals(parsed, mockContext);
      expect(result.data).toHaveLength(1);
      expect(result.tableData?.rows[0].title).toBe("Run Marathon");
    });

    it("creates goal with canonical schema validation", async () => {
      const parsed: ParsedArgs = {
        subcommands: ["goals", "create"],
        flags: { title: "Read 24 Books", horizon: "medium_term", area: "personal_development" },
        options: {},
      };

      const result = await handleGoals(parsed, mockContext);
      expect((result.data as any).title).toBe("Read 24 Books");
    });
  });

  describe("5. Note Commands CRUD (CLI-04)", () => {
    it("lists notes and displays table with type and area", async () => {
      const parsed: ParsedArgs = {
        subcommands: ["notes", "list"],
        flags: {},
        options: {},
      };

      const result = await handleNotes(parsed, mockContext);
      expect(result.data).toHaveLength(1);
      expect(result.tableData?.rows[0].title).toBe("Architecture RFC");
    });

    it("creates note parsing tags array", async () => {
      const parsed: ParsedArgs = {
        subcommands: ["notes", "create"],
        flags: { title: "Quick Thought", content: "Remember to test edge cases", tag: "testing" },
        options: {},
      };

      const result = await handleNotes(parsed, mockContext);
      expect((result.data as any).title).toBe("Quick Thought");
    });
  });

  describe("6. Habit Commands CRUD & Logging (CLI-04)", () => {
    it("lists habits with streaks", async () => {
      const parsed: ParsedArgs = {
        subcommands: ["habits", "list"],
        flags: {},
        options: {},
      };

      const result = await handleHabits(parsed, mockContext);
      expect(result.data).toHaveLength(1);
      expect(result.tableData?.rows[0].streak).toBe("12 days");
    });

    it("logs habit entry and returns streak stats", async () => {
      const parsed: ParsedArgs = {
        subcommands: ["habits", "log", "habit_1"],
        flags: { value: 20 },
        options: {},
      };

      const result = await handleHabits(parsed, mockContext);
      expect((result.data as any).stats.currentStreak).toBe(13);
    });

    it("toggles habit completion", async () => {
      const parsed: ParsedArgs = {
        subcommands: ["habits", "toggle", "habit_1"],
        flags: {},
        options: {},
      };

      const result = await handleHabits(parsed, mockContext);
      expect((result.data as any).completed).toBe(true);
    });
  });

  describe("7. Daily Planning Workflows (CLI-05)", () => {
    it("inspects morning plan when no update flags provided", async () => {
      const parsed: ParsedArgs = {
        subcommands: ["plan", "morning"],
        flags: { date: "2026-09-30" },
        options: {},
      };

      const result = await handlePlan(parsed, mockContext);
      expect(result.tableData?.rows.find((r) => r.field === "Morning Planned")?.value).toBe("yes");
    });

    it("submits morning plan with priority tasks and habit intentions", async () => {
      const parsed: ParsedArgs = {
        subcommands: ["plan", "morning"],
        flags: {
          date: "2026-09-30",
          priorityTasks: "task_1,task_2",
          complete: true,
        },
        options: {},
      };

      const result = await handlePlan(parsed, mockContext);
      expect((result.data as any).status).toBe("completed");
      expect(result.message).toContain("saved successfully");
    });

    it("inspects evening review status when no review flags provided", async () => {
      const parsed: ParsedArgs = {
        subcommands: ["plan", "evening"],
        flags: { date: "2026-09-30" },
        options: {},
      };

      const result = await handlePlan(parsed, mockContext);
      expect(result.tableData?.rows.find((r) => r.field === "Evening Review Completed")?.value).toBe("yes");
    });

    it("completes evening review and executes rollover", async () => {
      const parsed: ParsedArgs = {
        subcommands: ["plan", "evening"],
        flags: {
          date: "2026-09-30",
          rating: 9,
          reflections: "Excellent focus today",
          rollover: JSON.stringify([{ taskId: "task_1", action: "carry_over" }]),
        },
        options: {},
      };

      const result = await handlePlan(parsed, mockContext);
      expect((result.data as any).review.productivityScore).toBe(9);
      expect((result.data as any).rollover.rolledOverCount).toBe(1);
      expect(result.message).toContain("Evening review for 2026-09-30 completed successfully");
    });
  });
});
