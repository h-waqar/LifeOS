/**
 * Plan Execution Inspector & Next-Task Deterministic Resolver
 *
 * Implements:
 * - getPlanExecutionStatus (Structured machine-actionable plan execution status)
 * - getNextReadyPlanTask (Deterministic next-task resolution eliminating agent deadlocks)
 * - runSandboxedPlanStatus & runSandboxedNextTask (Audited agent operation boundaries)
 *
 * Guarantees:
 * - Zero raw SQL: delegates exclusively to canonical domain services (listTasks, getTaskDependencies).
 * - Anti-deadlock: deterministic output for identical graph state; changes deterministically on task completion.
 * - Explicit terminal states: READY, COMPLETE, BLOCKED, INVALID.
 * - Project isolation and strict tenant security enforcement.
 */

import { listTasks, getTaskDependencies, type TaskDTO } from "@/server/tasks/service";
import { executeAgentOperation, type AgentOperationResult } from "../safety-boundary";
import type { AgentSafetyContext } from "../permissions/types";
import {
  type PlanExecutionStatus,
  type NextReadyPlanTaskResult,
  type PlanStepExecutionSummary,
  type PlanBottleneck,
  type NextTaskDetails,
  type PlanStepExecutionState,
  type PlanExecutionOverallStatus,
  type PlanInspectorInput,
  type TaskPriority,
  PlanInspectorError,
} from "./types";

interface StepGraphNode {
  stepId: string;
  task: TaskDTO;
  orderIndex: number;
  dependencies: string[]; // step IDs that this step depends on
  dependents: string[]; // step IDs that depend on this step
  missingDepIds: string[]; // referenced step IDs that do not exist in the plan
}

/**
 * Extracts a numeric index from stepId (e.g. "step-01" -> 1, "step_2" -> 2, "3" -> 3)
 */
function parseStepNumber(stepId: string): number | null {
  const match = stepId.match(/\d+/);
  if (match) {
    const num = parseInt(match[0], 10);
    return isNaN(num) ? null : num;
  }
  return null;
}

/**
 * Extracts order index from tags (e.g. "plan-order:2") or derives from step ID
 */
function extractOrderIndex(tags: string[], stepId: string, fallbackIndex: number): number {
  const orderTag = tags.find((t) => t.startsWith("plan-order:"));
  if (orderTag) {
    const parsed = parseInt(orderTag.slice("plan-order:".length), 10);
    if (!isNaN(parsed)) return parsed;
  }
  const stepNum = parseStepNumber(stepId);
  if (stepNum !== null) return stepNum;
  return fallbackIndex;
}

/**
 * Detects cycles in a directed graph of steps using Kahn's algorithm or DFS.
 * Returns null if acyclic, or array of step IDs involved in cycles.
 */
