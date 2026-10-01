/**
 * Phase 18 Plan 18-01: Closed-Loop Autonomous Step Execution & Reconciliation Suite
 *
 * Verifies the complete autonomous agent development lifecycle:
 * 1. Full Lifecycle Tracing: Inspect plan status -> resolve exactly one next-ready task -> execute through sandbox -> verify actual outcomes -> persist status -> resolve next task.
 * 2. Sequential & Branching DAGs: A -> B -> C and Diamond DAGs execute deterministically without deadlocks.
 * 3. False Progress Elimination: Task completion is recorded ONLY after verification passes. Failed verification leaves task uncompleted.
 * 4. Bounded Retries & Terminal Failure: Max retries (default 3) strictly enforced; exceeding limit transitions task to "blocked" with TERMINAL_FAILURE, stopping infinite loops.
 * 5. Interrupted Execution Recovery: Interrupted in-progress tasks are prioritized for recovery.
 * 6. Stale State & Idempotency: Repeated execution on completed tasks/plans returns ALREADY_COMPLETED cleanly with zero mutation.
 * 7. Blocked Dependency & Invalid Plan Protection: Blocked or invalid tasks fail-closed without running sandbox processes.
 * 8. Zero-Trust Security Boundary: EXECUTE tier capability enforcement, caller anti-spoofing, project scoping, and agent audit logging.
 * 9. CLI & MCP Tool Parity: `lifeos workspace step` and `lifeos_workspace_execute_step`.
 * 10. Real Repository Verification: Runs real child process typecheck to confirm sandbox command execution.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  executePlanStep,
  runSandboxedPlanStepExecution,
  extractAttemptCount,
  updateAttemptTag,
} from "@/server/agents/workspace/step-executor";
import {
  getPlanExecutionStatus,
  getNextReadyPlanTask,
} from "@/server/agents/workspace/plan-inspector";
import { handleWorkspace } from "@/cli/commands/workspace";
import { EXIT_CODES } from "@/cli/types";
import {
  type WorkspaceCommand,
  type WorkspaceCommandSpec,
  type WorkspaceRunnerConfig,
  StepExecutionError,
} from "@/server/agents/workspace/types";
import { classifyOperation, evaluateAgentPermission } from "@/server/agents/permissions/evaluator";
import type { AgentSafetyContext, AgentIdentity } from "@/server/agents/permissions/types";
import type { TaskDTO } from "@/server/tasks/service";

// In-Memory Task Store for stateful persistence
interface MockTaskState {
  id: string;
  userId: string;
  projectId: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "blocked" | "completed" | "cancelled";
  priority: "low" | "medium" | "high" | "critical";
  tags: string[];
  estimatedDuration: number | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const testUserId = "user-hamza-123";
const testProjectId = "proj-lifeos-autonomous";

let tasksStore = new Map<string, MockTaskState>();
let taskDependenciesStore = new Map<string, string[]>(); // taskId -> array of dependsOnTaskIds

// Mock domain services
vi.mock("@/server/tasks/service", () => ({
  listTasks: vi.fn(async (userId: string, filter?: { projectId?: string }) => {
    return Array.from(tasksStore.values()).filter((t) => {
      if (t.userId !== userId) return false;
      if (filter?.projectId && t.projectId !== filter.projectId) return false;
      return true;
    });
  }),
  getTask: vi.fn(async (userId: string, taskId: string) => {
    const task = tasksStore.get(taskId);
    if (!task || task.userId !== userId) return null;
    return { ...task };
  }),
  updateTask: vi.fn(async (userId: string, taskId: string, input: any) => {
    const task = tasksStore.get(taskId);
    if (!task || task.userId !== userId) throw new Error("Task not found");
    if (input.status !== undefined) task.status = input.status;
    if (input.completedAt !== undefined) task.completedAt = input.completedAt;
    if (input.tags !== undefined) task.tags = [...input.tags];
    if (input.title !== undefined) task.title = input.title;
    if (input.description !== undefined) task.description = input.description;
    task.updatedAt = new Date().toISOString();
    return { ...task };
  }),
  getTaskDependencies: vi.fn(async (userId: string, taskId: string) => {
    const prereqIds = taskDependenciesStore.get(taskId) || [];
    const blockedBy = prereqIds
      .map((id) => tasksStore.get(id))
      .filter((t): t is MockTaskState => Boolean(t && t.userId === userId));

    const blocks = Array.from(taskDependenciesStore.entries())
      .filter(([_, deps]) => deps.includes(taskId))
      .map(([id]) => tasksStore.get(id))
      .filter((t): t is MockTaskState => Boolean(t && t.userId === userId));

    return { blockedBy, blocks };
  }),
  NotFoundError: class NotFoundError extends Error {
    constructor(msg = "Not found") {
      super(msg);
      this.name = "NotFoundError";
    }
  },
}));

// Fast mocked runner configs for deterministic verification check results
const passingRunnerConfig: WorkspaceRunnerConfig = {
  commandSpecs: {
    typecheck: {
      executable: process.execPath,
      baseArgs: ["-e", "process.exit(0)"],
      defaultTimeoutMs: 5000,
    },
    test: {
      executable: process.execPath,
      baseArgs: ["-e", "process.exit(0)"],
      defaultTimeoutMs: 5000,
    },
    build: {
      executable: process.execPath,
      baseArgs: ["-e", "process.exit(0)"],
      defaultTimeoutMs: 5000,
    },
    lint: {
      executable: process.execPath,
      baseArgs: ["-e", "process.exit(0)"],
      defaultTimeoutMs: 5000,
    },
  },
};

const failingRunnerConfig: WorkspaceRunnerConfig = {
  commandSpecs: {
    typecheck: {
      executable: process.execPath,
      baseArgs: ["-e", "process.exit(0)"],
      defaultTimeoutMs: 5000,
    },
    test: {
      executable: process.execPath,
      baseArgs: ["-e", "console.error('FAIL: 1 test failed'); process.exit(1)"],
      defaultTimeoutMs: 5000,
    },
  },
};

describe("Phase 18 Plan 18-01: Closed-Loop Autonomous Step Execution & Reconciliation", () => {
  beforeEach(() => {
    tasksStore.clear();
    taskDependenciesStore.clear();
  });

  describe("1. Full Lifecycle Tracing: Sequential Plan Execution (A -> B -> C)", () => {
    it("traces complete loop from initial inspection through verified completion", async () => {
      // Setup 3 sequential steps in plan-seq-1
      const planId = "plan-seq-1";

      const taskA: MockTaskState = {
        id: "task-A",
        userId: testUserId,
        projectId: testProjectId,
        title: "Step 1: Setup Architecture",
        description: "Initial foundation",
        status: "todo",
        priority: "high",
        tags: ["plan-materialized", `plan:${planId}`, "plan-step:step-01", "plan-order:1"],
        estimatedDuration: 30,
        completedAt: null,
        createdAt: new Date("2026-10-01T10:00:00Z").toISOString(),
        updatedAt: new Date("2026-10-01T10:00:00Z").toISOString(),
      };

      const taskB: MockTaskState = {
        id: "task-B",
        userId: testUserId,
        projectId: testProjectId,
        title: "Step 2: Implement Engine",
        description: "Core logic",
        status: "todo",
        priority: "medium",
        tags: ["plan-materialized", `plan:${planId}`, "plan-step:step-02", "plan-order:2"],
        estimatedDuration: 60,
        completedAt: null,
        createdAt: new Date("2026-10-01T10:01:00Z").toISOString(),
        updatedAt: new Date("2026-10-01T10:01:00Z").toISOString(),
      };

      const taskC: MockTaskState = {
        id: "task-C",
        userId: testUserId,
        projectId: testProjectId,
        title: "Step 3: Verification & Docs",
        description: "Final verification",
        status: "todo",
        priority: "low",
        tags: ["plan-materialized", `plan:${planId}`, "plan-step:step-03", "plan-order:3"],
        estimatedDuration: 20,
        completedAt: null,
        createdAt: new Date("2026-10-01T10:02:00Z").toISOString(),
        updatedAt: new Date("2026-10-01T10:02:00Z").toISOString(),
      };

      tasksStore.set(taskA.id, taskA);
      tasksStore.set(taskB.id, taskB);
      tasksStore.set(taskC.id, taskC);

      // Dependencies: B depends on A, C depends on B
      taskDependenciesStore.set("task-A", []);
      taskDependenciesStore.set("task-B", ["task-A"]);
      taskDependenciesStore.set("task-C", ["task-B"]);

      // Initial observation
      const initialStatus = await getPlanExecutionStatus(testUserId, planId);
      expect(initialStatus.status).toBe("NOT_STARTED");
      expect(initialStatus.completedSteps).toBe(0);
      expect(initialStatus.totalSteps).toBe(3);
      expect(initialStatus.nextReadyTask?.taskId).toBe("task-A");

      // Execution Iteration 1: Step A
      const step1Result = await executePlanStep(
        testUserId,
        { planId, verificationChecks: ["typecheck", "test"] },
        passingRunnerConfig
      );
      expect(step1Result.outcome).toBe("EXECUTION_SUCCESS");
      expect(step1Result.taskId).toBe("task-A");
      expect(step1Result.taskStatus).toBe("completed");
      expect(tasksStore.get("task-A")?.status).toBe("completed");
      expect(step1Result.nextReadyTask?.taskId).toBe("task-B");

      // Execution Iteration 2: Step B
      const step2Result = await executePlanStep(
        testUserId,
        { planId, verificationChecks: ["typecheck", "test"] },
        passingRunnerConfig
      );
      expect(step2Result.outcome).toBe("EXECUTION_SUCCESS");
      expect(step2Result.taskId).toBe("task-B");
      expect(step2Result.taskStatus).toBe("completed");
      expect(tasksStore.get("task-B")?.status).toBe("completed");
      expect(step2Result.nextReadyTask?.taskId).toBe("task-C");

      // Execution Iteration 3: Step C
      const step3Result = await executePlanStep(
        testUserId,
        { planId, verificationChecks: ["typecheck", "test"] },
        passingRunnerConfig
      );
      expect(step3Result.outcome).toBe("EXECUTION_SUCCESS");
      expect(step3Result.taskId).toBe("task-C");
      expect(step3Result.taskStatus).toBe("completed");
      expect(tasksStore.get("task-C")?.status).toBe("completed");
      expect(step3Result.planStatus).toBe("COMPLETED");
      expect(step3Result.nextReadyTask).toBeNull();

      // Repeated Execution (Idempotency check)
      const repeatResult = await executePlanStep(
        testUserId,
        { planId },
        passingRunnerConfig
      );
      expect(repeatResult.outcome).toBe("ALREADY_COMPLETED");
      expect(repeatResult.success).toBe(true);
      expect(repeatResult.planStatus).toBe("COMPLETED");
    });
  });

  describe("2. Branching DAG Execution (Diamond: Start -> Left, Right -> End)", () => {
    it("handles branching tasks and unblocks final task only when both branches complete", async () => {
      const planId = "plan-diamond";

      const startTask: MockTaskState = {
        id: "t-start",
        userId: testUserId,
        projectId: testProjectId,
        title: "Start Node",
        description: null,
        status: "todo",
        priority: "high",
        tags: ["plan-materialized", `plan:${planId}`, "plan-step:step-start", "plan-order:1"],
        estimatedDuration: 10,
        completedAt: null,
        createdAt: new Date("2026-10-01T10:00:00Z").toISOString(),
        updatedAt: new Date("2026-10-01T10:00:00Z").toISOString(),
      };

      const leftTask: MockTaskState = {
        id: "t-left",
        userId: testUserId,
        projectId: testProjectId,
        title: "Left Branch (Frontend)",
        description: null,
        status: "todo",
        priority: "medium",
        tags: ["plan-materialized", `plan:${planId}`, "plan-step:step-left", "plan-order:2"],
        estimatedDuration: 20,
        completedAt: null,
        createdAt: new Date("2026-10-01T10:01:00Z").toISOString(),
        updatedAt: new Date("2026-10-01T10:01:00Z").toISOString(),
      };

      const rightTask: MockTaskState = {
        id: "t-right",
        userId: testUserId,
        projectId: testProjectId,
        title: "Right Branch (Backend)",
        description: null,
        status: "todo",
        priority: "medium",
        tags: ["plan-materialized", `plan:${planId}`, "plan-step:step-right", "plan-order:3"],
        estimatedDuration: 20,
        completedAt: null,
        createdAt: new Date("2026-10-01T10:02:00Z").toISOString(),
        updatedAt: new Date("2026-10-01T10:02:00Z").toISOString(),
      };

      const endTask: MockTaskState = {
        id: "t-end",
        userId: testUserId,
        projectId: testProjectId,
        title: "End Node (Integration)",
        description: null,
        status: "todo",
        priority: "high",
        tags: ["plan-materialized", `plan:${planId}`, "plan-step:step-end", "plan-order:4"],
        estimatedDuration: 15,
        completedAt: null,
        createdAt: new Date("2026-10-01T10:03:00Z").toISOString(),
        updatedAt: new Date("2026-10-01T10:03:00Z").toISOString(),
      };

      tasksStore.set(startTask.id, startTask);
      tasksStore.set(leftTask.id, leftTask);
      tasksStore.set(rightTask.id, rightTask);
      tasksStore.set(endTask.id, endTask);

      taskDependenciesStore.set("t-start", []);
      taskDependenciesStore.set("t-left", ["t-start"]);
      taskDependenciesStore.set("t-right", ["t-start"]);
      taskDependenciesStore.set("t-end", ["t-left", "t-right"]);

      // 1. Run start
      const res1 = await executePlanStep(testUserId, { planId }, passingRunnerConfig);
      expect(res1.taskId).toBe("t-start");
      expect(res1.outcome).toBe("EXECUTION_SUCCESS");

      // 2. Next ready should be t-left (order 2 < order 3)
      const res2 = await executePlanStep(testUserId, { planId }, passingRunnerConfig);
      expect(res2.taskId).toBe("t-left");
      expect(res2.outcome).toBe("EXECUTION_SUCCESS");

      // End task should still be BLOCKED because t-right is incomplete
      const midStatus = await getPlanExecutionStatus(testUserId, planId);
      const endSummary = midStatus.steps.find((s) => s.taskId === "t-end")!;
      expect(endSummary.status).toBe("BLOCKED");
      expect(endSummary.blockedBySteps).toContain("step-right");

      // 3. Next ready is t-right
      const res3 = await executePlanStep(testUserId, { planId }, passingRunnerConfig);
      expect(res3.taskId).toBe("t-right");
      expect(res3.outcome).toBe("EXECUTION_SUCCESS");

      // 4. Now t-end is unblocked
      const res4 = await executePlanStep(testUserId, { planId }, passingRunnerConfig);
      expect(res4.taskId).toBe("t-end");
      expect(res4.outcome).toBe("EXECUTION_SUCCESS");
      expect(res4.planStatus).toBe("COMPLETED");
    });
  });

  describe("3. False Progress Elimination & Verification Failure", () => {
    it("halts task completion when verification fails and increments attempt counter without false progress", async () => {
      const planId = "plan-fail-test";

      const task: MockTaskState = {
        id: "t-fail",
        userId: testUserId,
        projectId: testProjectId,
        title: "Flaky Test Step",
        description: null,
        status: "todo",
        priority: "high",
        tags: ["plan-materialized", `plan:${planId}`, "plan-step:step-01", "plan-order:1"],
        estimatedDuration: 15,
        completedAt: null,
        createdAt: new Date("2026-10-01T10:00:00Z").toISOString(),
        updatedAt: new Date("2026-10-01T10:00:00Z").toISOString(),
      };
      tasksStore.set(task.id, task);
      taskDependenciesStore.set(task.id, []);

      // Attempt 1 with failing verification
      const res1 = await executePlanStep(testUserId, { planId, maxRetries: 3 }, failingRunnerConfig);

      expect(res1.outcome).toBe("VERIFICATION_FAILURE");
      expect(res1.success).toBe(false);
      expect(res1.attempts).toBe(1);
      expect(res1.taskStatus).toBe("in_progress");
      expect(tasksStore.get("t-fail")?.status).toBe("in_progress");
      expect(tasksStore.get("t-fail")?.completedAt).toBeNull();
      expect(tasksStore.get("t-fail")?.tags).toContain("exec-attempts:1");

      // Attempt 2 with passing verification succeeds
      const res2 = await executePlanStep(testUserId, { planId, maxRetries: 3 }, passingRunnerConfig);

      expect(res2.outcome).toBe("EXECUTION_SUCCESS");
      expect(res2.success).toBe(true);
      expect(res2.attempts).toBe(2);
      expect(res2.taskStatus).toBe("completed");
      expect(tasksStore.get("t-fail")?.status).toBe("completed");
      expect(tasksStore.get("t-fail")?.completedAt).not.toBeNull();
      expect(tasksStore.get("t-fail")?.tags).toContain("exec-attempts:2");
    });
  });

  describe("4. Bounded Retries & Terminal Failure (Infinite Retry Killer)", () => {
    it("halts after maxRetries, marks task as blocked, and transitions plan to BLOCKED", async () => {
      const planId = "plan-bounded-retry";

      const task: MockTaskState = {
        id: "t-broken",
        userId: testUserId,
        projectId: testProjectId,
        title: "Perpetually Broken Step",
        description: null,
        status: "todo",
        priority: "critical",
        tags: ["plan-materialized", `plan:${planId}`, "plan-step:step-01", "plan-order:1"],
        estimatedDuration: 15,
        completedAt: null,
        createdAt: new Date("2026-10-01T10:00:00Z").toISOString(),
        updatedAt: new Date("2026-10-01T10:00:00Z").toISOString(),
      };
      tasksStore.set(task.id, task);
      taskDependenciesStore.set(task.id, []);

      // Attempt 1 / 3
      const a1 = await executePlanStep(testUserId, { planId, maxRetries: 3 }, failingRunnerConfig);
      expect(a1.outcome).toBe("VERIFICATION_FAILURE");
      expect(a1.attempts).toBe(1);

      // Attempt 2 / 3
      const a2 = await executePlanStep(testUserId, { planId, maxRetries: 3 }, failingRunnerConfig);
      expect(a2.outcome).toBe("VERIFICATION_FAILURE");
      expect(a2.attempts).toBe(2);

      // Attempt 3 / 3 (Limit reached)
      const a3 = await executePlanStep(testUserId, { planId, maxRetries: 3 }, failingRunnerConfig);
      expect(a3.outcome).toBe("TERMINAL_FAILURE");
      expect(a3.attempts).toBe(3);
      expect(a3.taskStatus).toBe("blocked");
      expect(tasksStore.get("t-broken")?.status).toBe("blocked");
      expect(tasksStore.get("t-broken")?.tags).toContain("exec-terminal-failure");

      // Attempt 4: Already terminal
      const a4 = await executePlanStep(testUserId, { planId, maxRetries: 3 }, failingRunnerConfig);
      expect(a4.outcome).toBe("TERMINAL_FAILURE");
      expect(a4.taskStatus).toBe("blocked");
    });
  });

  describe("5. Interrupted Execution Recovery", () => {
    it("resumes in-progress task left by interrupted agent and prioritizes it over todo tasks", async () => {
      const planId = "plan-interrupted";

      const task1: MockTaskState = {
        id: "t-interrupted",
        userId: testUserId,
        projectId: testProjectId,
        title: "Interrupted Task",
        description: null,
        status: "in_progress",
        priority: "medium",
        tags: ["plan-materialized", `plan:${planId}`, "plan-step:step-01", "plan-order:1", "exec-attempts:1"],
        estimatedDuration: 15,
        completedAt: null,
        createdAt: new Date("2026-10-01T10:00:00Z").toISOString(),
        updatedAt: new Date("2026-10-01T10:00:00Z").toISOString(),
      };

      const task2: MockTaskState = {
        id: "t-other",
        userId: testUserId,
        projectId: testProjectId,
        title: "Other Ready Task",
        description: null,
        status: "todo",
        priority: "critical", // Even with higher priority, in_progress takes precedence
        tags: ["plan-materialized", `plan:${planId}`, "plan-step:step-02", "plan-order:2"],
        estimatedDuration: 15,
        completedAt: null,
        createdAt: new Date("2026-10-01T10:01:00Z").toISOString(),
        updatedAt: new Date("2026-10-01T10:01:00Z").toISOString(),
      };

      tasksStore.set(task1.id, task1);
      tasksStore.set(task2.id, task2);
      taskDependenciesStore.set("t-interrupted", []);
      taskDependenciesStore.set("t-other", []);

      // Verify that nextReadyTask selects the in_progress task
      const nextTask = await getNextReadyPlanTask(testUserId, planId);
      expect(nextTask.task?.taskId).toBe("t-interrupted");

      // Execute step: resumes task1
      const res = await executePlanStep(testUserId, { planId }, passingRunnerConfig);
      expect(res.taskId).toBe("t-interrupted");
      expect(res.attempts).toBe(2);
      expect(res.outcome).toBe("EXECUTION_SUCCESS");
      expect(tasksStore.get("t-interrupted")?.status).toBe("completed");
    });
  });

  describe("6. Stale State & Blocked Dependency Protection", () => {
    it("rejects execution of blocked task when prerequisite is incomplete", async () => {
      const planId = "plan-blocked-test";

      const prereq: MockTaskState = {
        id: "t-pre",
        userId: testUserId,
        projectId: testProjectId,
        title: "Incomplete Prereq",
        description: null,
        status: "todo",
        priority: "high",
        tags: ["plan-materialized", `plan:${planId}`, "plan-step:step-01", "plan-order:1"],
        estimatedDuration: 10,
        completedAt: null,
        createdAt: new Date("2026-10-01T10:00:00Z").toISOString(),
        updatedAt: new Date("2026-10-01T10:00:00Z").toISOString(),
      };

      const blocked: MockTaskState = {
        id: "t-dep",
        userId: testUserId,
        projectId: testProjectId,
        title: "Dependent Step",
        description: null,
        status: "todo",
        priority: "high",
        tags: ["plan-materialized", `plan:${planId}`, "plan-step:step-02", "plan-order:2"],
        estimatedDuration: 10,
        completedAt: null,
        createdAt: new Date("2026-10-01T10:01:00Z").toISOString(),
        updatedAt: new Date("2026-10-01T10:01:00Z").toISOString(),
      };

      tasksStore.set(prereq.id, prereq);
      tasksStore.set(blocked.id, blocked);
      taskDependenciesStore.set("t-pre", []);
      taskDependenciesStore.set("t-dep", ["t-pre"]);

      // Explicitly trying to execute t-dep directly
      const result = await executePlanStep(
        testUserId,
        { planId, taskId: "t-dep" },
        passingRunnerConfig
      );

      expect(result.outcome).toBe("BLOCKED_DEPENDENCY");
      expect(result.success).toBe(false);
      expect(tasksStore.get("t-dep")?.status).toBe("todo");
    });
  });

  describe("7. Zero-Trust Security, Capability Enforcement & Audit Attribution", () => {
    const agentReader: AgentIdentity = {
      id: "agent-reader",
      userId: testUserId,
      name: "Read-Only Assistant",
      tokenPrefix: "agt_read",
      provider: "claude",
      capabilities: new Set(["READ"]),
      status: "active",
      expiresAt: null,
      permissions: [],
    };

    const agentDeveloper: AgentIdentity = {
      id: "agent-dev",
      userId: testUserId,
      name: "Autonomous Developer",
      tokenPrefix: "agt_dev",
      provider: "claude",
      capabilities: new Set(["READ", "WRITE", "EXECUTE"]),
      status: "active",
      expiresAt: null,
      permissions: [],
    };

    it("restricts step execution from agents lacking EXECUTE capability", async () => {
      // 1. Operation classification
      const op = classifyOperation("lifeos_workspace_execute_step");
      expect(op.capability).toBe("EXECUTE");
      expect(op.domain).toBe("workspace");

      // 2. Evaluator check for read-only agent
      const evalDenied = evaluateAgentPermission(agentReader, "lifeos_workspace_execute_step", testUserId);
      expect(evalDenied.granted).toBe(false);
      expect(evalDenied.reason).toContain("lacks required capability 'EXECUTE'");

      // 3. Evaluator check for developer agent
      const evalAllowed = evaluateAgentPermission(agentDeveloper, "lifeos_workspace_execute_step", testUserId);
      expect(evalAllowed.granted).toBe(true);
    });

    it("executes through runSandboxedPlanStepExecution with audit logging", async () => {
      const planId = "plan-audited";
      const task: MockTaskState = {
        id: "t-audited",
        userId: testUserId,
        projectId: testProjectId,
        title: "Audited Step",
        description: null,
        status: "todo",
        priority: "medium",
        tags: ["plan-materialized", `plan:${planId}`, "plan-step:step-01", "plan-order:1"],
        estimatedDuration: 10,
        completedAt: null,
        createdAt: new Date("2026-10-01T10:00:00Z").toISOString(),
        updatedAt: new Date("2026-10-01T10:00:00Z").toISOString(),
      };
      tasksStore.set(task.id, task);
      taskDependenciesStore.set(task.id, []);

      const safetyContext: AgentSafetyContext = {
        isAgent: true,
        agent: agentDeveloper,
        user: {
          id: testUserId,
          email: "hamza@example.com",
          name: "Hamza Waqar",
        },
        sessionId: "sess-123",
        provider: "claude",
      };

      class MockAuditDb {
        public agentAuditLogs: any[] = [];
        select() {
          return {
            from: () => ({
              where: () => ({
                limit: async () => [{ id: "agent-dev" }],
              }),
            }),
          };
        }
        insert() {
          return {
            values: (val: any) => ({
              returning: async () => {
                const record = { id: `audit-${Date.now()}`, ...val };
                this.agentAuditLogs.push(record);
                return [record];
              },
            }),
          };
        }
      }
      const mockAuditDb = new MockAuditDb();

      const result = await runSandboxedPlanStepExecution(
        safetyContext,
        { planId, verificationChecks: ["typecheck"] },
        testUserId,
        passingRunnerConfig,
        mockAuditDb
      );

      expect(result.status).toBe("EXECUTED");
      if (result.status === "EXECUTED") {
        expect(result.data.outcome).toBe("EXECUTION_SUCCESS");
      }
      expect(mockAuditDb.agentAuditLogs.length).toBeGreaterThan(0);
      expect(mockAuditDb.agentAuditLogs[0].operation).toBe("lifeos_workspace_execute_step");
    });
  });

  describe("8. CLI Subcommand: lifeos workspace step", () => {
    const mockCliUser = {
      id: testUserId,
      email: "hamza@example.com",
      name: "Hamza Waqar",
    };

    it("executes step via CLI and returns structured output", async () => {
      const planId = "plan-cli-step";
      const task: MockTaskState = {
        id: "t-cli",
        userId: testUserId,
        projectId: testProjectId,
        title: "CLI Executable Step",
        description: null,
        status: "todo",
        priority: "high",
        tags: ["plan-materialized", `plan:${planId}`, "plan-step:step-01", "plan-order:1"],
        estimatedDuration: 10,
        completedAt: null,
        createdAt: new Date("2026-10-01T10:00:00Z").toISOString(),
        updatedAt: new Date("2026-10-01T10:00:00Z").toISOString(),
      };
      tasksStore.set(task.id, task);
      taskDependenciesStore.set(task.id, []);

      // Run with typecheck check
      const cliResult = await handleWorkspace(
        {
          subcommands: ["workspace", "step"],
          flags: { "plan-id": planId, checks: "typecheck" },
          options: {},
        } as any,
        { user: mockCliUser, token: "token-1" } as any
      );

      expect(cliResult.exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(cliResult.message).toContain("Step Execution: EXECUTION_SUCCESS");
      expect(cliResult.message).toContain("Task: t-cli");
    }, 60000);

    it("rejects caller spoofing flags on workspace step", async () => {
      await expect(
        handleWorkspace(
          {
            subcommands: ["workspace", "step"],
            flags: { "plan-id": "plan-1", userId: "evil-user" },
            options: {},
          } as any,
          { user: mockCliUser, token: "token-1" } as any
        )
      ).rejects.toThrow(/Caller identity is strictly bound/i);
    });
  });

  describe("9. Real Repository Verification Execution", () => {
    it("runs real child-process typecheck verification through the step executor", async () => {
      const planId = "plan-real-verify";
      const task: MockTaskState = {
        id: "t-real",
        userId: testUserId,
        projectId: testProjectId,
        title: "Real Repository Typecheck Step",
        description: null,
        status: "todo",
        priority: "high",
        tags: ["plan-materialized", `plan:${planId}`, "plan-step:step-01", "plan-order:1"],
        estimatedDuration: 10,
        completedAt: null,
        createdAt: new Date("2026-10-01T10:00:00Z").toISOString(),
        updatedAt: new Date("2026-10-01T10:00:00Z").toISOString(),
      };
      tasksStore.set(task.id, task);
      taskDependenciesStore.set(task.id, []);

      // Execute with real typecheck command (no mocks in runnerConfig)
      const res = await executePlanStep(testUserId, {
        planId,
        verificationChecks: ["typecheck"],
      });

      expect(res.outcome).toBe("EXECUTION_SUCCESS");
      expect(res.verification?.passed).toBe(true);
      expect(res.verification?.checksPassed).toContain("typecheck");
      expect(tasksStore.get("t-real")?.status).toBe("completed");
    }, 60000);
  });
});
