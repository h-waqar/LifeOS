/**
 * Plan 12-03: Skills & Documentation Retrieval End-to-End Integration Suite
 *
 * Verifies end-to-end integration across CLI and MCP servers:
 * 1. Protocol tool discovery: all 10 domain tools + 5 Phase 12 tools (15 total).
 * 2. Protocol resource discovery: personal graph resources + skills and planning resources.
 * 3. Real MCP tool execution:
 *    - lifeos_list_skills
 *    - lifeos_get_skill
 *    - lifeos_search_docs
 *    - lifeos_get_doc
 *    - lifeos_get_planning_state
 * 4. Real MCP resource reading:
 *    - lifeos://skills/list
 *    - lifeos://skills/task-breakdown
 *    - lifeos://docs/planning/state
 *    - lifeos://docs/planning/decisions
 * 5. CLI end-to-end command execution for skills and docs across human and JSON modes.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PassThrough } from "node:stream";
import { McpTestClient } from "../../phase-11/plan-04/mcp-test-client";
import { startStdioServer } from "@/server/mcp/transport";
import { runCli } from "@/cli/index";
import type { McpContext } from "@/server/mcp/types";

// Mock domain services that are touched during server creation
vi.mock("@/server/tasks/service", () => ({
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  listTasks: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/server/projects/service", () => ({
  createProject: vi.fn(),
  updateProject: vi.fn(),
  listProjects: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/server/goals/service", () => ({
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  listGoals: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/server/notes/service", () => ({
  createNote: vi.fn(),
}));
vi.mock("@/server/search/service", () => ({
  search: vi.fn().mockResolvedValue({ results: [], totalCount: 0 }),
}));
vi.mock("@/server/habits/service", () => ({
  logHabitEntry: vi.fn(),
}));
vi.mock("@/server/dashboard/service", () => ({
  getDashboardOverview: vi.fn().mockResolvedValue({
    metrics: {},
    priorities: { todayTasks: [] },
    goalsAndProjects: { activeGoals: [], activeProjects: [] },
    habits: [],
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
  getFinanceSummary: vi.fn().mockResolvedValue({
    netWorth: 100000,
    cashFlow: 2000,
  }),
}));
vi.mock("@/server/daily-plan/service", () => ({
  getDailyPlan: vi.fn().mockResolvedValue({ id: "dp-1", date: "2026-10-01" }),
}));
vi.mock("@/server/db", () => ({
  db: { select: vi.fn() },
  getDb: vi.fn(),
  closeDatabase: vi.fn().mockResolvedValue(undefined),
}));

describe("Plan 12-03: Skills & Docs Integration Suite", () => {
  let client: McpTestClient;
  let serverPromise: Promise<void>;
  let clientIn: PassThrough;
  let serverOut: PassThrough;
  let serverErr: PassThrough;

  const testContext: McpContext = {
    user: {
      id: "usr_integration_phase12",
      name: "Phase 12 Integration User",
      email: "integration12@lifeos.internal",
    },
    session: {
      id: "sess_integration_phase12",
      userId: "usr_integration_phase12",
      expiresAt: new Date(Date.now() + 86400000),
    },
  };

  beforeAll(async () => {
    clientIn = new PassThrough();
    serverOut = new PassThrough();
    serverErr = new PassThrough();

    client = new McpTestClient({ timeoutMs: 10000 });
    client.connectStreams(clientIn, serverOut, serverErr);

    serverPromise = startStdioServer(
      {
        stdin: clientIn as unknown as NodeJS.ReadStream,
        stdout: serverOut as unknown as NodeJS.WriteStream,
        stderr: serverErr as unknown as NodeJS.WriteStream,
      },
      testContext
    );

    // Initialize client
    await client.initialize({
      clientInfo: { name: "phase-12-test-client", version: "1.0.0" },
    });
    client.initialized();
  });

  afterAll(async () => {
    await client.close();
    clientIn.end();
    await serverPromise.catch(() => {});
  });

  describe("1. MCP Tool Registry & Capability Negotiation", () => {
    it("advertises all 15 approved tools (10 domain + 5 Phase 12 tools)", async () => {
      const res = await client.listTools();
      const names = res.tools.map((t) => t.name).sort();

      expect(names).toHaveLength(15);
      expect(names).toEqual([
        "lifeos_create_goal",
        "lifeos_create_note",
        "lifeos_create_project",
        "lifeos_create_task",
        "lifeos_delete_task",
        "lifeos_get_doc",
        "lifeos_get_planning_state",
        "lifeos_get_skill",
        "lifeos_list_skills",
        "lifeos_log_habit",
        "lifeos_search",
        "lifeos_search_docs",
        "lifeos_update_goal",
        "lifeos_update_project",
        "lifeos_update_task",
      ]);
    });

    it("verifies schemas of all Phase 12 MCP tools", async () => {
      const res = await client.listTools();
      const toolsMap = new Map(res.tools.map((t) => [t.name, t]));

      const listSkillsTool = toolsMap.get("lifeos_list_skills");
      expect(listSkillsTool).toBeDefined();
      expect(listSkillsTool?.description).toContain("skills");

      const getSkillTool = toolsMap.get("lifeos_get_skill");
      expect(getSkillTool).toBeDefined();
      expect(getSkillTool?.inputSchema.required).toContain("name");

      const searchDocsTool = toolsMap.get("lifeos_search_docs");
      expect(searchDocsTool).toBeDefined();
      expect(searchDocsTool?.inputSchema.required).toContain("q");

      const getDocTool = toolsMap.get("lifeos_get_doc");
      expect(getDocTool).toBeDefined();
      expect(getDocTool?.inputSchema.required).toContain("path");

      const getPlanningTool = toolsMap.get("lifeos_get_planning_state");
      expect(getPlanningTool).toBeDefined();
    });
  });

  describe("2. MCP Resource Discovery", () => {
    it("advertises Phase 12 static resources in resources/list", async () => {
      const res = await client.listResources();
      const uris = res.resources.map((r) => r.uri);

      expect(uris).toContain("lifeos://skills/list");
      expect(uris).toContain("lifeos://docs/planning/state");
      expect(uris).toContain("lifeos://docs/planning/decisions");
    });

    it("advertises Phase 12 dynamic resource template in resourceTemplates/list", async () => {
      const res = await client.sendRequest<{
        resourceTemplates: Array<{ uriTemplate: string }>;
      }>("resources/templates/list");
      expect(res.error).toBeUndefined();
      const uriTemplates = res.result?.resourceTemplates.map((t) => t.uriTemplate) ?? [];

      expect(uriTemplates).toContain("lifeos://skills/{name}");
    });
  });

  describe("3. Real Tool Execution via Stdio Protocol", () => {
    it("calls lifeos_list_skills returning curated skills", async () => {
      const res = await client.callTool("lifeos_list_skills", {});

      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.count).toBeGreaterThanOrEqual(4);
      const names = parsed.skills.map((s: { name: string }) => s.name);
      expect(names).toContain("task-breakdown");
      expect(names).toContain("goal-alignment");
      expect(names).toContain("weekly-review");
      expect(names).toContain("bug-remediation");
    });

    it("calls lifeos_get_skill returning complete instructions for task-breakdown", async () => {
      const res = await client.callTool("lifeos_get_skill", { name: "task-breakdown" });

      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.name).toBe("task-breakdown");
      expect(parsed.version).toBe("1.0.0");
      expect(parsed.body).toContain("Rule of 3–7");
      expect(parsed.verification_requirements.length).toBeGreaterThanOrEqual(1);
    });

    it("calls lifeos_search_docs returning ranked documentation results with snippets", async () => {
      const res = await client.callTool("lifeos_search_docs", {
        q: "Authentication Boundary",
      });

      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.count).toBeGreaterThanOrEqual(1);
      expect(parsed.results[0].snippet.length).toBeGreaterThan(10);
    });

    it("calls lifeos_get_doc returning sanitized markdown content", async () => {
      const res = await client.callTool("lifeos_get_doc", {
        path: "docs/security/auth-boundary.md",
      });

      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.path).toBe("docs/security/auth-boundary.md");
      expect(parsed.title).toContain("Authentication");
      expect(parsed.content).toContain("Threat Model");
    });

    it("calls lifeos_get_planning_state returning structured planning state and decisions", async () => {
      const stateRes = await client.callTool("lifeos_get_planning_state", {
        view: "state",
      });
      const stateData = JSON.parse(stateRes.content[0].text);
      expect(stateData.milestone).toBeDefined();
      expect(stateData.current_phase).toBeDefined();

      const decisionsRes = await client.callTool("lifeos_get_planning_state", {
        view: "decisions",
      });
      const decisionsData = JSON.parse(decisionsRes.content[0].text);
      expect(decisionsData.count).toBeGreaterThanOrEqual(2);
    });
  });

  describe("4. Real Resource Reading via Stdio Protocol", () => {
    it("reads lifeos://skills/list returning catalog", async () => {
      const res = await client.readResource("lifeos://skills/list");
      expect(res.contents).toHaveLength(1);
      expect(res.contents[0].mimeType).toBe("application/json");

      const parsed = JSON.parse(res.contents[0].text!);
      expect(parsed.count).toBeGreaterThanOrEqual(4);
    });

    it("reads lifeos://skills/task-breakdown via template resolution", async () => {
      const res = await client.readResource("lifeos://skills/task-breakdown");
      expect(res.contents).toHaveLength(1);

      const parsed = JSON.parse(res.contents[0].text!);
      expect(parsed.name).toBe("task-breakdown");
    });

    it("reads lifeos://docs/planning/state", async () => {
      const res = await client.readResource("lifeos://docs/planning/state");
      expect(res.contents).toHaveLength(1);

      const parsed = JSON.parse(res.contents[0].text!);
      expect(parsed.milestone).toBeDefined();
    });

    it("reads lifeos://docs/planning/decisions", async () => {
      const res = await client.readResource("lifeos://docs/planning/decisions");
      expect(res.contents).toHaveLength(1);

      const parsed = JSON.parse(res.contents[0].text!);
      expect(parsed.count).toBeGreaterThanOrEqual(2);
    });
  });

  describe("5. CLI Command Invocations via runCli", () => {
    it("executes 'lifeos skills list --json' returning exit code 0", async () => {
      const exitCode = await runCli(["skills", "list", "--json"]);
      expect(exitCode).toBe(0);
    });

    it("executes 'lifeos skills get task-breakdown --json' returning exit code 0", async () => {
      const exitCode = await runCli(["skills", "get", "task-breakdown", "--json"]);
      expect(exitCode).toBe(0);
    });

    it("executes 'lifeos skills match \"break down task\" --json' returning exit code 0", async () => {
      const exitCode = await runCli(["skills", "match", "break down task", "--json"]);
      expect(exitCode).toBe(0);
    });

    it("executes 'lifeos docs search \"security\" --json' returning exit code 0", async () => {
      const exitCode = await runCli(["docs", "search", "security", "--json"]);
      expect(exitCode).toBe(0);
    });

    it("executes 'lifeos docs get docs/security/auth-boundary.md --json' returning exit code 0", async () => {
      const exitCode = await runCli(["docs", "get", "docs/security/auth-boundary.md", "--json"]);
      expect(exitCode).toBe(0);
    });

    it("executes 'lifeos docs planning status --json' returning exit code 0", async () => {
      const exitCode = await runCli(["docs", "planning", "status", "--json"]);
      expect(exitCode).toBe(0);
    });

    it("executes 'lifeos docs planning decisions --json' returning exit code 0", async () => {
      const exitCode = await runCli(["docs", "planning", "decisions", "--json"]);
      expect(exitCode).toBe(0);
    });
  });
});
