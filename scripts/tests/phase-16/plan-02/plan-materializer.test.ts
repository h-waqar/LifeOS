/**
 * Phase 16 Plan 16-02: Plan-to-Task Materialization Test Suite (WORK-03)
 *
 * Mandatory Adversarial & Validation Vectors:
 * 1. Plan schema validation (empty IDs, titles, empty steps, bounds)
 * 2. Duplicate step ID rejection
 * 3. Self-dependency rejection
 * 4. Missing dependency rejection
 * 5. Dependency cycle rejection (2-node, 3-node, disconnected cycles)
 * 6. Deterministic Kahn's topological sorting (dependencies before dependents)
 * 7. Target project validation (nonexistent, cross-tenant, archived)
 * 8. Full task & dependency graph materialization in database
 * 9. Deterministic ordering and tagging invariants
 * 10. Atomic transaction rollback on failure
 * 11. Idempotency (same planId + version returns existing task graph without duplicate rows)
 * 12. Version increment materialization
 * 13. Caller anti-spoofing assertion
 * 14. Agent capability evaluation (WRITE tier required; missing capability denied)
 * 15. Unknown operation fail-closed denial
 * 16. Financial shield enforcement
 * 17. Audit logging verification (agent audit log & domain audit log)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  validatePlanGraph,
  materializeDevelopmentPlan,
  runSandboxedPlanMaterialization,
  developmentPlanSchema,
} from "@/server/agents/workspace/plan-materializer";
import {
  PlanValidationError,
  PlanMaterializationError,
  type MaterializeDevelopmentPlanInput,
} from "@/server/agents/workspace/types";
import { classifyOperation, evaluateAgentPermission } from "@/server/agents/permissions/evaluator";
import type { AgentIdentity, AgentSafetyContext } from "@/server/agents/permissions/types";
import { FinancialShieldViolationError } from "@/server/agents/finance-shield";
import type { AgentAuditLog } from "@/server/db/schema/agents";

// Comprehensive In-Memory Mock Database supporting transactions, rollback, and Drizzle query patterns
interface StoredTask {
  id: string;
  userId: string;
  projectId: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  estimatedDuration: number | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface StoredDependency {
  id: string;
  userId: string;
  taskId: string;
  dependsOnTaskId: string;
}

interface StoredProject {
  id: string;
  userId: string;
  name: string;
  status: string;
}

import { getTableName } from "drizzle-orm";

function resolveTableName(table: any): string {
  if (typeof table === "string") return table;
  try {
    return getTableName(table) || "";
  } catch {
    return table?._?.name || table?.name || "";
  }
}

function extractValues(c: any): any[] {
  if (!c) return [];
  if (c.value !== undefined) {
    if (Array.isArray(c.value)) return c.value.flatMap(extractValues);
    return [c.value];
  }
  if (Array.isArray(c.queryChunks)) return c.queryChunks.flatMap(extractValues);
  return [];
}

class MockPlanDatabase {
  public projects: StoredProject[] = [];
  public tasks: StoredTask[] = [];
  public dependencies: StoredDependency[] = [];
  public auditLogs: any[] = [];
  public agentAuditLogs: AgentAuditLog[] = [];
  public shouldFailOnDependencyInsert = false;

  async transaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    const backupTasks = [...this.tasks];
    const backupDeps = [...this.dependencies];
    const backupAudit = [...this.auditLogs];

    try {
      return await callback(this);
    } catch (err) {
      // Rollback domain entity state on failure, but preserve forensic audit trail
      this.tasks = backupTasks;
      this.dependencies = backupDeps;
      this.auditLogs = backupAudit;
      throw err;
    }
  }

  select(fields?: any) {
    return {
      from: (table: any) => ({
        where: (condition: any) => ({
          limit: async (limitCount: number) => {
            return this.executeSelect(table, condition, limitCount);
          },
          then: (resolve: any, reject?: any) => {
            try {
              resolve(this.executeSelect(table, condition));
            } catch (err) {
              if (reject) reject(err);
              else throw err;
            }
          },
        }),
        then: (resolve: any, reject?: any) => {
          try {
            resolve(this.executeSelect(table, null));
          } catch (err) {
            if (reject) reject(err);
            else throw err;
          }
        },
      }),
    };
  }

  private executeSelect(table: any, condition: any, limitCount?: number): any[] {
    const tableName = resolveTableName(table);
    const vals = extractValues(condition);

    if (tableName === "projects") {
      let filtered = [...this.projects];
      if (vals.length > 0) {
        filtered = this.projects.filter(
          (p) => vals.includes(p.id) && vals.includes(p.userId)
        );
      }
      return limitCount ? filtered.slice(0, limitCount) : filtered;
    }

    if (tableName === "task_dependencies") {
      let filtered = [...this.dependencies];
      const userVal = vals.find((v) => typeof v === "string" && this.dependencies.some((d) => d.userId === v));
      if (userVal) {
        filtered = filtered.filter((d) => d.userId === userVal);
      }
      return limitCount ? filtered.slice(0, limitCount) : filtered;
    }

    if (tableName === "tasks") {
      let filtered = [...this.tasks];
      const userVal = vals.find((v) => typeof v === "string" && (v.startsWith("user-") || this.tasks.some((t) => t.userId === v)));
      const projVal = vals.find((v) => typeof v === "string" && (v.startsWith("proj-") || this.projects.some((p) => p.id === v)));
      if (userVal && projVal) {
        filtered = this.tasks.filter((t) => t.userId === userVal && t.projectId === projVal);
      } else if (userVal) {
        filtered = this.tasks.filter((t) => t.userId === userVal);
      }
      return limitCount ? filtered.slice(0, limitCount) : filtered;
    }

    if (tableName === "agent_tokens") {
      return [{ id: "agent-dev-token-1" }, { id: "agent-reader-token-2" }];
    }

    return [];
  }

  insert(table: any) {
    const tableName = resolveTableName(table);

    return {
      values: (val: any) => {
        const executeInsert = () => {
          // 1. Agent Audit Log
          if (tableName === "agent_audit_log" || val.toolName) {
            const record: AgentAuditLog = {
              id: `audit-${Math.random().toString(36).slice(2)}`,
              userId: val.userId,
              agentTokenId: val.agentTokenId ?? null,
              agentName: val.agentName ?? null,
              provider: val.provider ?? null,
              sessionId: val.sessionId ?? null,
              toolName: val.toolName,
              capability: val.capability,
              operation: val.operation,
              resource: val.resource ?? null,
              arguments: val.arguments,
              argumentsHash: val.argumentsHash ?? null,
              challengeId: val.challengeId ?? null,
              challengeStatus: val.challengeStatus ?? null,
              status: val.status,
              beforeState: val.beforeState ?? null,
              afterState: val.afterState ?? null,
              stateDiff: val.stateDiff ?? null,
              durationMs: val.durationMs ?? null,
              errorMessage: val.errorMessage ?? null,
              ipAddress: val.ipAddress ?? null,
              userAgent: val.userAgent ?? null,
              createdAt: new Date(),
            };
            this.agentAuditLogs.push(record);
            return [record];
          }

          // 2. Domain Audit Log
          if (tableName === "audit_log" || val.action) {
            this.auditLogs.push(val);
            return [val];
          }

          // 3. Task Dependency
          if (tableName === "task_dependencies" || val.dependsOnTaskId) {
            if (this.shouldFailOnDependencyInsert) {
              throw new Error("Simulated database failure during dependency insertion");
            }
            const dep: StoredDependency = {
              id: `dep-${Math.random().toString(36).slice(2)}`,
              userId: val.userId,
              taskId: val.taskId,
              dependsOnTaskId: val.dependsOnTaskId,
            };
            this.dependencies.push(dep);
            return [dep];
          }

          // 4. Task
          if (tableName === "tasks" || val.title) {
            const task: StoredTask = {
              id: `task-${Math.random().toString(36).slice(2)}`,
              userId: val.userId,
              projectId: val.projectId,
              title: val.title,
              description: val.description ?? null,
              priority: val.priority ?? "medium",
              status: val.status ?? "todo",
              estimatedDuration: val.estimatedDuration ?? null,
              tags: val.tags ?? [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            this.tasks.push(task);
            return [task];
          }

          return [val];
        };

        return {
          returning: async () => executeInsert(),
          then: (resolve: any, reject?: any) => {
            try {
              resolve(executeInsert());
            } catch (err) {
              if (reject) reject(err);
              else throw err;
            }
          },
        };
      },
    };
  }
}

describe("Phase 16 Plan 16-02: Plan-to-Task Materialization (WORK-03)", () => {
  const testUserId = "user-hamza-1";
  const foreignUserId = "user-attacker-2";
  const testProjectId = "proj-lifeos-core";
  const archivedProjectId = "proj-archived-old";

  let mockDb: MockPlanDatabase;

  beforeEach(() => {
    mockDb = new MockPlanDatabase();

    // Populate active and archived projects
    mockDb.projects.push({
      id: testProjectId,
      userId: testUserId,
      name: "LifeOS Core System",
      status: "active",
    });

    mockDb.projects.push({
      id: archivedProjectId,
      userId: testUserId,
      name: "Old Legacy System",
      status: "archived",
    });

    mockDb.projects.push({
      id: "foreign-proj-1",
      userId: foreignUserId,
      name: "Foreign User Project",
      status: "active",
    });
  });

  describe("Plan Validation & Graph Integrity", () => {
    it("validates and parses a valid plan schema", () => {
      const input: MaterializeDevelopmentPlanInput = {
        planId: "plan-16-02",
        title: "Workspace Materialization & Verification",
        version: 1,
        projectId: testProjectId,
        steps: [
          {
            stepId: "step-1",
            title: "Implement Plan Materializer",
            priority: "high",
            estimatedDuration: 120,
          },
        ],
      };

      const result = validatePlanGraph(input);
      expect(result.plan.planId).toBe("plan-16-02");
      expect(result.topologicallySortedSteps.length).toBe(1);
      expect(result.topologicallySortedSteps[0].stepId).toBe("step-1");
    });

    it("rejects empty planId", () => {
      expect(() => {
        validatePlanGraph({
          planId: "   ",
          title: "Test Plan",
          projectId: testProjectId,
          steps: [{ stepId: "s1", title: "Task 1" }],
        });
      }).toThrow(PlanValidationError);
    });

    it("rejects plan with empty steps array", () => {
      expect(() => {
        validatePlanGraph({
          planId: "plan-empty",
          title: "Test Plan",
          projectId: testProjectId,
          steps: [],
        });
      }).toThrow(PlanValidationError);
    });

    it("rejects plan step with missing title", () => {
      expect(() => {
        validatePlanGraph({
          planId: "plan-invalid-step",
          title: "Test Plan",
          projectId: testProjectId,
          steps: [{ stepId: "s1", title: "" }],
        });
      }).toThrow(PlanValidationError);
    });

    it("rejects invalid priority value", () => {
      expect(() => {
        validatePlanGraph({
          planId: "plan-invalid-priority",
          title: "Test Plan",
          projectId: testProjectId,
          steps: [{ stepId: "s1", title: "Task", priority: "super-critical" as any }],
        });
      }).toThrow(PlanValidationError);
    });

    it("rejects negative estimated duration", () => {
      expect(() => {
        validatePlanGraph({
          planId: "plan-neg-duration",
          title: "Test Plan",
          projectId: testProjectId,
          steps: [{ stepId: "s1", title: "Task", estimatedDuration: -30 }],
        });
      }).toThrow(PlanValidationError);
    });

    it("rejects excessive estimated duration (> 10080 minutes / 1 week)", () => {
      expect(() => {
        validatePlanGraph({
          planId: "plan-huge-duration",
          title: "Test Plan",
          projectId: testProjectId,
          steps: [{ stepId: "s1", title: "Task", estimatedDuration: 20000 }],
        });
      }).toThrow(PlanValidationError);
    });

    it("rejects duplicate step IDs", () => {
      expect(() => {
        validatePlanGraph({
          planId: "plan-duplicate-steps",
          title: "Test Plan",
          projectId: testProjectId,
          steps: [
            { stepId: "step-1", title: "First Step" },
            { stepId: "step-1", title: "Second Step with duplicate ID" },
          ],
        });
      }).toThrow(PlanValidationError);
    });

    it("rejects self-dependency: step depending on itself", () => {
      expect(() => {
        validatePlanGraph({
          planId: "plan-self-dep",
          title: "Test Plan",
          projectId: testProjectId,
          steps: [
            { stepId: "step-1", title: "Self depending task", dependsOnStepIds: ["step-1"] },
          ],
        });
      }).toThrow(PlanValidationError);
    });

    it("rejects missing dependency: step depending on nonexistent step", () => {
      expect(() => {
        validatePlanGraph({
          planId: "plan-missing-dep",
          title: "Test Plan",
          projectId: testProjectId,
          steps: [
            { stepId: "step-1", title: "Task", dependsOnStepIds: ["ghost-step"] },
          ],
        });
      }).toThrow(PlanValidationError);
    });

    it("rejects 2-node dependency cycle (A -> B -> A)", () => {
      expect(() => {
        validatePlanGraph({
          planId: "plan-cycle-2",
          title: "Test Plan",
          projectId: testProjectId,
          steps: [
            { stepId: "A", title: "Task A", dependsOnStepIds: ["B"] },
            { stepId: "B", title: "Task B", dependsOnStepIds: ["A"] },
          ],
        });
      }).toThrow(PlanValidationError);
    });

    it("rejects 3-node dependency cycle (A -> B -> C -> A)", () => {
      expect(() => {
        validatePlanGraph({
          planId: "plan-cycle-3",
          title: "Test Plan",
          projectId: testProjectId,
          steps: [
            { stepId: "A", title: "Task A", dependsOnStepIds: ["C"] },
            { stepId: "B", title: "Task B", dependsOnStepIds: ["A"] },
            { stepId: "C", title: "Task C", dependsOnStepIds: ["B"] },
          ],
        });
      }).toThrow(PlanValidationError);
    });

    it("rejects cycle in disconnected subcomponent", () => {
      expect(() => {
        validatePlanGraph({
          planId: "plan-disconnected-cycle",
          title: "Test Plan",
          projectId: testProjectId,
          steps: [
            { stepId: "A", title: "Valid independent task" },
            { stepId: "B", title: "Valid dependent task", dependsOnStepIds: ["A"] },
            { stepId: "C", title: "Cycle task 1", dependsOnStepIds: ["D"] },
            { stepId: "D", title: "Cycle task 2", dependsOnStepIds: ["C"] },
          ],
        });
      }).toThrow(PlanValidationError);
    });

    it("sorts complex DAG into deterministic topological order", () => {
      // D depends on B and C; B depends on A; C depends on A; A has no deps
      const input: MaterializeDevelopmentPlanInput = {
        planId: "plan-dag-order",
        title: "DAG Order Test",
        projectId: testProjectId,
        steps: [
          { stepId: "D", title: "Final Step D", dependsOnStepIds: ["B", "C"] },
          { stepId: "B", title: "Middle Step B", dependsOnStepIds: ["A"] },
          { stepId: "C", title: "Middle Step C", dependsOnStepIds: ["A"] },
          { stepId: "A", title: "Root Step A" },
        ],
      };

      const result = validatePlanGraph(input);
      const stepIds = result.topologicallySortedSteps.map((s) => s.stepId);

      // A must come first
      expect(stepIds[0]).toBe("A");
      // B and C must come before D
      expect(stepIds.indexOf("B")).toBeLessThan(stepIds.indexOf("D"));
      expect(stepIds.indexOf("C")).toBeLessThan(stepIds.indexOf("D"));
      // D must be last
      expect(stepIds[3]).toBe("D");
    });
  });

  describe("Database Materialization & Persistence", () => {
    it("rejects materialization when target project does not exist", async () => {
      const input: MaterializeDevelopmentPlanInput = {
        planId: "plan-proj-missing",
        title: "Test Plan",
        projectId: "nonexistent-project-id",
        steps: [{ stepId: "s1", title: "Task 1" }],
      };

      await expect(materializeDevelopmentPlan(input, testUserId, mockDb)).rejects.toThrow(
        PlanValidationError
      );
    });

    it("rejects materialization into a foreign user's project (cross-tenant)", async () => {
      const input: MaterializeDevelopmentPlanInput = {
        planId: "plan-foreign-proj",
        title: "Test Plan",
        projectId: "foreign-proj-1", // belongs to foreignUserId
        steps: [{ stepId: "s1", title: "Task 1" }],
      };

      await expect(materializeDevelopmentPlan(input, testUserId, mockDb)).rejects.toThrow(
        PlanValidationError
      );
    });

    it("rejects materialization into an archived project", async () => {
      const input: MaterializeDevelopmentPlanInput = {
        planId: "plan-archived-proj",
        title: "Test Plan",
        projectId: archivedProjectId,
        steps: [{ stepId: "s1", title: "Task 1" }],
      };

      await expect(materializeDevelopmentPlan(input, testUserId, mockDb)).rejects.toThrow(
        PlanValidationError
      );
    });

    it("successfully materializes a multi-step plan with dependencies into tasks", async () => {
      const input: MaterializeDevelopmentPlanInput = {
        planId: "plan-auth-flow",
        title: "Implement Passkey Authentication",
        version: 1,
        projectId: testProjectId,
        description: "Core authentication upgrade",
        steps: [
          {
            stepId: "step-schema",
            title: "Define DB Schema",
            description: "Add passkey table",
            priority: "high",
            estimatedDuration: 60,
          },
          {
            stepId: "step-service",
            title: "Implement Passkey Service",
            description: "Service wrapper for WebAuthn",
            priority: "critical",
            estimatedDuration: 120,
            dependsOnStepIds: ["step-schema"],
          },
        ],
      };

      const result = await materializeDevelopmentPlan(input, testUserId, mockDb);

      expect(result.success).toBe(true);
      expect(result.idempotent).toBe(false);
      expect(result.taskCount).toBe(2);
      expect(result.dependencyCount).toBe(1);
      expect(result.planId).toBe("plan-auth-flow");

      // Verify tasks persisted in database
      expect(mockDb.tasks.length).toBe(2);
      const schemaTask = mockDb.tasks.find((t) => t.title === "Define DB Schema")!;
      const serviceTask = mockDb.tasks.find((t) => t.title === "Implement Passkey Service")!;

      expect(schemaTask).toBeDefined();
      expect(serviceTask).toBeDefined();
      expect(schemaTask.userId).toBe(testUserId);
      expect(schemaTask.projectId).toBe(testProjectId);
      expect(schemaTask.priority).toBe("high");
      expect(schemaTask.estimatedDuration).toBe(60);
      expect(schemaTask.status).toBe("todo");

      // Verify plan tags
      expect(schemaTask.tags).toContain("plan-materialized");
      expect(schemaTask.tags).toContain("plan:plan-auth-flow");
      expect(schemaTask.tags).toContain("plan-version:1");
      expect(schemaTask.tags).toContain("plan-step:step-schema");

      // Verify dependency persisted
      expect(mockDb.dependencies.length).toBe(1);
      const dep = mockDb.dependencies[0];
      expect(dep.userId).toBe(testUserId);
      expect(dep.taskId).toBe(serviceTask.id); // serviceTask depends on schemaTask
      expect(dep.dependsOnTaskId).toBe(schemaTask.id);

      // Verify domain audit log was written
      expect(mockDb.auditLogs.length).toBe(1);
      expect(mockDb.auditLogs[0].action).toBe("workspace.materialize_plan");
      expect(mockDb.auditLogs[0].status).toBe("success");
    });

    it("rolls back all tasks atomically if a database error occurs during dependency insertion", async () => {
      mockDb.shouldFailOnDependencyInsert = true;

      const input: MaterializeDevelopmentPlanInput = {
        planId: "plan-atomic-fail",
        title: "Atomic Rollback Verification",
        projectId: testProjectId,
        steps: [
          { stepId: "s1", title: "Step 1" },
          { stepId: "s2", title: "Step 2", dependsOnStepIds: ["s1"] },
        ],
      };

      await expect(materializeDevelopmentPlan(input, testUserId, mockDb)).rejects.toThrow(
        PlanMaterializationError
      );

      // Atomicity check: no orphan tasks or dependencies remain
      expect(mockDb.tasks.length).toBe(0);
      expect(mockDb.dependencies.length).toBe(0);
    });
  });

  describe("Idempotency", () => {
    it("returns existing task graph without creating duplicate rows on repeated materialization", async () => {
      const input: MaterializeDevelopmentPlanInput = {
        planId: "plan-idempotent-test",
        title: "Idempotent Execution",
        version: "v1.0",
        projectId: testProjectId,
        steps: [
          { stepId: "step-1", title: "Idempotent Step 1", priority: "medium" },
          { stepId: "step-2", title: "Idempotent Step 2", priority: "high", dependsOnStepIds: ["step-1"] },
        ],
      };

      // First run: fresh materialization
      const run1 = await materializeDevelopmentPlan(input, testUserId, mockDb);
      expect(run1.success).toBe(true);
      expect(run1.idempotent).toBe(false);
      expect(run1.taskCount).toBe(2);
      expect(run1.dependencyCount).toBe(1);
      expect(mockDb.tasks.length).toBe(2);
      expect(mockDb.dependencies.length).toBe(1);

      const firstTaskIds = run1.tasks.map((t) => t.taskId);

      // Second run: exact same input
      const run2 = await materializeDevelopmentPlan(input, testUserId, mockDb);
      expect(run2.success).toBe(true);
      expect(run2.idempotent).toBe(true);
      expect(run2.taskCount).toBe(2);
      expect(run2.dependencyCount).toBe(1);

      // DB row counts MUST NOT have increased
      expect(mockDb.tasks.length).toBe(2);
      expect(mockDb.dependencies.length).toBe(1);

      // Task IDs must match the first run
      const secondTaskIds = run2.tasks.map((t) => t.taskId);
      expect(secondTaskIds).toEqual(firstTaskIds);
    });

    it("allows materializing a new version of the plan", async () => {
      const inputV1: MaterializeDevelopmentPlanInput = {
        planId: "plan-versioning",
        title: "Versioned Plan",
        version: 1,
        projectId: testProjectId,
        steps: [{ stepId: "s1", title: "Version 1 Task" }],
      };

      const resV1 = await materializeDevelopmentPlan(inputV1, testUserId, mockDb);
      expect(resV1.idempotent).toBe(false);
      expect(mockDb.tasks.length).toBe(1);

      const inputV2: MaterializeDevelopmentPlanInput = {
        planId: "plan-versioning",
        title: "Versioned Plan Updated",
        version: 2,
        projectId: testProjectId,
        steps: [
          { stepId: "s1", title: "Version 2 Task" },
          { stepId: "s2", title: "Version 2 Additional Task", dependsOnStepIds: ["s1"] },
        ],
      };

      const resV2 = await materializeDevelopmentPlan(inputV2, testUserId, mockDb);
      expect(resV2.idempotent).toBe(false);
      expect(resV2.taskCount).toBe(2);
      // Now total tasks in DB is 3 (1 from v1, 2 from v2)
      expect(mockDb.tasks.length).toBe(3);
    });
  });

  describe("Zero-Trust Safety Boundary & Authorization", () => {
    const authorizedAgent: AgentIdentity = {
      id: "agent-dev-token-1",
      userId: testUserId,
      name: "Autonomous Developer",
      tokenPrefix: "ag_dev",
      provider: "google",
      status: "active",
      expiresAt: null,
      capabilities: new Set(["READ", "WRITE", "EXECUTE"]),
      permissions: [
        { capability: "WRITE", resource: "workspace", action: "*", allowed: true },
        { capability: "WRITE", resource: "tasks", action: "*", allowed: true },
      ],
    };

    const readOnlyAgent: AgentIdentity = {
      id: "agent-reader-token-2",
      userId: testUserId,
      name: "Read Only Agent",
      tokenPrefix: "ag_read",
      provider: "google",
      status: "active",
      expiresAt: null,
      capabilities: new Set(["READ"]),
      permissions: [
        { capability: "READ", resource: "*", action: "*", allowed: true },
      ],
    };

    it("allows authorized agent with WRITE capability to materialize plan", async () => {
      const context: AgentSafetyContext = {
        isAgent: true,
        agent: authorizedAgent,
        user: { id: testUserId },
      };

      const input: MaterializeDevelopmentPlanInput = {
        planId: "plan-auth-agent-test",
        title: "Agent Plan",
        version: 1,
        projectId: testProjectId,
        steps: [{ stepId: "s1", title: "Authorized Agent Task" }],
      };

      const result = await runSandboxedPlanMaterialization(
        context,
        input,
        testUserId,
        mockDb
      );

      expect(result.status).toBe("EXECUTED");
      if (result.status === "EXECUTED") {
        expect(result.data.success).toBe(true);
        expect(result.data.taskCount).toBe(1);
      }

      // Verify forensic audit log created in agent_audit_logs
      expect(mockDb.agentAuditLogs.length).toBeGreaterThan(0);
      const audit = mockDb.agentAuditLogs.find(
        (a) => a.operation === "workspace.materialize_plan"
      );
      expect(audit).toBeDefined();
      expect(audit?.status).toBe("EXECUTED");
      expect(audit?.capability).toBe("WRITE");
      expect(audit?.userId).toBe(testUserId);
    });

    it("rejects agent lacking WRITE capability", async () => {
      const context: AgentSafetyContext = {
        isAgent: true,
        agent: readOnlyAgent,
        user: { id: testUserId },
      };

      const input: MaterializeDevelopmentPlanInput = {
        planId: "plan-unauthorized",
        title: "Unauthorized Agent Plan",
        version: 1,
        projectId: testProjectId,
        steps: [{ stepId: "s1", title: "Task" }],
      };

      await expect(
        runSandboxedPlanMaterialization(context, input, testUserId, mockDb)
      ).rejects.toThrow(/permission denied/i);

      // Verify DENIED audit log recorded
      const deniedLog = mockDb.agentAuditLogs.find((a) => a.status === "DENIED");
      expect(deniedLog).toBeDefined();
      expect(deniedLog?.operation).toBe("workspace.materialize_plan");
    });

    it("rejects caller spoofing attempt (targetUserId mismatch)", async () => {
      const context: AgentSafetyContext = {
        isAgent: true,
        agent: authorizedAgent,
        user: { id: testUserId },
      };

      const input: MaterializeDevelopmentPlanInput = {
        planId: "plan-spoofing",
        title: "Spoofed Plan",
        projectId: testProjectId,
        steps: [{ stepId: "s1", title: "Task" }],
        userId: foreignUserId, // Attempt to inject forged userId
      };

      await expect(
        runSandboxedPlanMaterialization(context, input, testUserId, mockDb)
      ).rejects.toThrow();
    });

    it("denies unknown operations by default (fail-closed)", () => {
      const op = "workspace.nonexistent_arbitrary_mutation";
      const classification = classifyOperation(op);
      const decision = evaluateAgentPermission(authorizedAgent, op, testUserId);
      expect(decision.granted).toBe(false);
      expect(decision.reason).toContain("unclassified");
    });

    it("maintains financial isolation (workspace.materialize_plan is not a financial mutation)", () => {
      const classification = classifyOperation("workspace.materialize_plan");
      expect(classification.isFinancialMutation).toBe(false);
      expect(classification.domain).toBe("workspace");
      expect(classification.capability).toBe("WRITE");
    });
  });
});
