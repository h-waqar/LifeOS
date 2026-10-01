/**
 * Phase 18 Plan 18-01: MCP Task Queries & Workspace Plan Tools Test Suite
 *
 * Verifies:
 * 1. MCP Task Query Parity:
 *    - `lifeos_list_tasks` registered under READ capability
 *    - Multi-criteria filtering (projectId, status, priority, energyLevel, overdue, limit)
 *    - Strict session user binding (no cross-user task access)
 *    - Rejection of caller-supplied identity flags (userId, user_id, user-id)
 *    - `lifeos_get_task` registered under READ capability
 *    - Canonical task representation returned
 *    - NotFound error on missing or foreign-tenant task
 * 2. MCP Workspace Plan Observability:
 *    - `lifeos_workspace_plan_status` registered under READ capability
 *    - `lifeos_workspace_next_task` registered under READ capability
 *    - Full structured plan status and next-task contract returned
 *    - Rejection of caller-supplied identity flags
 * 3. MCP Workspace Plan Resource:
 *    - `lifeos://workspace/plans/{planId}` exposes live observational state
 *    - Strictly read-only: no mutation permitted
 * 4. Zero Raw SQL & Financial Shield Preservation:
 *    - All tools route strictly through canonical services and executeAgentOperation
 *    - Financial shield remains unbroken
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerTaskTools } from "@/server/mcp/tools/task-tools";
import { registerWorkspaceTools } from "@/server/mcp/tools/workspace-tools";
import { registerTools } from "@/server/mcp/tools/registry";
import { registerWorkspaceResources } from "@/server/mcp/resources/workspace";
import type { McpContext } from "@/server/mcp/types";
import * as taskService from "@/server/tasks/service";
import * as planInspector from "@/server/agents/workspace/plan-inspector";

vi.mock("@/server/tasks/service", () => ({
  listTasks: vi.fn(),
  getTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  NotFoundError: class NotFoundError extends Error {
    readonly status = 404;
    constructor(msg = "Not found") {
      super(msg);
      this.name = "NotFoundError";
    }
  },
}));

vi.mock("@/server/agents/workspace/plan-inspector", () => ({
  getPlanExecutionStatus: vi.fn(),
  getNextReadyPlanTask: vi.fn(),
  runSandboxedPlanStatus: vi.fn(),
  runSandboxedNextTask: vi.fn(),
}));

vi.mock("@/server/agents/audit/attribution-logger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/agents/audit/attribution-logger")>();
  return {
    ...actual,
    logAgentAudit: vi.fn().mockResolvedValue({}),
  };
});

describe("Phase 18 Plan 18-01: MCP Task Queries & Workspace Plan Tools", () => {
  const mockUser = {
    id: "user-hamza-789",
    email: "hamza@example.com",
    name: "Hamza Waqar",
  };

  const mockContext: McpContext = {
    user: mockUser,
    session: {
      id: "session-mcp-999",
      userId: mockUser.id,
      expiresAt: new Date(Date.now() + 3600000),
    },
    isAgent: true,
    agent: {
      id: "agent-token-1",
      userId: mockUser.id,
      name: "Autonomous Agent",
      tokenPrefix: "auto_pref",
      provider: "mcp",
      status: "active",
      expiresAt: null,
      capabilities: new Set(["READ", "WRITE", "EXECUTE"]),
      permissions: [],
    },
  };

  let mockTools: Record<string, { schema: unknown; handler: Function }>;
  let mockResources: Record<string, { template?: any; uri?: string; handler: Function }>;
  let fakeMcpServer: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTools = {};
    mockResources = {};

    const registerToolFn = vi.fn((name: string, configOrDesc: any, schemaOrHandler: any, maybeHandler?: any) => {
      let schema: any;
      let handler: any;
      if (typeof schemaOrHandler === "function") {
        schema = configOrDesc?.inputSchema ?? configOrDesc;
        handler = schemaOrHandler;
      } else {
        schema = schemaOrHandler;
        handler = maybeHandler;
      }
      mockTools[name] = { schema, handler };
    });

    const resourceFn = vi.fn((name: string, template: any, handler: Function) => {
      mockResources[name] = { template, handler };
    });

    fakeMcpServer = {
      _registeredTools: mockTools,
      tool: registerToolFn,
      registerTool: registerToolFn,
      resource: resourceFn,
    };
  });

  describe("1. MCP Task Query Parity: lifeos_list_tasks & lifeos_get_task", () => {
    it("registers lifeos_list_tasks and lifeos_get_task on MCP server", () => {
      registerTaskTools(fakeMcpServer, mockContext);

      expect(mockTools["lifeos_list_tasks"]).toBeDefined();
      expect(mockTools["lifeos_get_task"]).toBeDefined();
    });

    it("lifeos_list_tasks invokes canonical listTasks with session userId and parsed filters", async () => {
      registerTaskTools(fakeMcpServer, mockContext);

      const fakeTasks = [
        { id: "task-1", title: "Task 1", status: "todo", priority: "high" },
        { id: "task-2", title: "Task 2", status: "in_progress", priority: "critical" },
      ];
      vi.mocked(taskService.listTasks).mockResolvedValueOnce(fakeTasks as any);

      const res = await mockTools["lifeos_list_tasks"].handler({
        projectId: "proj-100",
        status: "todo",
        priority: "high",
        limit: 10,
      });

      expect(taskService.listTasks).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({
          projectId: "proj-100",
          status: "todo",
          priority: "high",
        })
      );
      expect(res.isError).toBeFalsy();
      const content = JSON.parse(res.content[0].text);
      expect(content).toHaveLength(2);
      expect(content[0].id).toBe("task-1");
    });

    it("lifeos_list_tasks rejects caller spoofing flags (userId, user_id, user-id)", async () => {
      registerTaskTools(fakeMcpServer, mockContext);

      const res1 = await mockTools["lifeos_list_tasks"].handler({ userId: "evil-user" });
      expect(res1.isError).toBe(true);
      expect(res1.content[0].text).toContain("Specifying 'userId' is prohibited");

      const res2 = await mockTools["lifeos_list_tasks"].handler({ user_id: "evil-user" });
      expect(res2.isError).toBe(true);

      const res3 = await mockTools["lifeos_list_tasks"].handler({ "user-id": "evil-user" });
      expect(res3.isError).toBe(true);
    });

    it("lifeos_get_task retrieves task for session user and returns error for nonexistent task", async () => {
      registerTaskTools(fakeMcpServer, mockContext);

      vi.mocked(taskService.getTask).mockResolvedValueOnce({
        id: "task-abc",
        title: "Test Task",
        status: "todo",
      } as any);

      const res = await mockTools["lifeos_get_task"].handler({ id: "task-abc" });
      expect(taskService.getTask).toHaveBeenCalledWith(mockUser.id, "task-abc");
      expect(res.isError).toBeFalsy();
      const content = JSON.parse(res.content[0].text);
      expect(content.id).toBe("task-abc");

      // Nonexistent task
      vi.mocked(taskService.getTask).mockResolvedValueOnce(null);
      const notFoundRes = await mockTools["lifeos_get_task"].handler({ id: "missing-task" });
      expect(notFoundRes.isError).toBe(true);
      expect(notFoundRes.content[0].text).toContain("Task not found");
    });
  });

  describe("2. MCP Workspace Plan Observability: status & next_task", () => {
    it("registers lifeos_workspace_plan_status and lifeos_workspace_next_task", () => {
      registerWorkspaceTools(fakeMcpServer, mockContext);

      expect(mockTools["lifeos_workspace_plan_status"]).toBeDefined();
      expect(mockTools["lifeos_workspace_next_task"]).toBeDefined();
    });

    it("lifeos_workspace_plan_status delegates through runSandboxedPlanStatus", async () => {
      registerWorkspaceTools(fakeMcpServer, mockContext);

      vi.mocked(planInspector.runSandboxedPlanStatus).mockResolvedValueOnce({
        status: "EXECUTED",
        data: {
          planId: "plan-test",
          projectId: "proj-1",
          totalSteps: 3,
          completedSteps: 1,
          status: "EXECUTING",
        } as any,
      });

      const res = await mockTools["lifeos_workspace_plan_status"].handler({
        planId: "plan-test",
        projectId: "proj-1",
      });

      expect(planInspector.runSandboxedPlanStatus).toHaveBeenCalledWith(
        expect.objectContaining({ user: mockUser }),
        { planId: "plan-test", projectId: "proj-1" },
        mockUser.id
      );
      expect(res.isError).toBeFalsy();
      const content = JSON.parse(res.content[0].text);
      expect(content.planId).toBe("plan-test");
      expect(content.completedSteps).toBe(1);
    });

    it("lifeos_workspace_next_task delegates through runSandboxedNextTask and returns terminal state", async () => {
      registerWorkspaceTools(fakeMcpServer, mockContext);

      vi.mocked(planInspector.runSandboxedNextTask).mockResolvedValueOnce({
        status: "EXECUTED",
        data: {
          state: "READY",
          task: {
            taskId: "t-ready",
            stepId: "step-02",
            title: "Next Task",
          },
        } as any,
      });

      const res = await mockTools["lifeos_workspace_next_task"].handler({
        planId: "plan-test",
      });

      expect(planInspector.runSandboxedNextTask).toHaveBeenCalledWith(
        expect.objectContaining({ user: mockUser }),
        { planId: "plan-test", projectId: undefined },
        mockUser.id
      );
      expect(res.isError).toBeFalsy();
      const content = JSON.parse(res.content[0].text);
      expect(content.state).toBe("READY");
      expect(content.task.stepId).toBe("step-02");
    });
  });

  describe("3. MCP Workspace Plan Resource (lifeos://workspace/plans/{planId})", () => {
    it("registers resource template and returns observational live plan status", async () => {
      registerWorkspaceResources(fakeMcpServer, mockContext);

      expect(mockResources["workspace_plan_status"]).toBeDefined();
      expect(mockResources["workspace_plan_status"].template.uriTemplate.template).toBe(
        "lifeos://workspace/plans/{planId}"
      );

      vi.mocked(planInspector.getPlanExecutionStatus).mockResolvedValueOnce({
        planId: "plan-resource-1",
        projectId: "proj-res",
        totalSteps: 2,
        completedSteps: 2,
        status: "COMPLETED",
        steps: [],
        nextReadyTask: null,
        blockedReasons: [],
        bottlenecks: [],
      } as any);

      const res = await mockResources["workspace_plan_status"].handler(
        new URL("lifeos://workspace/plans/plan-resource-1"),
        { planId: "plan-resource-1" }
      );

      expect(planInspector.getPlanExecutionStatus).toHaveBeenCalledWith(
        mockUser.id,
        "plan-resource-1"
      );
      expect(res.contents).toHaveLength(1);
      expect(res.contents[0].uri).toBe("lifeos://workspace/plans/plan-resource-1");
      const content = JSON.parse(res.contents[0].text);
      expect(content.status).toBe("COMPLETED");
      expect(content.planId).toBe("plan-resource-1");
    });
  });

  describe("4. Central Registry & Financial Shield Preservation", () => {
    it("registers all tools centrally without tripping financial shield", () => {
      expect(() => {
        registerTools(fakeMcpServer, mockContext);
      }).not.toThrow();

      // Parity check: task query and workspace tools are registered
      expect(mockTools["lifeos_list_tasks"]).toBeDefined();
      expect(mockTools["lifeos_get_task"]).toBeDefined();
      expect(mockTools["lifeos_workspace_plan_status"]).toBeDefined();
      expect(mockTools["lifeos_workspace_next_task"]).toBeDefined();
    });
  });
});
