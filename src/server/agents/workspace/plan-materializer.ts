/**
 * Plan-to-Task Materialization Engine
 *
 * Requirements:
 * - WORK-03: Agents can convert an approved implementation plan into structured
 *   LifeOS tasks linked to an active project with priority, estimated duration,
 *   and dependency ordering.
 *
 * Security & Reliability Invariants:
 * - Complete input validation (Zod schema, length bounds, allowed enums).
 * - Graph validation: duplicate step ID rejection, missing dependency rejection,
 *   self-dependency rejection, and cycle detection (Kahn's topological sort).
 * - Target project validation: project must exist for the authenticated user and not be archived.
 * - Idempotency: repeated submission of the same (planId, version, projectId) returns
 *   the existing materialized task graph without creating duplicate rows.
 * - Atomic transactions: all tasks, dependencies, and audit records commit or rollback together.
 * - Zero-trust execution boundary: all agent invocations route through executeAgentOperation.
 * - Financial shield: workspace cannot mutate finances.
 */

import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { db as defaultDb } from "@/server/db";
import { tasks, projects, taskDependencies } from "@/server/db/schema";
import { createAuditLog } from "@/server/audit";
import { executeAgentOperation, type AgentOperationResult } from "../safety-boundary";
import type { AgentSafetyContext } from "../permissions/types";
import {
  type MaterializeDevelopmentPlanInput,
  type PlanStepInput,
  type PlanMaterializationResult,
  type PlanMaterializationTaskSummary,
  type PlanMaterializationDependencySummary,
  type TaskPriority,
  PlanValidationError,
  PlanMaterializationError,
} from "./types";

export const planStepSchema = z
  .object({
    stepId: z
      .string()
      .trim()
      .min(1, "Step ID cannot be empty")
      .max(100, "Step ID cannot exceed 100 characters"),
    title: z
      .string()
      .trim()
      .min(1, "Step title cannot be empty")
      .max(255, "Step title cannot exceed 255 characters"),
    description: z
      .string()
      .trim()
      .max(4000, "Step description cannot exceed 4000 characters")
      .nullish(),
    priority: z
      .enum(["low", "medium", "high", "critical"])
      .default("medium"),
    estimatedDuration: z
      .number()
      .int()
      .min(0, "Estimated duration cannot be negative")
      .max(10080, "Estimated duration cannot exceed 10080 minutes (1 week)")
      .nullish(),
    dependsOnStepIds: z
      .array(z.string().trim().min(1, "Dependency step ID cannot be empty"))
      .default([]),
    tags: z
      .array(z.string().trim().min(1).max(50))
      .max(20, "Cannot specify more than 20 tags per step")
      .optional(),
  })
  .strict();

export const developmentPlanSchema = z
  .object({
    planId: z
      .string()
      .trim()
      .min(1, "Plan ID cannot be empty")
      .max(100, "Plan ID cannot exceed 100 characters"),
    title: z
      .string()
      .trim()
      .min(1, "Plan title cannot be empty")
      .max(255, "Plan title cannot exceed 255 characters"),
    version: z
      .union([
        z.number().int().min(1),
        z.string().trim().min(1).max(50),
      ])
      .default(1),
    projectId: z
      .string()
      .trim()
      .min(1, "Project ID cannot be empty")
      .max(100, "Project ID cannot exceed 100 characters"),
    description: z
      .string()
      .trim()
      .max(4000, "Plan description cannot exceed 4000 characters")
      .nullish(),
    steps: z
      .array(planStepSchema)
      .min(1, "Plan must contain at least one step")
      .max(100, "Plan cannot exceed 100 steps"),
  })
  .strict();

export interface ValidatedPlanGraph {
  plan: z.infer<typeof developmentPlanSchema>;
  topologicallySortedSteps: PlanStepInput[];
  stepMap: Map<string, PlanStepInput>;
  stepOriginalIndex: Map<string, number>;
}

/**
 * Validates plan structure, step uniqueness, dependency integrity, and absence of cycles.
 * Returns steps in deterministic topological order (dependencies precede dependents).
 */
