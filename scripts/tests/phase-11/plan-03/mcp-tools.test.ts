/**
 * Plan 11-03: MCP Domain Tools & Canonical Service Adapters Tests
 *
 * Verifies:
 * 1. Tool discovery: all 10 domain tools registered with parameter schemas (MCP-03).
 * 2. Canonical service delegation for tasks, projects, goals, notes, search, and habits (MCP-04).
 * 3. Caller identity spoofing rejection across all tools (MCP-04).
 * 4. Error mapping with secret scrubbing and deterministic formatting (MCP-04).
 * 5. Financial mutation shield: zero transaction/account/transfer mutation tools permitted (MCP-03).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createLifeOSMcpServer } from "@/server/mcp/server";
import type { McpContext } from "@/server/mcp/types";

// Spies for domain services
const mockCreateTask = vi.fn();
const mockUpdateTask = vi.fn();
const mockDeleteTask = vi.fn();
const mockCreateProject = vi.fn();
const mockUpdateProject = vi.fn();
const mockCreateGoal = vi.fn();
const mockUpdateGoal = vi.fn();
const mockCreateNote = vi.fn();
const mockSearch = vi.fn();
const mockLogHabitEntry = vi.fn();

vi.mock("@/server/tasks/service", () => ({
  createTask: (...args: unknown[]) => mockCreateTask(...args),
  updateTask: (...args: unknown[]) => mockUpdateTask(...args),
  deleteTask: (...args: unknown[]) => mockDeleteTask(...args),
}));

vi.mock("@/server/projects/service", () => ({
  createProject: (...args: unknown[]) => mockCreateProject(...args),
  updateProject: (...args: unknown[]) => mockUpdateProject(...args),
}));

vi.mock("@/server/goals/service", () => ({
  createGoal: (...args: unknown[]) => mockCreateGoal(...args),
  updateGoal: (...args: unknown[]) => mockUpdateGoal(...args),
}));

vi.mock("@/server/notes/service", () => ({
  createNote: (...args: unknown[]) => mockCreateNote(...args),
}));

vi.mock("@/server/search/service", () => ({
  search: (...args: unknown[]) => mockSearch(...args),
}));

vi.mock("@/server/habits/service", () => ({
  logHabitEntry: (...args: unknown[]) => mockLogHabitEntry(...args),
}));

// Mock other resources dependencies to prevent error on server creation
vi.mock("@/server/dashboard/service", () => ({
  getDashboardOverview: vi.fn().mockResolvedValue({
    metrics: {},
    dailyPlan: {},
    priorities: { todayTasks: [] },
    habits: { items: [] },
    goalsAndProjects: { activeGoals: [], activeProjects: [] },
  }),
}));
vi.mock("@/server/notifications/service", () => ({
  listNotifications: vi.fn().mockResolvedValue({ notifications: [], total: 0 }),
  getUnreadCount: vi.fn().mockResolvedValue(0),
}));
vi.mock("@/server/calendar/service", () => ({
  listTimeBlocks: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/server/finance/reports-service", () => ({
  getFinanceSummary: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/server/daily-plan/service", () => ({
  getDailyPlan: vi.fn().mockResolvedValue({}),
}));

describe("Plan 11-03: MCP Domain Tools Registry & Canonical Service Adapters", () => {
  let client: Client;
  let context: McpContext;

  function parseToolResponse(res: { content: Array<{ type: string; text?: string }>; isError?: boolean }): any {
    const text = res.content[0]?.text || "{}";
    return JSON.parse(text);
  }

  beforeEach(async () => {
    vi.clearAllMocks();

    context = {
      user: { id: "user-auth-123", name: "Hamza Waqar", email: "hamza@example.com" },
      session: {
        id: "sess-123",
        userId: "user-auth-123",
        expiresAt: new Date(Date.now() + 3600000),
      },
    };

    const server = createLifeOSMcpServer(context);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    client = new Client({ name: "test-mcp-client", version: "1.0.0" });
    await client.connect(clientTransport);
  });

  describe("1. Structured Tool Registry Discovery (MCP-03)", () => {
    it("lists exactly the 10 approved domain tools", async () => {
      const res = await client.listTools();
      const names = res.tools.map((t) => t.name);
      const domainNames = names.filter(
        (n) =>
          !n.includes("skill") &&
          !n.includes("doc") &&
          !n.includes("planning") &&
          !n.includes("workspace") &&
          n !== "lifeos_list_tasks" &&
          n !== "lifeos_get_task"
      );

      expect(domainNames).toHaveLength(10);
      expect(domainNames).toContain("lifeos_create_task");
      expect(domainNames).toContain("lifeos_update_task");
      expect(domainNames).toContain("lifeos_delete_task");
      expect(domainNames).toContain("lifeos_create_project");
      expect(domainNames).toContain("lifeos_update_project");
      expect(domainNames).toContain("lifeos_create_goal");
      expect(domainNames).toContain("lifeos_update_goal");
      expect(domainNames).toContain("lifeos_create_note");
      expect(domainNames).toContain("lifeos_search");
      expect(domainNames).toContain("lifeos_log_habit");
    });

    it("verifies financial shield: zero financial mutation tools exist in registry", async () => {
      const res = await client.listTools();
      const prohibited = ["transaction", "account", "transfer", "balance", "money", "wallet", "finance"];
      for (const tool of res.tools) {
        for (const term of prohibited) {
          expect(tool.name.toLowerCase()).not.toContain(term);
        }
      }
    });
  });

  describe("2. Canonical Task Tools Delegation (MCP-04)", () => {
    it("lifeos_create_task delegates to createTask with authenticated userId", async () => {
      mockCreateTask.mockResolvedValue({
        id: "task-new-1",
        userId: "user-auth-123",
        title: "Test Task",
        priority: "high",
      });

      const res = await client.callTool({
        name: "lifeos_create_task",
        arguments: {
          title: "Test Task",
          priority: "high",
        },
      });

      expect(res.isError).toBeFalsy();
      expect(mockCreateTask).toHaveBeenCalledWith("user-auth-123", {
        title: "Test Task",
        priority: "high",
      });

      const data = parseToolResponse(res as any);
      expect(data.id).toBe("task-new-1");
      expect(data.title).toBe("Test Task");
    });

    it("lifeos_update_task delegates to updateTask with authenticated userId", async () => {
      mockUpdateTask.mockResolvedValue({
        id: "task-1",
        userId: "user-auth-123",
        title: "Updated Title",
        status: "in_progress",
      });

      const res = await client.callTool({
        name: "lifeos_update_task",
        arguments: {
          id: "task-1",
          title: "Updated Title",
          status: "in_progress",
        },
      });

      expect(res.isError).toBeFalsy();
      expect(mockUpdateTask).toHaveBeenCalledWith("user-auth-123", "task-1", {
        title: "Updated Title",
        status: "in_progress",
      });

      const data = parseToolResponse(res as any);
      expect(data.title).toBe("Updated Title");
    });

    it("lifeos_delete_task delegates to deleteTask with authenticated userId", async () => {
      mockDeleteTask.mockResolvedValue({ success: true });

      const res = await client.callTool({
        name: "lifeos_delete_task",
        arguments: {
          id: "task-1",
        },
      });

      expect(res.isError).toBeFalsy();
      expect(mockDeleteTask).toHaveBeenCalledWith("user-auth-123", "task-1");
    });
  });

  describe("3. Canonical Project & Goal Tools Delegation (MCP-04)", () => {
    it("lifeos_create_project delegates to createProject", async () => {
      mockCreateProject.mockResolvedValue({ id: "proj-1", name: "New Project" });

      const res = await client.callTool({
        name: "lifeos_create_project",
        arguments: {
          name: "New Project",
          area: "career",
        },
      });

      expect(res.isError).toBeFalsy();
      expect(mockCreateProject).toHaveBeenCalledWith("user-auth-123", {
        name: "New Project",
        area: "career",
      });
    });

    it("lifeos_update_project delegates to updateProject", async () => {
      mockUpdateProject.mockResolvedValue({ id: "proj-1", status: "active" });

      const res = await client.callTool({
        name: "lifeos_update_project",
        arguments: {
          id: "proj-1",
          status: "active",
        },
      });

      expect(res.isError).toBeFalsy();
      expect(mockUpdateProject).toHaveBeenCalledWith("user-auth-123", "proj-1", {
        status: "active",
      });
    });

    it("lifeos_create_goal delegates to createGoal", async () => {
      mockCreateGoal.mockResolvedValue({ id: "goal-1", title: "New Goal" });

      const res = await client.callTool({
        name: "lifeos_create_goal",
        arguments: {
          title: "New Goal",
          horizon: "short_term",
        },
      });

      expect(res.isError).toBeFalsy();
      expect(mockCreateGoal).toHaveBeenCalledWith("user-auth-123", {
        title: "New Goal",
        horizon: "short_term",
      });
    });

    it("lifeos_update_goal delegates to updateGoal", async () => {
      mockUpdateGoal.mockResolvedValue({ id: "goal-1", currentValue: 50 });

      const res = await client.callTool({
        name: "lifeos_update_goal",
        arguments: {
          id: "goal-1",
          currentValue: 50,
        },
      });

      expect(res.isError).toBeFalsy();
      expect(mockUpdateGoal).toHaveBeenCalledWith("user-auth-123", "goal-1", {
        currentValue: 50,
      });
    });
  });

  describe("4. Canonical Note, Search & Habit Tools Delegation (MCP-04)", () => {
    it("lifeos_create_note delegates to createNote", async () => {
      mockCreateNote.mockResolvedValue({ id: "note-1", title: "Meeting Notes" });

      const res = await client.callTool({
        name: "lifeos_create_note",
        arguments: {
          title: "Meeting Notes",
          content: "Discussed architecture",
        },
      });

      expect(res.isError).toBeFalsy();
      expect(mockCreateNote).toHaveBeenCalledWith(
        "user-auth-123",
        expect.objectContaining({ title: "Meeting Notes", content: "Discussed architecture" })
      );
    });

    it("lifeos_search delegates to search", async () => {
      mockSearch.mockResolvedValue({
        results: [{ id: "n-1", type: "note", title: "Architecture" }],
        total: 1,
      });

      const res = await client.callTool({
        name: "lifeos_search",
        arguments: {
          q: "Architecture",
          limit: 10,
        },
      });

      expect(res.isError).toBeFalsy();
      expect(mockSearch).toHaveBeenCalledWith("user-auth-123", {
        q: "Architecture",
        limit: 10,
      });
    });

    it("lifeos_log_habit delegates to logHabitEntry", async () => {
      mockLogHabitEntry.mockResolvedValue({
        entry: { id: "entry-1", date: "2026-09-30", value: 1 },
        stats: { currentStreak: 5, longestStreak: 10 },
      });

      const res = await client.callTool({
        name: "lifeos_log_habit",
        arguments: {
          habitId: "habit-1",
          date: "2026-09-30",
          value: 1,
        },
      });

      expect(res.isError).toBeFalsy();
      expect(mockLogHabitEntry).toHaveBeenCalledWith("user-auth-123", "habit-1", {
        date: "2026-09-30",
        value: 1,
      });
    });
  });

  describe("5. Caller Identity Spoofing Defense (MCP-04)", () => {
    it("rejects caller-supplied userId in tool call arguments", async () => {
      const res = await client.callTool({
        name: "lifeos_create_task",
        arguments: {
          title: "Spoofed Task",
          userId: "victim-user-999",
        },
      });

      expect(res.isError).toBe(true);
      const err = parseToolResponse(res as any);
      expect(err.error.code).toBe("USAGE_ERROR");
      expect(err.error.message).toContain("userId");
      expect(mockCreateTask).not.toHaveBeenCalled();
    });

    it("rejects caller-supplied user_id in tool call arguments", async () => {
      const res = await client.callTool({
        name: "lifeos_create_project",
        arguments: {
          name: "Spoofed Project",
          user_id: "victim-user-999",
        },
      });

      expect(res.isError).toBe(true);
      const err = parseToolResponse(res as any);
      expect(err.error.code).toBe("USAGE_ERROR");
      expect(err.error.message).toContain("user_id");
      expect(mockCreateProject).not.toHaveBeenCalled();
    });

    it("rejects caller-supplied user-id in tool call arguments", async () => {
      const res = await client.callTool({
        name: "lifeos_create_goal",
        arguments: {
          title: "Spoofed Goal",
          "user-id": "victim-user-999",
        },
      });

      expect(res.isError).toBe(true);
      const err = parseToolResponse(res as any);
      expect(err.error.code).toBe("USAGE_ERROR");
      expect(mockCreateGoal).not.toHaveBeenCalled();
    });

    it("rejects nested caller-supplied userId in tool call arguments", async () => {
      const res = await client.callTool({
        name: "lifeos_log_habit",
        arguments: {
          habitId: "h-1",
          date: "2026-09-30",
          extra: {
            userId: "victim-user",
          },
        },
      });

      expect(res.isError).toBe(true);
      expect(mockLogHabitEntry).not.toHaveBeenCalled();
    });
  });

  describe("6. Secret Scrubbing in Error Output (MCP-04)", () => {
    it("scrubs secrets, bearer tokens, and passwords from error responses", async () => {
      mockCreateTask.mockRejectedValue(
        new Error("Database connection to postgres://user:secretpassword123@localhost failed with token=mysecrettoken456")
      );

      const res = await client.callTool({
        name: "lifeos_create_task",
        arguments: {
          title: "Failing Task",
        },
      });

      expect(res.isError).toBe(true);
      const firstContent = (res.content as Array<{ type: string; text?: string }>)[0];
      const text = firstContent?.text || "";
      expect(text).not.toContain("secretpassword123");
      expect(text).not.toContain("mysecrettoken456");
      expect(text).toContain("***REDACTED***");
    });
  });
});
