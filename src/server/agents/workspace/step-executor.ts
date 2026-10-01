/**
 * Closed-Loop Autonomous Step Execution & Reconciliation Engine
 *
 * Requirements:
 * - WORK-01: Sandboxed workspace execution strictly inside project root.
 * - WORK-02: Structured execution of allowlisted verification checks (typecheck, test, build, lint).
 * - WORK-03: Materialized plan execution state observability and deterministic progression.
 * - WORK-04: Task completion recorded ONLY after verification passes (no false progress).
 * - SAFE-01: EXECUTE tier capability enforcement.
 * - SAFE-04: Comprehensive forensic audit logging with beforeState / afterState.
 *
 * Eliminates:
 * - False progress (tasks only marked complete after verification passes)
 * - Repeated execution / duplicate materialization (idempotent no-op for completed tasks/plans)
 * - Stale status & race conditions (persists and reconciles state after each step)
 * - Dependency deadlocks (deterministic next-task resolution)
 * - Infinite retry loops (bounded retries via maxRetries with explicit terminal failure transition)
 */

import { listTasks, getTask, updateTask, getTaskDependencies, type TaskDTO } from "@/server/tasks/service";
import { getPlanExecutionStatus, getNextReadyPlanTask } from "./plan-inspector";
import { runPreCommitVerification } from "./verification-gate";
import { executeAgentOperation, type AgentOperationResult } from "../safety-boundary";
import type { AgentSafetyContext } from "../permissions/types";
import {
  type ExecutePlanStepInput,
  type ExecutePlanStepResult,
  type StepExecutionOutcome,
  type WorkspaceCommand,
  type WorkspaceRunnerConfig,
  type PreCommitVerificationResult,
  StepExecutionError,
} from "./types";

/**
 * Extracts current execution attempt count from task tags.
 * e.g. ["plan-materialized", "exec-attempts:2"] -> 2
 */
export function extractAttemptCount(tags: string[] | undefined | null): number {
  if (!Array.isArray(tags)) return 0;
  const tag = tags.find((t) => t.startsWith("exec-attempts:"));
  if (!tag) return 0;
  const count = parseInt(tag.slice("exec-attempts:".length), 10);
  return isNaN(count) || count < 0 ? 0 : count;
}

/**
 * Replaces or inserts an attempt tag in task tags array.
 */
export function updateAttemptTag(tags: string[] | undefined | null, newCount: number): string[] {
  const current = Array.isArray(tags) ? tags.filter((t) => !t.startsWith("exec-attempts:")) : [];
  current.push(`exec-attempts:${newCount}`);
  return current;
}

/**
 * Executes a single plan step in a closed loop:
 * 1. Inspect plan status and resolve the next ready task (or target task)
 * 2. Validate prerequisites and dependency invariants (fail-closed if blocked)
 * 3. Enforce bounded retries (terminal failure when maxRetries exceeded)
 * 4. Transition task to in_progress
 * 5. Execute sandboxed verification checks
 * 6. Reconcile outcome: mark completed only if verification passes; otherwise record failure/retry
 * 7. Resolve next ready task and return machine-actionable result
 */