export function validatePlanGraph(rawInput: unknown): ValidatedPlanGraph {
  let parsed: z.infer<typeof developmentPlanSchema>;
  try {
    parsed = developmentPlanSchema.parse(rawInput);
  } catch (err: any) {
    const message = err.errors?.[0]?.message || err.message || "Invalid development plan schema";
    throw new PlanValidationError(message, "INVALID_PLAN_SCHEMA");
  }

  const { steps } = parsed;
  const stepMap = new Map<string, PlanStepInput>();
  const inDegree = new Map<string, number>();
  const adjacencyList = new Map<string, string[]>(); // dependency -> list of dependent steps
  const stepOriginalIndex = new Map<string, number>();

  // 1. Detect duplicate step IDs & initialize graph structures
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (stepMap.has(step.stepId)) {
      throw new PlanValidationError(
        `Duplicate step ID detected: '${step.stepId}'`,
        "DUPLICATE_STEP_ID"
      );
    }
    stepMap.set(step.stepId, step);
    stepOriginalIndex.set(step.stepId, i);
    inDegree.set(step.stepId, 0);
    adjacencyList.set(step.stepId, []);
  }

  // 2. Validate dependencies (self-dependency, unknown dependency, in-degree calculation)
  for (const step of steps) {
    const uniqueDeps = new Set(step.dependsOnStepIds || []);
    for (const depId of uniqueDeps) {
      if (depId === step.stepId) {
        throw new PlanValidationError(
          `Self-dependency detected: step '${step.stepId}' cannot depend on itself`,
          "SELF_DEPENDENCY"
        );
      }
      if (!stepMap.has(depId)) {
        throw new PlanValidationError(
          `Missing dependency: step '${step.stepId}' depends on unknown step '${depId}'`,
          "MISSING_DEPENDENCY"
        );
      }

      // Edge: depId -> step.stepId (depId must complete before step.stepId)
      adjacencyList.get(depId)!.push(step.stepId);
      inDegree.set(step.stepId, (inDegree.get(step.stepId) || 0) + 1);
    }
  }

  // 3. Kahn's Algorithm for Topological Sort & Cycle Detection
  // Use original index as tie-breaker for deterministic ordering
  const readyQueue: string[] = [];
  for (const [stepId, deg] of inDegree.entries()) {
    if (deg === 0) {
      readyQueue.push(stepId);
    }
  }

  readyQueue.sort((a, b) => stepOriginalIndex.get(a)! - stepOriginalIndex.get(b)!);

  const sortedSteps: PlanStepInput[] = [];

  while (readyQueue.length > 0) {
    const currentId = readyQueue.shift()!;
    sortedSteps.push(stepMap.get(currentId)!);

    const dependents = adjacencyList.get(currentId) || [];
    for (const dependentId of dependents) {
      const newDeg = inDegree.get(dependentId)! - 1;
      inDegree.set(dependentId, newDeg);
      if (newDeg === 0) {
        readyQueue.push(dependentId);
        // Maintain deterministic order
        readyQueue.sort((a, b) => stepOriginalIndex.get(a)! - stepOriginalIndex.get(b)!);
      }
    }
  }

  if (sortedSteps.length !== steps.length) {
    const unvisited = steps
      .filter((s) => !sortedSteps.some((sorted) => sorted.stepId === s.stepId))
      .map((s) => s.stepId);
    throw new PlanValidationError(
      `Dependency cycle detected among steps: ${unvisited.join(", ")}`,
      "DEPENDENCY_CYCLE"
    );
  }

  return {
    plan: parsed,
    topologicallySortedSteps: sortedSteps,
    stepMap,
    stepOriginalIndex,
  };
}

/**
 * Core domain function that materializes an implementation plan into LifeOS tasks.
 * Executes atomically in a transaction with idempotency and audit trail.
 */
