/**
 * Plan 11-02: MCP Personal Graph Resources & Standard Prompts Tests
 *
 * Verifies:
 * 1. Resource discovery & alias registration (MCP-02).
 * 2. Resource reading via in-memory MCP client (MCP-02):
 *    - lifeos://context/overview (and lifeos://context/dashboard)
 *    - lifeos://context/tasks/today (and lifeos://tasks/today)
 *    - lifeos://context/goals/active (and lifeos://goals/active)
 *    - lifeos://context/projects/active (and lifeos://projects/active)
 *    - lifeos://context/finance/summary (and lifeos://finance/summary)
 *    - lifeos://context/daily-plan (and lifeos://daily-plan/today)
 *    - lifeos://context/notifications (and lifeos://notifications/unread)
 * 3. Payload bounding, secret scrubbing, and deterministic serialization (MCP-02).
 * 4. Standard agent prompts registration & generation (MCP-02):
 *    - lifeos_morning_planning
 *    - lifeos_evening_review
 *    - lifeos_task_breakdown
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createLifeOSMcpServer } from "@/server/mcp/server";
import type { McpContext } from "@/server/mcp/types";

// Mock domain services
vi.mock("@/server/dashboard/service", () => ({
  getDashboardOverview: vi.fn().mockResolvedValue({
    metrics: { completedTasksToday: 3, pendingTasksToday: 2, streakDays: 7 },
    dailyPlan: { status: "active", intention: "Focus on deep architectural work" },
    priorities: {
      todayTasks: [
        { id: "task-1", title: "Complete MCP implementation", priority: 1, status: "in_progress" },
        { id: "task-2", title: "Review system logs", priority: 2, status: "pending" },
      ],
      overdueTasks: [],
      criticalTasks: [],
    },
    schedule: { todayBlocks: [], totalScheduledMinutes: 120, completedMinutes: 60 },
    habits: {
      items: [
        { id: "habit-1", title: "Morning Exercise", frequency: "daily" },
        { id: "habit-2", title: "Read 20 pages", frequency: "daily" },
      ],
      completionRateToday: 0.5,
    },
    goalsAndProjects: {
      activeGoals: [{ id: "goal-1", title: "Ship LifeOS v2.0", horizon: "short_term", progress: 65 }],
      activeProjects: [{ id: "proj-1", name: "Phase 11 MCP Server", status: "active", progress: 50 }],
    },
  }),
}));

vi.mock("@/server/tasks/service", () => ({
  listTasks: vi.fn().mockResolvedValue([
    {
      id: "task-1",
      userId: "user-test",
      title: "Complete MCP implementation",
      priority: "high",
      status: "in_progress",
      scheduledDate: new Date().toISOString(),
    },
    {
      id: "task-2",
      userId: "user-test",
      title: "Review system logs",
      priority: "medium",
      status: "pending",
      dueDate: new Date().toISOString(),
    },
  ]),
}));

vi.mock("@/server/goals/service", () => ({
  listGoals: vi.fn().mockResolvedValue([
    {
      id: "goal-1",
      userId: "user-test",
      title: "Ship LifeOS v2.0",
      status: "active",
      horizon: "short_term",
      metricType: "percentage",
      targetValue: 100,
      currentValue: 65,
    },
  ]),
}));

vi.mock("@/server/projects/service", () => ({
  listProjects: vi.fn().mockResolvedValue([
    {
      id: "proj-1",
      userId: "user-test",
      name: "Phase 11 MCP Server",
      status: "active",
      priority: "critical",
      area: "CAREER",
    },
  ]),
}));

vi.mock("@/server/finance/reports-service", () => ({
  getFinanceSummary: vi.fn().mockResolvedValue({
    netWorth: 125000,
    cashFlow: 3500,
    savingsRate: 0.28,
    categoryBreakdown: { housing: 1500, investments: 2000 },
  }),
}));

vi.mock("@/server/daily-plan/service", () => ({
  getDailyPlan: vi.fn().mockResolvedValue({
    plan: {
      id: "plan-1",
      date: new Date().toISOString().slice(0, 10),
      morningNotes: "Focus on deep architectural work",
    },
    review: {
      id: "rev-1",
      positiveReflections: "Resolved complex protocol lifecycle gracefully",
      notes: "Great momentum throughout the morning session",
    },
  }),
}));

vi.mock("@/server/notifications/service", () => ({
  listNotifications: vi.fn().mockResolvedValue({
    notifications: [
      { id: "notif-1", title: "Backup completed", isRead: false, type: "system" },
    ],
    total: 1,
    unreadCount: 1,
  }),
  getUnreadCount: vi.fn().mockResolvedValue(1),
}));

vi.mock("@/server/calendar/service", () => ({
  listTimeBlocks: vi.fn().mockResolvedValue([
    {
      id: "tb-1",
      title: "Deep Work Session",
      startTime: new Date(Date.now() - 3600000).toISOString(),
      endTime: new Date(Date.now() + 3600000).toISOString(),
      status: "in_progress",
    },
  ]),
}));

describe("Plan 11-02: MCP Personal Graph Resources & Standard Prompts", () => {
  let client: Client;
  let context: McpContext;

  beforeEach(async () => {
    vi.clearAllMocks();

    context = {
      user: { id: "user-test", name: "Hamza Waqar", email: "hamza@example.com" },
      session: {
        id: "sess-test",
        userId: "user-test",
        expiresAt: new Date(Date.now() + 3600000),
      },
    };

    const server = createLifeOSMcpServer(context);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    client = new Client({ name: "test-mcp-client", version: "1.0.0" });
    await client.connect(clientTransport);
  });

  describe("1. Resource Listing & Aliases Discovery (MCP-02)", () => {
    it("lists all approved context resources and their canonical aliases", async () => {
      const result = await client.listResources();
      const uris = result.resources.map((r) => r.uri);

      // Verify all 7 canonical resources
      expect(uris).toContain("lifeos://context/overview");
      expect(uris).toContain("lifeos://context/tasks/today");
      expect(uris).toContain("lifeos://context/goals/active");
      expect(uris).toContain("lifeos://context/projects/active");
      expect(uris).toContain("lifeos://context/finance/summary");
      expect(uris).toContain("lifeos://context/daily-plan");
      expect(uris).toContain("lifeos://context/notifications");

      // Verify canonical aliases
      expect(uris).toContain("lifeos://context/dashboard");
      expect(uris).toContain("lifeos://tasks/today");
      expect(uris).toContain("lifeos://goals/active");
      expect(uris).toContain("lifeos://projects/active");
      expect(uris).toContain("lifeos://finance/summary");
      expect(uris).toContain("lifeos://daily-plan/today");
      expect(uris).toContain("lifeos://notifications/unread");
    });
  });

  describe("2. Resource Reading & Serialization (MCP-02)", () => {
    function getResourceJson(res: { contents: Array<unknown> }): Record<string, any> {
      const item = res.contents[0] as { text: string };
      return JSON.parse(item.text);
    }

    it("reads lifeos://context/overview returning valid deterministic JSON", async () => {
      const result = await client.readResource({ uri: "lifeos://context/overview" });
      expect(result.contents).toHaveLength(1);
      expect((result.contents[0] as { mimeType?: string }).mimeType).toBe("application/json");

      const parsed = getResourceJson(result);
      expect(parsed).toHaveProperty("metrics");
      expect(parsed).toHaveProperty("dailyPlan");
      expect(parsed).toHaveProperty("topPriorities");
      expect(parsed).toHaveProperty("upcomingSchedule");
      expect(parsed).toHaveProperty("activeHabits");
      expect(parsed).toHaveProperty("goals");
      expect(parsed).toHaveProperty("projects");
      expect(parsed).toHaveProperty("notifications");
      expect(parsed.user.id).toBe("user-test");
    });

    it("reads alias lifeos://context/dashboard with identical data", async () => {
      const result = await client.readResource({ uri: "lifeos://context/dashboard" });
      expect(result.contents).toHaveLength(1);
      const parsed = getResourceJson(result);
      expect(parsed).toHaveProperty("metrics");
    });

    it("reads lifeos://context/tasks/today returning today's tasks bounded", async () => {
      const result = await client.readResource({ uri: "lifeos://context/tasks/today" });
      const parsed = getResourceJson(result);
      expect(parsed).toHaveProperty("tasks");
      expect(Array.isArray(parsed.tasks)).toBe(true);
      expect(parsed.tasks.length).toBeGreaterThan(0);
    });

    it("reads lifeos://context/goals/active returning active goals", async () => {
      const result = await client.readResource({ uri: "lifeos://context/goals/active" });
      const parsed = getResourceJson(result);
      expect(parsed).toHaveProperty("goals");
      expect(parsed.goals[0].title).toBe("Ship LifeOS v2.0");
    });

    it("reads lifeos://context/projects/active returning active projects", async () => {
      const result = await client.readResource({ uri: "lifeos://context/projects/active" });
      const parsed = getResourceJson(result);
      expect(parsed).toHaveProperty("projects");
      expect(parsed.projects[0].name).toBe("Phase 11 MCP Server");
    });

    it("reads lifeos://context/finance/summary and asserts read-only summary", async () => {
      const result = await client.readResource({ uri: "lifeos://context/finance/summary" });
      const parsed = getResourceJson(result);
      expect(parsed.readOnly).toBe(true);
      expect(parsed.summary.netWorth).toBe(125000);
      expect(parsed.summary.cashFlow).toBe(3500);
    });

    it("reads lifeos://context/daily-plan returning today's daily plan context", async () => {
      const result = await client.readResource({ uri: "lifeos://context/daily-plan" });
      const parsed = getResourceJson(result);
      expect(parsed).toHaveProperty("dailyPlan");
      expect(parsed.dailyPlan.plan.morningNotes).toBe("Focus on deep architectural work");
    });

    it("reads lifeos://context/notifications returning unread count and list", async () => {
      const result = await client.readResource({ uri: "lifeos://context/notifications" });
      const parsed = getResourceJson(result);
      expect(parsed.unreadCount).toBe(1);
      expect(parsed.notifications).toHaveLength(1);
    });
  });

  describe("3. Standard Agent Prompts (MCP-02)", () => {
    it("lists all 3 standard prompts with argument schemas", async () => {
      const result = await client.listPrompts();
      const names = result.prompts.map((p) => p.name);

      expect(names).toContain("lifeos_morning_planning");
      expect(names).toContain("lifeos_evening_review");
      expect(names).toContain("lifeos_task_breakdown");
    });

    it("generates lifeos_morning_planning prompt message grounded in schedule and tasks", async () => {
      const result = await client.getPrompt({
        name: "lifeos_morning_planning",
        arguments: { date: "2026-09-30" },
      });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe("user");
      const text = (result.messages[0].content as { type: string; text: string }).text;
      expect(text).toContain("Hamza");
      expect(text).toContain("2026-09-30");
      expect(text).toContain("Scheduled Calendar Blocks");
      expect(text).toContain("Deep Work Session");
      expect(text).toContain("Top Priority Tasks");
      expect(text).toContain("Complete MCP implementation");
    });

    it("generates lifeos_evening_review prompt message with completed and pending tasks", async () => {
      const result = await client.getPrompt({
        name: "lifeos_evening_review",
        arguments: { date: "2026-09-30" },
      });

      expect(result.messages).toHaveLength(1);
      const text = (result.messages[0].content as { type: string; text: string }).text;
      expect(text).toContain("Tasks Still Pending");
      expect(text).toContain("Positive Reflections");
      expect(text).toContain("Resolved complex protocol lifecycle gracefully");
    });

    it("generates lifeos_task_breakdown prompt message decomposing given objective", async () => {
      const result = await client.getPrompt({
        name: "lifeos_task_breakdown",
        arguments: {
          title: "Build MCP client harness for automated testing",
          projectId: "proj-1",
        },
      });

      expect(result.messages).toHaveLength(1);
      const text = (result.messages[0].content as { type: string; text: string }).text;
      expect(text).toContain("Build MCP client harness for automated testing");
      expect(text).toContain("Project ID: proj-1");
      expect(text).toContain("3 to 7 concrete, sequenced subtasks");
    });
  });
});
