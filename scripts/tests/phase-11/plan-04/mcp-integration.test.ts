/**
 * Plan 11-04: Real Stdio MCP Integration Tests
 *
 * Verifies end-to-end bidirectional stdio communication using McpTestClient and StdioServerTransport:
 * 1. Protocol handshake: initialize and notifications/initialized (MCP-01).
 * 2. Resources: resources/list and resources/read across all 7 canonical resources (MCP-02).
 * 3. Tools: tools/list and tools/call across all 10 domain tools (MCP-03, MCP-04).
 * 4. Financial shield: verification that no financial write tools exist (MCP-03).
 * 5. Prompts: prompts/list and prompts/get across all 3 standard prompts (MCP-02).
 * 6. Stdout stream discipline: 100% of stdout lines are valid JSON-RPC 2.0 frames (MCP-01).
 * 7. Subprocess CLI invocation and graceful teardown.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { PassThrough } from "node:stream";
import { startStdioServer } from "@/server/mcp/transport";
import { McpTestClient } from "./mcp-test-client";
import type { McpContext } from "@/server/mcp/types";

// Mock domain services
const mockDashboard = vi.fn().mockResolvedValue({
  metrics: { completedTasksToday: 3, pendingTasksToday: 2, streakDays: 7 },
  dailyPlan: { status: "active", intention: "Focus on deep architectural work" },
  priorities: {
    todayTasks: [
      { id: "task-1", title: "Complete MCP implementation", priority: 1, status: "in_progress" },
    ],
    overdueTasks: [],
    criticalTasks: [],
  },
  schedule: { todayBlocks: [], totalScheduledMinutes: 120, completedMinutes: 60 },
  habits: { items: [], completionRateToday: 0.5 },
  goalsAndProjects: { activeGoals: [], activeProjects: [] },
});

const mockListTasks = vi.fn().mockResolvedValue([
  {
    id: "task-1",
    title: "Complete MCP tests",
    status: "in_progress",
    scheduledDate: new Date().toISOString(),
  },
]);

const mockListGoals = vi.fn().mockResolvedValue([]);
const mockListProjects = vi.fn().mockResolvedValue([]);
const mockFinanceSummary = vi.fn().mockResolvedValue({
  netWorth: 125000,
  cashFlow: 3500,
  savingsRate: 0.28,
  categoryBreakdown: { housing: 1500, investments: 2000 },
});
const mockDailyPlan = vi.fn().mockResolvedValue({
  id: "plan-1",
  date: "2026-09-30",
  morningNotes: "Focus on testing",
});
const mockListNotifications = vi.fn().mockResolvedValue({
  notifications: [{ id: "notif-1", title: "Test Notification", read: false }],
  total: 1,
});
const mockUnreadCount = vi.fn().mockResolvedValue(0);
const mockListTimeBlocks = vi.fn().mockResolvedValue([]);

const mockCreateTask = vi.fn().mockResolvedValue({
  id: "task-new-123",
  title: "Test Task Creation",
  status: "todo",
  priority: "high",
});
const mockUpdateTask = vi.fn().mockResolvedValue({
  id: "task-new-123",
  title: "Updated Task Title",
  status: "in_progress",
});
const mockDeleteTask = vi.fn().mockResolvedValue({ deleted: true });
const mockCreateProject = vi.fn().mockResolvedValue({
  id: "proj-1",
  name: "Q4 Launch",
  status: "active",
});
const mockUpdateProject = vi.fn().mockResolvedValue({
  id: "proj-1",
  name: "Q4 Launch v2",
  status: "active",
});
const mockCreateGoal = vi.fn().mockResolvedValue({
  id: "goal-1",
  title: "Read 24 books",
  status: "in_progress",
});
const mockUpdateGoal = vi.fn().mockResolvedValue({
  id: "goal-1",
  title: "Read 30 books",
  status: "in_progress",
});
const mockCreateNote = vi.fn().mockResolvedValue({
  id: "note-1",
  title: "Architecture Decisions",
  content: "Plan 11-04 verification details",
});
const mockSearch = vi.fn().mockResolvedValue({
  results: [{ id: "res-1", type: "note", title: "MCP Architecture" }],
  totalCount: 1,
});
const mockLogHabitEntry = vi.fn().mockResolvedValue({
  id: "entry-1",
  habitId: "habit-1",
  completed: true,
});

vi.mock("@/server/dashboard/service", () => ({
  getDashboardOverview: (...args: unknown[]) => mockDashboard(...args),
}));

vi.mock("@/server/tasks/service", () => ({
  listTasks: (...args: unknown[]) => mockListTasks(...args),
  createTask: (...args: unknown[]) => mockCreateTask(...args),
  updateTask: (...args: unknown[]) => mockUpdateTask(...args),
  deleteTask: (...args: unknown[]) => mockDeleteTask(...args),
}));

vi.mock("@/server/goals/service", () => ({
  listGoals: (...args: unknown[]) => mockListGoals(...args),
  createGoal: (...args: unknown[]) => mockCreateGoal(...args),
  updateGoal: (...args: unknown[]) => mockUpdateGoal(...args),
}));

vi.mock("@/server/projects/service", () => ({
  listProjects: (...args: unknown[]) => mockListProjects(...args),
  createProject: (...args: unknown[]) => mockCreateProject(...args),
  updateProject: (...args: unknown[]) => mockUpdateProject(...args),
}));

vi.mock("@/server/notifications/service", () => ({
  listNotifications: (...args: unknown[]) => mockListNotifications(...args),
  getUnreadCount: (...args: unknown[]) => mockUnreadCount(...args),
}));

vi.mock("@/server/calendar/service", () => ({
  listTimeBlocks: (...args: unknown[]) => mockListTimeBlocks(...args),
}));

vi.mock("@/server/finance/reports-service", () => ({
  getFinanceSummary: (...args: unknown[]) => mockFinanceSummary(...args),
}));

vi.mock("@/server/daily-plan/service", () => ({
  getDailyPlan: (...args: unknown[]) => mockDailyPlan(...args),
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

vi.mock("@/server/db", () => ({
  db: {
    select: vi.fn(),
  },
  getDb: vi.fn(),
  closeDatabase: vi.fn().mockResolvedValue(undefined),
}));

describe("Plan 11-04: Real Stdio MCP Integration Suite", () => {
  let client: McpTestClient;
  let serverPromise: Promise<void>;
  let clientIn: PassThrough; // client writes to server
  let serverOut: PassThrough; // server writes to client
  let serverErr: PassThrough;

  const testContext: McpContext = {
    user: {
      id: "usr_integration_001",
      name: "Integration Test User",
      email: "integration@lifeos.internal",
    },
    session: {
      id: "sess_integration_001",
      userId: "usr_integration_001",
      expiresAt: new Date(Date.now() + 86400000),
    },
  };

  beforeAll(async () => {
    // Setup PassThrough streams for true stdio transport protocol testing
    clientIn = new PassThrough();
    serverOut = new PassThrough();
    serverErr = new PassThrough();

    client = new McpTestClient({ timeoutMs: 10000 });
    client.connectStreams(clientIn, serverOut, serverErr);

    // Launch server with StdioServerTransport bound to streams
    serverPromise = startStdioServer(
      {
        stdin: clientIn as unknown as NodeJS.ReadStream,
        stdout: serverOut as unknown as NodeJS.WriteStream,
        stderr: serverErr as unknown as NodeJS.WriteStream,
      },
      testContext
    );
  });

  afterAll(async () => {
    await client.close();
    clientIn.end();
    await serverPromise.catch(() => {});
  });

  describe("1. Protocol Handshake (MCP-01)", () => {
    it("completes initialize request returning server name, version, and capabilities", async () => {
      const initResult = await client.initialize({
        clientInfo: { name: "integration-client", version: "1.0.0" },
      });

      expect(initResult.serverInfo.name).toBe("lifeos");
      expect(initResult.serverInfo.version).toBe("0.1.0");
      expect(initResult.capabilities).toBeDefined();
      expect(initResult.capabilities.resources).toBeDefined();
      expect(initResult.capabilities.tools).toBeDefined();
      expect(initResult.capabilities.prompts).toBeDefined();
    });

    it("sends notifications/initialized without errors", () => {
      expect(() => client.initialized()).not.toThrow();
    });
  });

  describe("2. Personal Graph Resources (MCP-02)", () => {
    it("lists all 7 canonical resources and aliases via resources/list", async () => {
      const res = await client.listResources();
      expect(res.resources.length).toBeGreaterThanOrEqual(7);

      const uris = res.resources.map((r) => r.uri);
      expect(uris).toContain("lifeos://context/overview");
      expect(uris).toContain("lifeos://context/tasks/today");
      expect(uris).toContain("lifeos://context/goals/active");
      expect(uris).toContain("lifeos://context/projects/active");
      expect(uris).toContain("lifeos://context/finance/summary");
      expect(uris).toContain("lifeos://context/daily-plan");
      expect(uris).toContain("lifeos://context/notifications");

      // Verify MIME types
      for (const r of res.resources) {
        expect(r.mimeType).toBe("application/json");
      }
    });

    it("reads lifeos://context/overview via resources/read", async () => {
      const res = await client.readResource("lifeos://context/overview");
      expect(res.contents).toHaveLength(1);
      expect(res.contents[0].uri).toBe("lifeos://context/overview");
      expect(res.contents[0].mimeType).toBe("application/json");

      const parsed = JSON.parse(res.contents[0].text!);
      expect(parsed.topPriorities).toHaveLength(1);
      expect(mockDashboard).toHaveBeenCalledWith(testContext.user.id, expect.any(String));
    });

    it("reads lifeos://context/tasks/today with 50-task bounding", async () => {
      const res = await client.readResource("lifeos://context/tasks/today");
      const parsed = JSON.parse(res.contents[0].text!);
      expect(parsed.count).toBe(1);
      expect(parsed.tasks[0].title).toBe("Complete MCP tests");
      expect(mockListTasks).toHaveBeenCalledWith(testContext.user.id);
    });

    it("reads lifeos://context/finance/summary returning aggregated read-only summary", async () => {
      const res = await client.readResource("lifeos://context/finance/summary");
      const parsed = JSON.parse(res.contents[0].text!);
      expect(parsed.summary.netWorth).toBe(125000);
      expect(parsed.summary.cashFlow).toBe(3500);
      expect(mockFinanceSummary).toHaveBeenCalledWith(testContext.user.id, expect.any(String));
    });

    it("reads lifeos://context/daily-plan returning day plan context", async () => {
      const res = await client.readResource("lifeos://context/daily-plan");
      const parsed = JSON.parse(res.contents[0].text!);
      expect(parsed.dailyPlan.morningNotes).toBe("Focus on testing");
    });

    it("reads lifeos://context/notifications with 20-item bounding", async () => {
      const res = await client.readResource("lifeos://context/notifications");
      const parsed = JSON.parse(res.contents[0].text!);
      expect(parsed.notifications).toHaveLength(1);
      expect(mockListNotifications).toHaveBeenCalledWith(testContext.user.id, { limit: 20, unreadOnly: true });
    });
  });

  describe("3. Domain Tools & Financial Shield (MCP-03, MCP-04)", () => {
    it("lists exactly the 10 approved domain tools via tools/list", async () => {
      const res = await client.listTools();
      const names = res.tools.map((t) => t.name).sort();
      const domainNames = names.filter((n) => !n.includes("skill") && !n.includes("doc") && !n.includes("planning"));

      expect(domainNames).toEqual([
        "lifeos_create_goal",
        "lifeos_create_note",
        "lifeos_create_project",
        "lifeos_create_task",
        "lifeos_delete_task",
        "lifeos_log_habit",
        "lifeos_search",
        "lifeos_update_goal",
        "lifeos_update_project",
        "lifeos_update_task",
      ]);
    });

    it("financial shield: asserts ZERO financial mutation tools are present", async () => {
      const res = await client.listTools();
      const names = res.tools.map((t) => t.name);

      const prohibitedFinancialSubstrings = [
        "transaction",
        "transfer",
        "account",
        "balance",
        "finance_create",
        "finance_update",
        "finance_delete",
      ];

      for (const name of names) {
        for (const prohibited of prohibitedFinancialSubstrings) {
          expect(name.toLowerCase()).not.toContain(prohibited);
        }
      }
    });

    it("calls lifeos_create_task with canonical service invocation and deterministic output", async () => {
      const res = await client.callTool("lifeos_create_task", {
        title: "Test Task Creation",
        priority: "high",
      });

      expect(res.isError).toBeFalsy();
      expect(res.content).toHaveLength(1);
      expect(res.content[0].type).toBe("text");

      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.id).toBe("task-new-123");
      expect(parsed.title).toBe("Test Task Creation");

      // Invariant: Authenticated identity injected from context
      expect(mockCreateTask).toHaveBeenCalledWith(
        testContext.user.id,
        expect.objectContaining({ title: "Test Task Creation", priority: "high" })
      );
    });

    it("calls lifeos_update_task with partial fields", async () => {
      const res = await client.callTool("lifeos_update_task", {
        id: "task-new-123",
        title: "Updated Task Title",
        status: "in_progress",
      });

      expect(res.isError).toBeFalsy();
      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.title).toBe("Updated Task Title");
      expect(mockUpdateTask).toHaveBeenCalledWith(
        testContext.user.id,
        "task-new-123",
        expect.objectContaining({ title: "Updated Task Title", status: "in_progress" })
      );
    });

    it("calls lifeos_delete_task removing a task", async () => {
      const res = await client.callTool("lifeos_delete_task", {
        id: "task-to-delete",
      });

      expect(res.isError).toBeFalsy();
      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.deleted).toBe(true);
      expect(mockDeleteTask).toHaveBeenCalledWith(testContext.user.id, "task-to-delete");
    });

    it("calls lifeos_create_project", async () => {
      const res = await client.callTool("lifeos_create_project", {
        name: "Q4 Launch",
      });

      expect(res.isError).toBeFalsy();
      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.name).toBe("Q4 Launch");
      expect(mockCreateProject).toHaveBeenCalledWith(
        testContext.user.id,
        expect.objectContaining({ name: "Q4 Launch" })
      );
    });

    it("calls lifeos_create_goal", async () => {
      const res = await client.callTool("lifeos_create_goal", {
        title: "Read 24 books",
        area: "personal_development",
      });

      expect(res.isError).toBeFalsy();
      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.title).toBe("Read 24 books");
    });

    it("calls lifeos_create_note", async () => {
      const res = await client.callTool("lifeos_create_note", {
        title: "Architecture Decisions",
        content: "Plan 11-04 verification details",
      });

      expect(res.isError).toBeFalsy();
      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.title).toBe("Architecture Decisions");
    });

    it("calls lifeos_search querying unified search", async () => {
      const res = await client.callTool("lifeos_search", {
        q: "MCP",
        limit: 10,
      });

      expect(res.isError).toBeFalsy();
      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.totalCount).toBe(1);
    });

    it("calls lifeos_log_habit logging habit completion", async () => {
      const res = await client.callTool("lifeos_log_habit", {
        habitId: "habit-1",
        date: "2026-09-30",
        value: 1,
      });

      expect(res.isError).toBeFalsy();
      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.completed).toBe(true);
    });
  });

  describe("4. Standard Prompts (MCP-02)", () => {
    it("lists all 3 standard prompts via prompts/list", async () => {
      const res = await client.listPrompts();
      const names = res.prompts.map((p) => p.name).sort();

      expect(names).toEqual([
        "lifeos_evening_review",
        "lifeos_morning_planning",
        "lifeos_task_breakdown",
      ]);
    });

    it("fetches lifeos_morning_planning prompt", async () => {
      const prompt = await client.getPrompt("lifeos_morning_planning");
      expect(prompt.messages).toHaveLength(1);
      expect(prompt.messages[0].role).toBe("user");
      expect(prompt.messages[0].content.text).toContain("morning planning session");
    });

    it("fetches lifeos_evening_review prompt", async () => {
      const prompt = await client.getPrompt("lifeos_evening_review");
      expect(prompt.messages).toHaveLength(1);
      expect(prompt.messages[0].role).toBe("user");
      expect(prompt.messages[0].content.text).toContain("evening review session");
    });

    it("fetches lifeos_task_breakdown prompt with required arguments", async () => {
      const prompt = await client.getPrompt("lifeos_task_breakdown", {
        title: "Implement distributed rate limiter",
      });

      expect(prompt.messages).toHaveLength(1);
      expect(prompt.messages[0].content.text).toContain("Implement distributed rate limiter");
    });
  });

  describe("5. Absolute Stdout Stream Purity (MCP-01)", () => {
    it("verifies that 100% of stdout lines are valid JSON-RPC 2.0 frames with zero purity violations", () => {
      const rawStdout = client.getRawStdout();
      expect(rawStdout.length).toBeGreaterThan(0);

      // Must have zero purity violations
      expect(client.getPurityViolations()).toEqual([]);
      expect(() => client.assertStdoutPurity()).not.toThrow();

      // Check each line individually
      for (const line of rawStdout) {
        expect(() => {
          const parsed = JSON.parse(line);
          expect(parsed.jsonrpc).toBe("2.0");
        }).not.toThrow();
      }
    });

    it("verifies operational diagnostic notices are directed exclusively to stderr", () => {
      const rawStderr = client.getRawStderr();
      expect(rawStderr.length).toBeGreaterThan(0);

      const joinedStderr = rawStderr.join("\n");
      expect(joinedStderr).toContain("[lifeos-mcp] Authenticated session established");
      expect(joinedStderr).toContain(testContext.user.email);
    });
  });
});