export async function executePlanStep(
  userId: string,
  input: ExecutePlanStepInput,
  runnerConfig?: WorkspaceRunnerConfig
): Promise<ExecutePlanStepResult> {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new StepExecutionError("Valid user ID is required to execute a plan step", "INVALID_USER_ID");
  }
  if (!input.planId || typeof input.planId !== "string" || !input.planId.trim()) {
    throw new StepExecutionError("Valid plan ID is required to execute a plan step", "INVALID_PLAN_ID");
  }

  const safeUserId = userId.trim();
  const safePlanId = input.planId.trim();
  const maxRetries = typeof input.maxRetries === "number" && input.maxRetries > 0 ? input.maxRetries : 3;

  // 1. Inspect Plan Status
  const statusBefore = await getPlanExecutionStatus(safeUserId, safePlanId, input.projectId);

  if (statusBefore.status === "INVALID" || (statusBefore.errors && statusBefore.errors.length > 0)) {
    return {
      outcome: "INVALID_PLAN",
      success: false,
      planId: safePlanId,
      projectId: statusBefore.projectId,
      stepId: null,
      taskId: null,
      taskTitle: null,
      taskStatus: "invalid",
      attempts: 0,
      maxRetries,
      verification: null,
      failureReason: statusBefore.errors?.join("; ") || "Plan graph integrity violation detected",
      nextReadyTask: null,
      planStatus: statusBefore.status,
    };
  }

  if (statusBefore.status === "COMPLETED") {
    return {
      outcome: "ALREADY_COMPLETED",
      success: true,
      planId: safePlanId,
      projectId: statusBefore.projectId,
      stepId: null,
      taskId: null,
      taskTitle: null,
      taskStatus: "completed",
      attempts: 0,
      maxRetries,
      verification: null,
      failureReason: undefined,
      nextReadyTask: null,
      planStatus: statusBefore.status,
    };
  }

  // 2. Resolve Target Step / Task
  let targetStepId: string | null = null;
  let targetTaskId: string | null = null;

  if (input.taskId) {
    const found = statusBefore.steps.find((s) => s.taskId === input.taskId);
    if (!found) {
      throw new StepExecutionError(`Task '${input.taskId}' does not belong to plan '${safePlanId}'.`, "TASK_NOT_IN_PLAN");
    }
    targetStepId = found.stepId;
    targetTaskId = found.taskId;
  } else if (input.stepId) {
    const found = statusBefore.steps.find((s) => s.stepId === input.stepId);
    if (!found) {
      throw new StepExecutionError(`Step '${input.stepId}' does not belong to plan '${safePlanId}'.`, "STEP_NOT_IN_PLAN");
    }
    targetStepId = found.stepId;
    targetTaskId = found.taskId;
  } else {
    // Deterministic Next-Task Resolution
    const nextResult = await getNextReadyPlanTask(safeUserId, safePlanId, input.projectId);
    if (nextResult.state === "COMPLETE") {
      return {
        outcome: "ALREADY_COMPLETED",
        success: true,
        planId: safePlanId,
        projectId: statusBefore.projectId,
        stepId: null,
        taskId: null,
        taskTitle: null,
        taskStatus: "completed",
        attempts: 0,
        maxRetries,
        verification: null,
        nextReadyTask: null,
        planStatus: "COMPLETED",
      };
    }
    if (nextResult.state === "BLOCKED") {
      return {
        outcome: "BLOCKED_DEPENDENCY",
        success: false,
        planId: safePlanId,
        projectId: statusBefore.projectId,
        stepId: null,
        taskId: null,
        taskTitle: null,
        taskStatus: "blocked",
        attempts: 0,
        maxRetries,
        verification: null,
        failureReason: nextResult.blockedReasons?.join("; ") || "All remaining tasks are blocked by incomplete prerequisites.",
        nextReadyTask: null,
        planStatus: statusBefore.status,
      };
    }
    if (nextResult.state === "INVALID") {
      return {
        outcome: "INVALID_PLAN",
        success: false,
        planId: safePlanId,
        projectId: statusBefore.projectId,
        stepId: null,
        taskId: null,
        taskTitle: null,
        taskStatus: "invalid",
        attempts: 0,
        maxRetries,
        verification: null,
        failureReason: nextResult.errors?.join("; ") || "Plan graph is invalid.",
        nextReadyTask: null,
        planStatus: statusBefore.status,
      };
    }

    if (!nextResult.task) {
      throw new StepExecutionError("Unexpected null task in READY state.", "UNEXPECTED_NULL_TASK");
    }

    targetStepId = nextResult.task.stepId;
    targetTaskId = nextResult.task.taskId;
  }

  // 3. Load Canonical Task
  const stepSummary = statusBefore.steps.find((s) => s.taskId === targetTaskId)!;
  const canonicalTask = await getTask(safeUserId, targetTaskId);
  if (!canonicalTask) {
    throw new StepExecutionError(`Task '${targetTaskId}' not found for user.`, "TASK_NOT_FOUND");
  }

  // Idempotency: Already completed?
  if (canonicalTask.status === "completed") {
    return {
      outcome: "ALREADY_COMPLETED",
      success: true,
      planId: safePlanId,
      projectId: statusBefore.projectId,
      stepId: stepSummary.stepId,
      taskId: canonicalTask.id,
      taskTitle: canonicalTask.title,
      taskStatus: "completed",
      attempts: extractAttemptCount(canonicalTask.tags),
      maxRetries,
      verification: null,
      nextReadyTask: statusBefore.nextReadyTask,
      planStatus: statusBefore.status,
    };
  }

  // Cancelled?
  if (canonicalTask.status === "cancelled") {
    return {
      outcome: "TERMINAL_FAILURE",
      success: false,
      planId: safePlanId,
      projectId: statusBefore.projectId,
      stepId: stepSummary.stepId,
      taskId: canonicalTask.id,
      taskTitle: canonicalTask.title,
      taskStatus: "cancelled",
      attempts: extractAttemptCount(canonicalTask.tags),
      maxRetries,
      verification: null,
      failureReason: "Task has been cancelled and cannot be executed.",
      nextReadyTask: statusBefore.nextReadyTask,
      planStatus: statusBefore.status,
    };
  }

  // 4. Verify Dependency Invariants
  if (stepSummary.blockedBySteps && stepSummary.blockedBySteps.length > 0) {
    return {
      outcome: "BLOCKED_DEPENDENCY",
      success: false,
      planId: safePlanId,
      projectId: statusBefore.projectId,
      stepId: stepSummary.stepId,
      taskId: canonicalTask.id,
      taskTitle: canonicalTask.title,
      taskStatus: canonicalTask.status,
      attempts: extractAttemptCount(canonicalTask.tags),
      maxRetries,
      verification: null,
      failureReason: `Task is blocked by incomplete dependencies: ${stepSummary.blockedBySteps.join(", ")}`,
      nextReadyTask: statusBefore.nextReadyTask,
      planStatus: statusBefore.status,
    };
  }

  // Check actual runtime dependencies
  const deps = await getTaskDependencies(safeUserId, canonicalTask.id);
  const incompletePrereqs = deps.blockedBy.filter((p) => p.status !== "completed");
  if (incompletePrereqs.length > 0) {
    return {
      outcome: "BLOCKED_DEPENDENCY",
      success: false,
      planId: safePlanId,
      projectId: statusBefore.projectId,
      stepId: stepSummary.stepId,
      taskId: canonicalTask.id,
      taskTitle: canonicalTask.title,
      taskStatus: canonicalTask.status,
      attempts: extractAttemptCount(canonicalTask.tags),
      maxRetries,
      verification: null,
      failureReason: `Task is blocked by uncompleted tasks: ${incompletePrereqs.map((p) => p.title).join(", ")}`,
      nextReadyTask: statusBefore.nextReadyTask,
      planStatus: statusBefore.status,
    };
  }

  // 5. Bounded Retry Check
  const currentAttempts = extractAttemptCount(canonicalTask.tags);
  if (currentAttempts >= maxRetries) {
    // Already exhausted retries: mark blocked if not already
    let finalStatus = canonicalTask.status;
    if (canonicalTask.status !== "blocked") {
      const updatedTags = Array.from(new Set([...(canonicalTask.tags || []), "exec-terminal-failure"]));
      await updateTask(safeUserId, canonicalTask.id, {
        status: "blocked",
        tags: updatedTags,
      });
      finalStatus = "blocked";
    }

    const afterStatus = await getPlanExecutionStatus(safeUserId, safePlanId, input.projectId);
    return {
      outcome: "TERMINAL_FAILURE",
      success: false,
      planId: safePlanId,
      projectId: statusBefore.projectId,
      stepId: stepSummary.stepId,
      taskId: canonicalTask.id,
      taskTitle: canonicalTask.title,
      taskStatus: finalStatus,
      attempts: currentAttempts,
      maxRetries,
      verification: null,
      failureReason: `Task exceeded maximum execution retries (${maxRetries}). Halting to prevent infinite loop.`,
      nextReadyTask: afterStatus.nextReadyTask,
      planStatus: afterStatus.status,
    };
  }

  // 6. Transition Task to IN_PROGRESS & Increment Attempt Tag
  const newAttempts = currentAttempts + 1;
  const inProgressTags = updateAttemptTag(canonicalTask.tags, newAttempts);

  await updateTask(safeUserId, canonicalTask.id, {
    status: "in_progress",
    tags: inProgressTags,
  });

  // 7. Execute Sandboxed Verification Checks
  const checksToRun: WorkspaceCommand[] =
    Array.isArray(input.verificationChecks) && input.verificationChecks.length > 0
      ? input.verificationChecks
      : ["typecheck", "test"];

  let verificationResult: PreCommitVerificationResult;
  try {
    verificationResult = await runPreCommitVerification(
      {
        checks: checksToRun,
        subpath: input.subpath,
        testArgs: input.testArgs,
        timeoutOverrides: input.timeoutOverrides,
        inspectGit: false,
      },
      runnerConfig
    );
  } catch (error: any) {
    // Unhandled workspace failure / timeout
    const isExhausted = newAttempts >= maxRetries;
    const terminalTags = isExhausted
      ? Array.from(new Set([...inProgressTags, "exec-terminal-failure"]))
      : inProgressTags;

    await updateTask(safeUserId, canonicalTask.id, {
      status: isExhausted ? "blocked" : "in_progress",
      tags: terminalTags,
    });

    const afterStatus = await getPlanExecutionStatus(safeUserId, safePlanId, input.projectId);
    return {
      outcome: isExhausted ? "TERMINAL_FAILURE" : "RECOVERABLE_FAILURE",
      success: false,
      planId: safePlanId,
      projectId: statusBefore.projectId,
      stepId: stepSummary.stepId,
      taskId: canonicalTask.id,
      taskTitle: canonicalTask.title,
      taskStatus: isExhausted ? "blocked" : "in_progress",
      attempts: newAttempts,
      maxRetries,
      verification: null,
      failureReason: `Workspace execution failed: ${error?.message || String(error)}`,
      nextReadyTask: afterStatus.nextReadyTask,
      planStatus: afterStatus.status,
    };
  }

  // 8. Reconcile Status Based on Verification Outcome
  if (verificationResult.passed) {
    // Success: Mark completed and clear terminal failure tags
    const finalTags = inProgressTags.filter((t) => t !== "exec-terminal-failure");
    await updateTask(safeUserId, canonicalTask.id, {
      status: "completed",
      completedAt: new Date().toISOString(),
      tags: finalTags,
    });

    const afterStatus = await getPlanExecutionStatus(safeUserId, safePlanId, input.projectId);
    return {
      outcome: "EXECUTION_SUCCESS",
      success: true,
      planId: safePlanId,
      projectId: statusBefore.projectId,
      stepId: stepSummary.stepId,
      taskId: canonicalTask.id,
      taskTitle: canonicalTask.title,
      taskStatus: "completed",
      attempts: newAttempts,
      maxRetries,
      verification: verificationResult,
      failureReason: undefined,
      nextReadyTask: afterStatus.nextReadyTask,
      planStatus: afterStatus.status,
    };
  }

  // Verification Failed: strictly do NOT mark completed
  const isTerminal = newAttempts >= maxRetries;
  const failureTags = isTerminal
    ? Array.from(new Set([...inProgressTags, "exec-terminal-failure"]))
    : inProgressTags;

  await updateTask(safeUserId, canonicalTask.id, {
    status: isTerminal ? "blocked" : "in_progress",
    tags: failureTags,
  });

  const afterStatus = await getPlanExecutionStatus(safeUserId, safePlanId, input.projectId);
  return {
    outcome: isTerminal ? "TERMINAL_FAILURE" : "VERIFICATION_FAILURE",
    success: false,
    planId: safePlanId,
    projectId: statusBefore.projectId,
    stepId: stepSummary.stepId,
    taskId: canonicalTask.id,
    taskTitle: canonicalTask.title,
    taskStatus: isTerminal ? "blocked" : "in_progress",
    attempts: newAttempts,
    maxRetries,
    verification: verificationResult,
    failureReason:
      verificationResult.failureReason ||
      `Verification failed: checks [${verificationResult.checksFailed.join(", ")}] did not pass.`,
    nextReadyTask: afterStatus.nextReadyTask,
    planStatus: afterStatus.status,
  };
}

/**
 * Authorized Agent Operation Entry Point for Step Execution.
 * Evaluates capability (EXECUTE tier), prevents caller spoofing, and logs audit record.
 */
export async function runSandboxedPlanStepExecution(
  context: AgentSafetyContext,
  input: ExecutePlanStepInput,
  targetUserId: string,
  runnerConfig?: WorkspaceRunnerConfig,
  dbClient?: any
): Promise<AgentOperationResult<ExecutePlanStepResult>> {
  const operationName = "lifeos_workspace_execute_step";

  return await executeAgentOperation<ExecutePlanStepInput, ExecutePlanStepResult>({
    context,
    toolName: operationName,
    operation: operationName,
    arguments: input,
    targetUserId,
    dbClient,
    executor: async () => {
      return await executePlanStep(targetUserId, input, runnerConfig);
    },
  });
}