export async function materializeDevelopmentPlan(
  input: MaterializeDevelopmentPlanInput,
  userId: string,
  dbClient?: any
): Promise<PlanMaterializationResult> {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new PlanValidationError("Valid user ID is required for plan materialization", "INVALID_USER_ID");
  }

  const { plan, topologicallySortedSteps, stepMap, stepOriginalIndex } = validatePlanGraph(input);
  const versionStr = String(plan.version);
  const planTag = `plan:${plan.planId}`;
  const versionTag = `plan-version:${versionStr}`;

  const runWithTransaction = async (tx: any): Promise<PlanMaterializationResult> => {
    // 1. Validate Target Project Ownership and State
    const [targetProject] = await tx
      .select({
        id: projects.id,
        userId: projects.userId,
        status: projects.status,
        name: projects.name,
      })
      .from(projects)
      .where(and(eq(projects.id, plan.projectId), eq(projects.userId, userId)))
      .limit(1);

    if (!targetProject) {
      throw new PlanValidationError(
        `Target project '${plan.projectId}' not found or access denied`,
        "PROJECT_NOT_FOUND"
      );
    }

    if (targetProject.status === "archived") {
      throw new PlanValidationError(
        `Target project '${plan.projectId}' is archived. Tasks cannot be materialized into an archived project`,
        "PROJECT_ARCHIVED"
      );
    }

    // 2. Idempotency Check: check if this plan and version was already materialized for this project
    const existingProjectTasks = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.projectId, plan.projectId)));

    const matchingTasks = existingProjectTasks.filter((t: any) => {
      const tags = Array.isArray(t.tags) ? (t.tags as string[]) : [];
      return tags.includes(planTag) && tags.includes(versionTag);
    });

    // Check if all steps have an existing task
    const existingStepTaskMap = new Map<string, any>();
    for (const t of matchingTasks) {
      const tags = Array.isArray(t.tags) ? (t.tags as string[]) : [];
      const stepTag = tags.find((tag) => tag.startsWith("plan-step:"));
      if (stepTag) {
        const stepId = stepTag.slice("plan-step:".length);
        existingStepTaskMap.set(stepId, t);
      }
    }

    // 2. Reconciliation: compare existing plan steps against desired plan steps
    const stepIdToTaskRow = new Map<string, any>();
    const missingSteps: PlanStepInput[] = [];

    for (const step of topologicallySortedSteps) {
      if (existingStepTaskMap.has(step.stepId)) {
        stepIdToTaskRow.set(step.stepId, existingStepTaskMap.get(step.stepId)!);
      } else {
        missingSteps.push(step);
      }
    }

    // 3. Atomically Create ONLY Missing Tasks in Deterministic Topological Order
    for (const step of missingSteps) {
      const stepTags = [
        "plan-materialized",
        planTag,
        versionTag,
        `plan-step:${step.stepId}`,
        `plan-order:${stepOriginalIndex.get(step.stepId)}`,
        ...(step.tags || []),
      ];

      const [insertedTask] = await tx
        .insert(tasks)
        .values({
          userId,
          projectId: plan.projectId,
          title: step.title,
          description: step.description ?? `Materialized from plan: ${plan.title} (${plan.planId})`,
          priority: step.priority,
          status: "todo",
          estimatedDuration: step.estimatedDuration ?? null,
          tags: stepTags,
        })
        .returning();

      stepIdToTaskRow.set(step.stepId, insertedTask);
    }

    // 4. Assemble Task Summaries for ALL steps in deterministic topological order
    const taskSummaries: PlanMaterializationTaskSummary[] = [];
    const allTaskIds: string[] = [];

    for (const step of topologicallySortedSteps) {
      const taskRow = stepIdToTaskRow.get(step.stepId)!;
      allTaskIds.push(taskRow.id);
      taskSummaries.push({
        stepId: step.stepId,
        taskId: taskRow.id,
        title: taskRow.title,
        priority: taskRow.priority as TaskPriority,
        estimatedDuration: taskRow.estimatedDuration,
        status: taskRow.status,
        tags: Array.isArray(taskRow.tags) ? taskRow.tags : [],
        orderIndex: stepOriginalIndex.get(step.stepId),
      });
    }

    // 5. Reconcile Dependencies (preserve existing, create missing)
    const existingDeps =
      allTaskIds.length > 0
        ? await tx
            .select()
            .from(taskDependencies)
            .where(
              and(
                eq(taskDependencies.userId, userId),
                inArray(taskDependencies.taskId, allTaskIds)
              )
            )
        : [];

    const existingDepKeys = new Set<string>(
      existingDeps.map((d: any) => `${d.taskId}->${d.dependsOnTaskId}`)
    );

    const depSummaries: PlanMaterializationDependencySummary[] = [];
    let createdDepsCount = 0;

    for (const step of topologicallySortedSteps) {
      const fromTask = stepIdToTaskRow.get(step.stepId)!;
      const uniqueDeps = Array.from(new Set(step.dependsOnStepIds || []));

      for (const depStepId of uniqueDeps) {
        const dependsOnTask = stepIdToTaskRow.get(depStepId);
        if (!dependsOnTask) continue;

        const depKey = `${fromTask.id}->${dependsOnTask.id}`;
        if (!existingDepKeys.has(depKey)) {
          await tx
            .insert(taskDependencies)
            .values({
              userId,
              taskId: fromTask.id,
              dependsOnTaskId: dependsOnTask.id,
            })
            .returning();

          existingDepKeys.add(depKey);
          createdDepsCount++;
        }

        depSummaries.push({
          fromStepId: step.stepId,
          toStepId: depStepId,
          taskId: fromTask.id,
          dependsOnTaskId: dependsOnTask.id,
        });
      }
    }

    const isIdempotent = missingSteps.length === 0 && createdDepsCount === 0;

    // 6. Domain Audit Logging (record mutation when new entities are created)
    if (!isIdempotent) {
      await createAuditLog(
        {
          userId,
          category: "mutation",
          action: "workspace.materialize_plan",
          status: "success",
          details: {
            planId: plan.planId,
            version: plan.version,
            projectId: plan.projectId,
            taskCount: taskSummaries.length,
            dependencyCount: depSummaries.length,
            newTasksCreated: missingSteps.length,
            newDependenciesCreated: createdDepsCount,
            taskIds: taskSummaries.map((t) => t.taskId),
          },
        },
        tx
      );
    }

    return {
      success: true,
      planId: plan.planId,
      version: plan.version,
      projectId: plan.projectId,
      taskCount: taskSummaries.length,
      dependencyCount: depSummaries.length,
      tasks: taskSummaries,
      dependencies: depSummaries,
      idempotent: isIdempotent,
      auditLogged: true,
    };
  };

  try {
    if (dbClient && typeof dbClient.transaction === "function") {
      return await dbClient.transaction(runWithTransaction);
    }
    if (!dbClient && typeof defaultDb.transaction === "function") {
      return await defaultDb.transaction(runWithTransaction);
    }
    return await runWithTransaction(dbClient || defaultDb);
  } catch (err: any) {
    if (err instanceof PlanValidationError) {
      throw err;
    }
    throw new PlanMaterializationError(
      `Plan materialization failed: ${err.message}`,
      err.code || "PERSISTENCE_FAILURE"
    );
  }
}

/**
 * Authorized Agent Operation Entry Point for Plan Materialization.
 * Gates invocation through executeAgentOperation, enforcing anti-spoofing,
 * capability evaluation (WRITE tier), financial shield, and forensic audit logging.
 */
export async function runSandboxedPlanMaterialization(
  context: AgentSafetyContext,
  input: MaterializeDevelopmentPlanInput,
  targetUserId: string,
  dbClient?: any
): Promise<AgentOperationResult<PlanMaterializationResult>> {
  const operationName = "workspace.materialize_plan";

  return await executeAgentOperation<MaterializeDevelopmentPlanInput, PlanMaterializationResult>({
    context,
    toolName: operationName,
    operation: operationName,
    arguments: input,
    targetUserId,
    dbClient,
    executor: async (tx?: any) => {
      return await materializeDevelopmentPlan(input, targetUserId, tx || dbClient);
    },
  });
}