function detectGraphCycles(nodes: Map<string, StepGraphNode>): string[] | null {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>(); // dep -> list of steps depending on dep

  for (const [stepId, node] of nodes.entries()) {
    inDegree.set(stepId, 0);
    adjacency.set(stepId, []);
  }

  for (const [stepId, node] of nodes.entries()) {
    for (const depId of node.dependencies) {
      if (nodes.has(depId)) {
        adjacency.get(depId)!.push(stepId);
        inDegree.set(stepId, (inDegree.get(stepId) || 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const [stepId, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(stepId);
  }

  let visitedCount = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    visitedCount++;
    for (const neighbor of adjacency.get(current) || []) {
      const newDeg = inDegree.get(neighbor)! - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  if (visitedCount !== nodes.size) {
    // Collect steps that could not be resolved (involved in cycle)
    const cycleSteps: string[] = [];
    for (const [stepId, deg] of inDegree.entries()) {
      if (deg > 0) cycleSteps.push(stepId);
    }
    return cycleSteps;
  }

  return null;
}

/**
 * Inspects execution state of a development plan through canonical task services.
 * Returns comprehensive, machine-actionable status of all plan steps and blockers.
 */
export async function getPlanExecutionStatus(
  userId: string,
  planId: string,
  projectId?: string
): Promise<PlanExecutionStatus> {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new PlanInspectorError("Valid user ID is required to inspect plan status", "INVALID_USER_ID");
  }
  if (!planId || typeof planId !== "string" || !planId.trim()) {
    throw new PlanInspectorError("Valid plan ID is required to inspect plan status", "INVALID_PLAN_ID");
  }

  const safeUserId = userId.trim();
  const safePlanId = planId.trim();
  const planTag = `plan:${safePlanId}`;

  // 1. Load tasks via canonical task service
  const candidateTasks = await listTasks(
    safeUserId,
    projectId ? { projectId: projectId.trim() } : undefined
  );

  const matchingTasks = candidateTasks.filter((t) =>
    Array.isArray(t.tags) && t.tags.includes(planTag)
  );

  if (matchingTasks.length === 0) {
    return {
      planId: safePlanId,
      projectId: projectId || "",
      totalSteps: 0,
      completedSteps: 0,
      inProgressSteps: 0,
      todoSteps: 0,
      blockedSteps: 0,
      cancelledSteps: 0,
      progressPercent: 0,
      status: "INVALID",
      steps: [],
      nextReadyTask: null,
      blockedReasons: [`No tasks found matching plan '${safePlanId}'.`],
      bottlenecks: [],
      errors: [`No tasks found matching plan '${safePlanId}'.`],
    };
  }

  const resolvedProjectId = projectId || matchingTasks[0].projectId || "";
  const errors: string[] = [];

  // 2. Validate Project Alignment
  for (const t of matchingTasks) {
    if (resolvedProjectId && t.projectId && t.projectId !== resolvedProjectId) {
      errors.push(`Task '${t.id}' belongs to project '${t.projectId}' instead of expected project '${resolvedProjectId}'.`);
    }
  }

  // 3. Map Step IDs and check for uniqueness
  const stepIdToTask = new Map<string, TaskDTO>();
  const taskIdToStepId = new Map<string, string>();

  for (let i = 0; i < matchingTasks.length; i++) {
    const t = matchingTasks[i];
    const tags = Array.isArray(t.tags) ? t.tags : [];
    const stepTag = tags.find((tag) => tag.startsWith("plan-step:"));

    if (!stepTag) {
      errors.push(`Task '${t.id}' (${t.title}) is missing a 'plan-step:<stepId>' tag.`);
      continue;
    }

    const stepId = stepTag.slice("plan-step:".length).trim();
    if (!stepId) {
      errors.push(`Task '${t.id}' has empty stepId in tag '${stepTag}'.`);
      continue;
    }

    if (stepIdToTask.has(stepId)) {
      const existing = stepIdToTask.get(stepId)!;
      errors.push(`Duplicate step ID detected: '${stepId}' is used by both task '${existing.id}' and '${t.id}'.`);
      continue;
    }

    stepIdToTask.set(stepId, t);
    taskIdToStepId.set(t.id, stepId);
  }

  if (errors.length > 0) {
    return {
      planId: safePlanId,
      projectId: resolvedProjectId,
      totalSteps: matchingTasks.length,
      completedSteps: 0,
      inProgressSteps: 0,
      todoSteps: 0,
      blockedSteps: 0,
      cancelledSteps: 0,
      progressPercent: 0,
      status: "INVALID",
      steps: [],
      nextReadyTask: null,
      blockedReasons: errors,
      bottlenecks: [],
      errors,
    };
  }

  // 4. Load Dependency Relationships via canonical task service
  const nodes = new Map<string, StepGraphNode>();
  let fallbackIndex = 0;

  for (const [stepId, task] of stepIdToTask.entries()) {
    const orderIndex = extractOrderIndex(task.tags, stepId, fallbackIndex++);
    const depsResult = await getTaskDependencies(safeUserId, task.id);

    const depStepIds: string[] = [];
    const missingDepIds: string[] = [];

    for (const prereq of depsResult.blockedBy) {
      const prereqStepId = taskIdToStepId.get(prereq.id);
      if (prereqStepId) {
        depStepIds.push(prereqStepId);
      } else {
        // Dependency task is outside this plan or was removed
        missingDepIds.push(prereq.id);
      }
    }

    nodes.set(stepId, {
      stepId,
      task,
      orderIndex,
      dependencies: depStepIds,
      dependents: [],
      missingDepIds,
    });
  }

  // Populate dependents
  for (const [stepId, node] of nodes.entries()) {
    for (const depId of node.dependencies) {
      const depNode = nodes.get(depId);
      if (depNode) {
        depNode.dependents.push(stepId);
      }
    }
  }

  // 5. Check for Cycles or Self-Dependencies
  for (const [stepId, node] of nodes.entries()) {
    if (node.dependencies.includes(stepId)) {
      errors.push(`Self-dependency detected: step '${stepId}' depends on itself.`);
    }
  }

  const cycle = detectGraphCycles(nodes);
  if (cycle) {
    errors.push(`Dependency cycle detected among plan steps: ${cycle.join(", ")}.`);
  }

  if (errors.length > 0) {
    return {
      planId: safePlanId,
      projectId: resolvedProjectId,
      totalSteps: nodes.size,
      completedSteps: 0,
      inProgressSteps: 0,
      todoSteps: 0,
      blockedSteps: 0,
      cancelledSteps: 0,
      progressPercent: 0,
      status: "INVALID",
      steps: [],
      nextReadyTask: null,
      blockedReasons: errors,
      bottlenecks: [],
      errors,
    };
  }

  // 6. Classify Each Step
  const stepSummaries: PlanStepExecutionSummary[] = [];
  const blockedReasons: string[] = [];
  const candidateReadyTasks: Array<{ node: StepGraphNode; state: PlanStepExecutionState }> = [];

  for (const [stepId, node] of nodes.entries()) {
    const { task, dependencies, missingDepIds } = node;
    let state: PlanStepExecutionState;
    const blockedBySteps: string[] = [];

    if (task.status === "completed") {
      state = "COMPLETED";
    } else if (task.status === "cancelled") {
      state = "CANCELLED";
    } else {
      // Check incomplete dependencies
      for (const depStepId of dependencies) {
        const depNode = nodes.get(depStepId);
        if (!depNode || depNode.task.status !== "completed") {
          blockedBySteps.push(depStepId);
          const depStatus = depNode ? depNode.task.status : "missing";
          blockedReasons.push(`${stepId} is blocked by ${depStepId} (${depStatus})`);
        }
      }

      for (const missingTaskId of missingDepIds) {
        blockedBySteps.push(`task:${missingTaskId}`);
        blockedReasons.push(`${stepId} is blocked by external or missing task '${missingTaskId}'`);
      }

      if (blockedBySteps.length > 0) {
        state = "BLOCKED";
      } else {
        if (task.status === "in_progress") {
          state = "IN_PROGRESS";
        } else {
          state = "READY";
        }
        candidateReadyTasks.push({ node, state });
      }
    }

    stepSummaries.push({
      stepId,
      taskId: task.id,
      title: task.title,
      status: state,
      taskStatus: task.status,
      priority: task.priority as TaskPriority,
      estimatedDuration: task.estimatedDuration,
      tags: task.tags,
      orderIndex: node.orderIndex,
      dependencies,
      blockedBySteps,
    });
  }

  // 7. Sort step summaries deterministically by orderIndex -> stepId -> taskId
  stepSummaries.sort((a, b) => {
    const ordDiff = (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
    if (ordDiff !== 0) return ordDiff;
    const stepDiff = a.stepId.localeCompare(b.stepId);
    if (stepDiff !== 0) return stepDiff;
    return a.taskId.localeCompare(b.taskId);
  });

  // 8. Compute Counts & Overall Status
  let completedSteps = 0;
  let inProgressSteps = 0;
  let todoSteps = 0;
  let blockedSteps = 0;
  let cancelledSteps = 0;

  for (const s of stepSummaries) {
    if (s.status === "COMPLETED") completedSteps++;
    else if (s.status === "IN_PROGRESS") inProgressSteps++;
    else if (s.status === "READY") todoSteps++;
    else if (s.status === "BLOCKED") blockedSteps++;
    else if (s.status === "CANCELLED") cancelledSteps++;
  }

  const totalSteps = stepSummaries.length;
  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  let overallStatus: PlanExecutionOverallStatus;
  if (completedSteps + cancelledSteps === totalSteps) {
    overallStatus = "COMPLETED";
  } else if (candidateReadyTasks.length === 0 && blockedSteps > 0) {
    overallStatus = "BLOCKED";
  } else if (inProgressSteps > 0 || completedSteps > 0) {
    overallStatus = "EXECUTING";
  } else {
    overallStatus = "NOT_STARTED";
  }

  // 9. Identify Bottlenecks (incomplete tasks blocking downstream steps)
  const bottlenecks: PlanBottleneck[] = [];
  for (const [stepId, node] of nodes.entries()) {
    if (node.task.status !== "completed" && node.task.status !== "cancelled") {
      const blockedDownstream = node.dependents.filter((dependentId) => {
        const depSummary = stepSummaries.find((s) => s.stepId === dependentId);
        return depSummary && depSummary.status === "BLOCKED";
      });

      if (blockedDownstream.length > 0) {
        const stepSummary = stepSummaries.find((s) => s.stepId === stepId)!;
        bottlenecks.push({
          stepId,
          taskId: node.task.id,
          title: node.task.title,
          status: stepSummary.status,
          blockingStepCount: blockedDownstream.length,
          blockedStepIds: blockedDownstream,
        });
      }
    }
  }

  bottlenecks.sort((a, b) => {
    const diff = b.blockingStepCount - a.blockingStepCount;
    if (diff !== 0) return diff;
    return a.stepId.localeCompare(b.stepId);
  });

  // 10. Resolve Next Ready Task Deterministically
  // Sorting tie-breakers:
  // 1. orderIndex asc
  // 2. IN_PROGRESS status over READY (task already started takes immediate precedence)
  // 3. createdAt order (older first)
  // 4. taskId tie-breaker (lexicographical asc)
  candidateReadyTasks.sort((a, b) => {
    const orderDiff = a.node.orderIndex - b.node.orderIndex;
    if (orderDiff !== 0) return orderDiff;

    if (a.state === "IN_PROGRESS" && b.state !== "IN_PROGRESS") return -1;
    if (b.state === "IN_PROGRESS" && a.state !== "IN_PROGRESS") return 1;

    const timeDiff = new Date(a.node.task.createdAt).getTime() - new Date(b.node.task.createdAt).getTime();
    if (timeDiff !== 0) return timeDiff;

    return a.node.task.id.localeCompare(b.node.task.id);
  });

  let nextReadyTask: NextTaskDetails | null = null;
  if (candidateReadyTasks.length > 0) {
    const topCandidate = candidateReadyTasks[0];
    nextReadyTask = {
      taskId: topCandidate.node.task.id,
      stepId: topCandidate.node.stepId,
      title: topCandidate.node.task.title,
      status: topCandidate.node.task.status,
      executionState: topCandidate.state,
      priority: topCandidate.node.task.priority as TaskPriority,
      estimatedDuration: topCandidate.node.task.estimatedDuration,
      tags: topCandidate.node.task.tags,
      orderIndex: topCandidate.node.orderIndex,
    };
  }

  return {
    planId: safePlanId,
    projectId: resolvedProjectId,
    totalSteps,
    completedSteps,
    inProgressSteps,
    todoSteps,
    blockedSteps,
    cancelledSteps,
    progressPercent,
    status: overallStatus,
    steps: stepSummaries,
    nextReadyTask,
    blockedReasons: Array.from(new Set(blockedReasons)),
    bottlenecks,
  };
}

/**
 * Deterministic Next-Task Resolver
 *
 * Returns exactly one actionable task to execute, or an explicit terminal state:
 * - READY (with exact next task to execute)
 * - COMPLETE (all plan steps completed/cancelled)
 * - BLOCKED (all remaining tasks are blocked, with exact reasons)
 * - INVALID (plan graph has integrity violations or missing dependencies)
 */
export async function getNextReadyPlanTask(
  userId: string,
  planId: string,
  projectId?: string
): Promise<NextReadyPlanTaskResult> {
  const status = await getPlanExecutionStatus(userId, planId, projectId);

  if (status.status === "INVALID" || (status.errors && status.errors.length > 0)) {
    return {
      state: "INVALID",
      task: null,
      errors: status.errors && status.errors.length > 0 ? status.errors : ["Plan graph is invalid or inconsistent"],
    };
  }

  if (status.status === "COMPLETED") {
    return {
      state: "COMPLETE",
      task: null,
    };
  }

  if (status.nextReadyTask) {
    return {
      state: "READY",
      task: status.nextReadyTask,
    };
  }

  return {
    state: "BLOCKED",
    task: null,
    blockedReasons:
      status.blockedReasons.length > 0
        ? status.blockedReasons
        : ["No ready task exists; all remaining tasks are blocked by incomplete prerequisites."],
  };
}

/**
 * Authorized Agent Operation Entry Point for Plan Execution Status.
 * Evaluates capability (READ tier), prevents caller spoofing, and logs audit record.
 */
export async function runSandboxedPlanStatus(
  context: AgentSafetyContext,
  input: PlanInspectorInput,
  targetUserId: string
): Promise<AgentOperationResult<PlanExecutionStatus>> {
  const operationName = "lifeos_workspace_plan_status";

  return await executeAgentOperation<PlanInspectorInput, PlanExecutionStatus>({
    context,
    toolName: operationName,
    operation: operationName,
    arguments: input,
    targetUserId,
    executor: async () => {
      return await getPlanExecutionStatus(targetUserId, input.planId, input.projectId);
    },
  });
}

/**
 * Authorized Agent Operation Entry Point for Deterministic Next-Task Resolution.
 * Evaluates capability (READ tier), prevents caller spoofing, and logs audit record.
 */
export async function runSandboxedNextTask(
  context: AgentSafetyContext,
  input: PlanInspectorInput,
  targetUserId: string
): Promise<AgentOperationResult<NextReadyPlanTaskResult>> {
  const operationName = "lifeos_workspace_next_task";

  return await executeAgentOperation<PlanInspectorInput, NextReadyPlanTaskResult>({
    context,
    toolName: operationName,
    operation: operationName,
    arguments: input,
    targetUserId,
    executor: async () => {
      return await getNextReadyPlanTask(targetUserId, input.planId, input.projectId);
    },
  });
}
