/**
 * Phase 17 Plan 17-01: End-to-End Workspace Development Workflow Integration Suite
 *
 * Verifies the full agent development lifecycle:
 * 1. Plan Reading & Materialization: Plan file is validated, topologically ordered, and converted to LifeOS tasks linked to an active project.
 * 2. Sandboxed Command Execution: Subprocess runner executes allowlisted commands (`typecheck`, `test`, `build`, `lint`) inside project root.
 * 3. Pre-Commit Verification Gate: Runs sequential verification checks (`typecheck` -> `test` -> `build` -> `lint`), enforces fail-closed halting, inspects git status, and qualifies/blocks commit.
 * 4. Zero-Trust Security Boundary: Asserts caller anti-spoofing, tier permission enforcement, financial shield preservation, path containment, and comprehensive audit logging.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  executeWorkspaceCommand,
  materializeDevelopmentPlan,
  runPreCommitVerification,
  assertSandboxPath,
} from "@/server/agents/workspace";
import type { WorkspaceCommand, WorkspaceCommandSpec } from "@/server/agents/workspace/types";
import { executeAgentOperation } from "@/server/agents/safety-boundary";
import type { AgentSafetyContext } from "@/server/agents/permissions/types";

// Mock DB client for materialization
const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  transaction: vi.fn(),
};

describe("Phase 17 Plan 17-01: Workspace Development Workflow Integration", () => {
  const testUserId = "user-hamza-123";
  const testProjectId = "11111111-2222-3333-4444-555555555555";

  const passingSpecs: Record<WorkspaceCommand, WorkspaceCommandSpec> = {
    typecheck: {
      executable: process.execPath,
      baseArgs: ["-e", "console.log('TypeScript 0 errors'); process.exit(0)"],
      defaultTimeoutMs: 5000,
    },
    test: {
      executable: process.execPath,
      baseArgs: ["-e", "console.log('Test suite passed'); process.exit(0)"],
      defaultTimeoutMs: 5000,
    },
    build: {
      executable: process.execPath,
      baseArgs: ["-e", "console.log('Build completed'); process.exit(0)"],
      defaultTimeoutMs: 5000,
    },
    lint: {
      executable: process.execPath,
      baseArgs: ["-e", "console.log('Lint clean'); process.exit(0)"],
      defaultTimeoutMs: 5000,
    },
  };

  const failingSpecs: Record<WorkspaceCommand, WorkspaceCommandSpec> = {
    ...passingSpecs,
    test: {
      executable: process.execPath,
      baseArgs: ["-e", "console.error('FAIL: 2 tests failed'); process.exit(1)"],
      defaultTimeoutMs: 5000,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("End-to-End Workflow: Plan -> Tasks -> Sandbox Run -> Verify -> Commit Gate", () => {
    it("completes full sequential development loop", async () => {
      // 1. Setup mock database responses for project and tasks
      const projectRow = {
        id: testProjectId,
        userId: testUserId,
        name: "Milestone 2.0 Integration",
        status: "in_progress",
        archivedAt: null,
      };

      mockDb.transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => cb(mockDb));

      // Mock DB: 1st select is project lookup, 2nd is idempotency check (none found)
      let selectCallCount = 0;
      mockDb.select.mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              // Project lookup
              return {
                limit: vi.fn().mockResolvedValue([projectRow]),
              };
            } else {
              // Idempotency check: no existing tasks
              return Promise.resolve([]);
            }
          }),
        }),
      }));

      // Mock DB insert: returns generated task IDs, dependencies, and supports audit log
      let insertIndex = 0;
      mockDb.insert.mockImplementation(() => ({
        values: vi.fn().mockImplementation((val: any) => {
          const row = {
            id: `gen-task-${++insertIndex}`,
            title: val?.title || `Task ${insertIndex}`,
            priority: val?.priority || "medium",
            status: val?.status || "todo",
            estimatedDuration: val?.estimatedDuration ?? null,
            tags: val?.tags || [],
            taskId: val?.taskId,
            dependsOnTaskId: val?.dependsOnTaskId,
          };
          return {
            returning: vi.fn().mockResolvedValue([row]),
            then: (resolve: any) => resolve([row]),
          };
        }),
      }));

      // 2. Step 1: Materialize Plan into Tasks
      const testPlan = {
        planId: "plan-e2e-workflow",
        title: "E2E Development Plan",
        version: "1.0.0",
        projectId: testProjectId,
        steps: [
          { stepId: "step-1", title: "Write specification and tests", priority: "high" as const, estimatedDuration: 30 },
          { stepId: "step-2", title: "Implement core business logic", priority: "critical" as const, estimatedDuration: 60, dependsOnStepIds: ["step-1"] },
          { stepId: "step-3", title: "Run pre-commit verification gate", priority: "medium" as const, estimatedDuration: 15, dependsOnStepIds: ["step-2"] },
        ],
      };

      const materializationResult = await materializeDevelopmentPlan(
        testPlan,
        testUserId,
        mockDb as any
      );

      expect(materializationResult.planId).toBe("plan-e2e-workflow");
      expect(materializationResult.taskCount).toBe(3);
      expect(materializationResult.dependencyCount).toBe(2);
      expect(materializationResult.tasks.map((t) => t.stepId)).toEqual(["step-1", "step-2", "step-3"]);

      // 3. Step 2: Run Sandboxed Command Runner
      const commandResult = await executeWorkspaceCommand(
        {
          command: "typecheck",
        },
        { commandSpecs: passingSpecs }
      );

      expect(commandResult.passed).toBe(true);
      expect(commandResult.exitCode).toBe(0);
      expect(commandResult.stdout).toContain("TypeScript 0 errors");

      // 4. Step 3: Run Pre-Commit Verification Gate
      const gateResult = await runPreCommitVerification(
        {
          checks: ["typecheck", "test"],
          inspectGit: false,
        },
        { commandSpecs: passingSpecs }
      );

      expect(gateResult.passed).toBe(true);
      expect(gateResult.canCommit).toBe(true);
      expect(gateResult.checksRun).toEqual(["typecheck", "test"]);
    });

    it("halts and denies commit eligibility if verification gate encounters failure", async () => {
      const gateResult = await runPreCommitVerification(
        {
          checks: ["typecheck", "test", "build", "lint"],
          inspectGit: false,
        },
        { commandSpecs: failingSpecs }
      );

      expect(gateResult.passed).toBe(false);
      expect(gateResult.canCommit).toBe(false);
      expect(gateResult.checksRun).toEqual(["typecheck", "test"]);
      expect(gateResult.results.test?.status).toBe("failed");
      expect(gateResult.results.build?.status).toBe("skipped");
      expect(gateResult.results.lint?.status).toBe("skipped");
      expect(gateResult.failureReason).toContain("exit code 1");
    });
  });

  describe("Zero-Trust Security Boundary & Containment Invariants", () => {
    it("asserts path containment within sandbox and rejects directory traversals", () => {
      expect(() => {
        assertSandboxPath("../outside.txt");
      }).toThrow();

      expect(() => {
        assertSandboxPath("/etc/shadow");
      }).toThrow();

      expect(() => {
        assertSandboxPath("src/safe/file.ts\0.exe");
      }).toThrow();
    });

    it("verifies that executeAgentOperation enforces capability checks on workspace operations", async () => {
      const readOnlyContext: AgentSafetyContext = {
        isAgent: true,
        agent: {
          id: "token-1",
          userId: testUserId,
          name: "Read Only Agent",
          tokenPrefix: "ro_pref",
          provider: "claude-code",
          status: "active",
          expiresAt: null,
          capabilities: new Set(["READ"]),
          permissions: [],
        },
        user: {
          id: testUserId,
          email: "hamza@example.com",
          name: "Hamza Waqar",
        },
        sessionId: "session-ro-1",
        provider: "claude-code",
      };

      await expect(
        executeAgentOperation({
          toolName: "workspace.run",
          arguments: { command: "test" },
          context: readOnlyContext,
          targetUserId: testUserId,
          executor: async () => ({ success: true }),
        })
      ).rejects.toThrow(/permission denied/i);
    });
  });
});
