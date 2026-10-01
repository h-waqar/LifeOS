/**
 * Phase 17 Plan 17-01: Workspace MCP Tools Test Suite
 *
 * Verifies that the Model Context Protocol server registers workspace tools:
 * - lifeos_workspace_run
 * - lifeos_workspace_verify
 * - lifeos_workspace_materialize_plan
 *
 * Checks:
 * - Tool registration in MCP registry
 * - Parameter validation via Zod schemas
 * - Zero financial mutation assertion preserved (financial shield)
 * - Safe delegation to canonical runSandboxed* services with McpContext
 * - Error handling and structured tool responses
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerWorkspaceTools } from "@/server/mcp/tools/workspace-tools";
import { registerTools } from "@/server/mcp/tools/registry";
import * as workspaceModule from "@/server/agents/workspace";
import type { McpContext } from "@/server/mcp/types";

vi.mock("@/server/agents/workspace", async (importOriginal) => {
  const actual = await importOriginal<typeof workspaceModule>();
  return {
    ...actual,
    runSandboxedWorkspaceCommand: vi.fn(),
    runSandboxedPreCommitVerification: vi.fn(),
    runSandboxedPlanMaterialization: vi.fn(),
  };
});

describe("Phase 17 Plan 17-01: Workspace MCP Tools", () => {
  const mockUser = {
    id: "user-456",
    email: "hamza@example.com",
    name: "Hamza Waqar",
  };
  const mockContext: McpContext = {
    user: mockUser,
    session: {
      id: "mcp-session-123",
      userId: mockUser.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    },
    isAgent: true,
  };

  let mockTools: Record<string, { schema: unknown; handler: Function }>;
  let fakeMcpServer: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTools = {};
    const registerFn = vi.fn((name: string, configOrDesc: any, schemaOrHandler: any, maybeHandler?: any) => {
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

    fakeMcpServer = {
      _registeredTools: mockTools,
      tool: registerFn,
      registerTool: registerFn,
    };
  });

  describe("Tool Registration & Financial Shield", () => {
    it("registers all 3 workspace tools on the MCP server", () => {
      registerWorkspaceTools(fakeMcpServer, mockContext);

      expect(mockTools["lifeos_workspace_run"]).toBeDefined();
      expect(mockTools["lifeos_workspace_verify"]).toBeDefined();
      expect(mockTools["lifeos_workspace_materialize_plan"]).toBeDefined();
    });

    it("registers workspace tools through central registerTools without tripping the financial shield", () => {
      expect(() => {
        registerTools(fakeMcpServer, mockContext);
      }).not.toThrow();

      expect(mockTools["lifeos_workspace_run"]).toBeDefined();
      expect(mockTools["lifeos_workspace_verify"]).toBeDefined();
      expect(mockTools["lifeos_workspace_materialize_plan"]).toBeDefined();
    });
  });

  describe("Tool Execution: 'lifeos_workspace_run'", () => {
    it("delegates to runSandboxedWorkspaceCommand with validated args", async () => {
      registerWorkspaceTools(fakeMcpServer, mockContext);

      vi.mocked(workspaceModule.runSandboxedWorkspaceCommand).mockResolvedValueOnce({
        command: "typecheck",
        exitCode: 0,
        stdout: "clean",
        stderr: "",
        durationMs: 150,
        passed: true,
        summary: "Typecheck passed in 150ms",
        timedOut: false,
        stdoutTruncated: false,
        stderrTruncated: false,
      } as any);

      const tool = mockTools["lifeos_workspace_run"];
      const response = await tool.handler({ command: "typecheck", timeoutMs: 30000 });

      expect(workspaceModule.runSandboxedWorkspaceCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ id: "user-456" }),
        }),
        expect.objectContaining({
          command: "typecheck",
          timeoutMs: 30000,
        }),
        "user-456"
      );

      expect(response.content[0].type).toBe("text");
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.passed).toBe(true);
      expect(parsed.command).toBe("typecheck");
    });

    it("handles execution failure and returns structured error response without crashing MCP transport", async () => {
      registerWorkspaceTools(fakeMcpServer, mockContext);

      vi.mocked(workspaceModule.runSandboxedWorkspaceCommand).mockRejectedValueOnce(
        new workspaceModule.WorkspaceSecurityError("Prohibited command")
      );

      const tool = mockTools["lifeos_workspace_run"];
      const response = await tool.handler({ command: "test" });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain("Prohibited command");
    });
  });

  describe("Tool Execution: 'lifeos_workspace_verify'", () => {
    it("delegates to runSandboxedPreCommitVerification and returns gate summary", async () => {
      registerWorkspaceTools(fakeMcpServer, mockContext);

      vi.mocked(workspaceModule.runSandboxedPreCommitVerification).mockResolvedValueOnce({
        started: true,
        passed: true,
        canCommit: true,
        totalDurationMs: 400,
        checksRun: ["typecheck", "test", "build", "lint"],
        checksPassed: ["typecheck", "test", "build", "lint"],
        checksFailed: [],
        checksSkipped: [],
        results: [
          { command: "typecheck", status: "passed", exitCode: 0, durationMs: 100, stdout: "", stderr: "", summary: "ok", timedOut: false },
          { command: "test", status: "passed", exitCode: 0, durationMs: 100, stdout: "", stderr: "", summary: "ok", timedOut: false },
          { command: "build", status: "passed", exitCode: 0, durationMs: 100, stdout: "", stderr: "", summary: "ok", timedOut: false },
          { command: "lint", status: "passed", exitCode: 0, durationMs: 100, stdout: "", stderr: "", summary: "ok", timedOut: false },
        ],
        gitStatus: { clean: true, hasStagedChanges: false, hasUnstagedChanges: false, untrackedCount: 0, conflictDetected: false, summary: "clean" },
        failureReason: null,
        auditLogged: true,
      } as any);

      const tool = mockTools["lifeos_workspace_verify"];
      const response = await tool.handler({ checks: ["typecheck", "test"] });

      expect(workspaceModule.runSandboxedPreCommitVerification).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ id: "user-456" }),
        }),
        expect.objectContaining({
          checks: ["typecheck", "test"],
        }),
        "user-456"
      );

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.canCommit).toBe(true);
      expect(parsed.passed).toBe(true);
    });
  });

  describe("Tool Execution: 'lifeos_workspace_materialize_plan'", () => {
    it("delegates to runSandboxedPlanMaterialization and returns created task graph", async () => {
      registerWorkspaceTools(fakeMcpServer, mockContext);

      vi.mocked(workspaceModule.runSandboxedPlanMaterialization).mockResolvedValueOnce({
        success: true,
        planId: "mcp-plan-1",
        version: "1.0.0",
        projectId: "11111111-1111-4111-a111-111111111111",
        taskCount: 1,
        dependencyCount: 0,
        tasks: [{ taskId: "t-1", stepId: "s-1", title: "Step 1", priority: "high", estimatedDuration: null, status: "todo", tags: [] }],
        dependencies: [],
        idempotent: false,
        auditLogged: true,
      } as any);

      const tool = mockTools["lifeos_workspace_materialize_plan"];
      const response = await tool.handler({
        projectId: "11111111-1111-4111-a111-111111111111",
        plan: {
          planId: "mcp-plan-1",
          title: "MCP Plan",
          steps: [{ stepId: "s-1", title: "Step 1" }],
        },
      });

      expect(workspaceModule.runSandboxedPlanMaterialization).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ id: "user-456" }),
        }),
        expect.objectContaining({
          projectId: "11111111-1111-4111-a111-111111111111",
          plan: expect.objectContaining({ planId: "mcp-plan-1" }),
        }),
        "user-456"
      );

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.planId).toBe("mcp-plan-1");
      expect(parsed.taskCount).toBe(1);
    });
  });
});
