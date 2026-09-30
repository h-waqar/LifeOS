// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import {
  user,
  tasks,
  projects,
  notifications,
  automations,
  automationRuns,
  auditLog,
} from "@/server/db/schema";
import { auth } from "@/server/auth";
import { eq, and, sql } from "drizzle-orm";
import {
  eventBus,
  createDomainEvent,
} from "@/server/events";
import { createTask, updateTask } from "@/server/tasks/service";
import { createProject, updateProject } from "@/server/projects/service";
import {
  createAutomation,
  getAutomationRuns,
  getAutomationById,
  clearAllAutomations,
} from "@/server/automations/service";
import { registerAutomationEngine } from "@/server/automations/engine";

describe("Plan 07-03: Automation Engine & Rule Execution Lifecycle (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p07_auto_engine@example.com",
    password: "Plan07EnginePassword123!",
    name: "Automation Engine Tester",
  };

  let testUserId: string;

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    // Reset user table for clean environment
    await db.delete(user);

    const res = await auth.api.signUpEmail({
      body: testUser,
      asResponse: true,
    });
    expect(res.status).toBe(200);

    const [u] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testUser.email));
    testUserId = u.id;
  });

  afterAll(async () => {
    eventBus.clearSubscribers();
    if (probe?.isAvailable) {
      await db.delete(user);
      await closeDatabase();
    }
  });

  beforeEach(async () => {
    if (!probe?.isAvailable) return;

    eventBus.clearSubscribers();
    registerAutomationEngine(eventBus);

    // Clean up domain entities for this user
    await db.delete(notifications).where(eq(notifications.userId, testUserId));
    await clearAllAutomations(testUserId);
    await db.delete(tasks).where(eq(tasks.userId, testUserId));
    await db.delete(projects).where(eq(projects.userId, testUserId));
  });

  describe("Event-Triggered Automations & Actions", () => {
    it("triggers configured automation and creates notification when task is completed", async () => {
      if (!probe.isAvailable) return;

      // 1. Create automation: on task.completed with priority=high -> create notification
      const rule = await createAutomation(testUserId, {
        name: "Notify on High Priority Task Done",
        triggerType: "event",
        triggerConfig: { eventName: "task.completed" },
        conditions: [
          { field: "task.priority", operator: "equals", value: "high" },
        ],
        actionType: "create_notification",
        actionConfig: {
          title: "High Priority Task Completed!",
          message: "Task '{{task.title}}' has been completed.",
          type: "success",
        },
      });

      // 2. Create task with high priority
      const task = await createTask(testUserId, {
        title: "Deploy Event Engine",
        priority: "high",
      });

      // 3. Mark task completed (this triggers task.completed event post-commit)
      await updateTask(testUserId, task.id, {
        status: "completed",
      });

      // 4. Drain event bus to ensure all asynchronous handlers settle
      await eventBus.drain();

      // 5. Verify notification was created
      const notifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, testUserId));

      expect(notifs).toHaveLength(1);
      expect(notifs[0].title).toBe("High Priority Task Completed!");
      expect(notifs[0].message).toBe("Task 'Deploy Event Engine' has been completed.");
      expect(notifs[0].type).toBe("success");

      // 6. Verify automation run record
      const runs = await getAutomationRuns(testUserId, rule.id);
      expect(runs).toHaveLength(1);
      expect(runs[0].status).toBe("success");
      expect(runs[0].triggerEvent).toBe("task.completed");
      expect(runs[0].executionDurationMs).toBeGreaterThanOrEqual(0);
      expect(runs[0].errorMessage).toBeNull();
      expect(runs[0].contextSnapshot).toBeDefined();

      // 7. Verify rule execution count incremented
      const updatedRule = await getAutomationById(testUserId, rule.id);
      expect(updatedRule.executionCount).toBe(1);
      expect(updatedRule.lastRunAt).not.toBeNull();
    });

    it("triggers follow-up task creation from completed task", async () => {
      if (!probe.isAvailable) return;

      // Rule: When task.completed -> create a follow-up task
      const rule = await createAutomation(testUserId, {
        name: "Create Followup Task",
        triggerType: "event",
        triggerConfig: { eventName: "task.completed" },
        conditions: [
          { field: "task.title", operator: "contains", value: "Initial Draft" },
        ],
        actionType: "create_task",
        actionConfig: {
          title: "Review Final: {{task.title}}",
          priority: "high",
          dueOffsetDays: 2,
        },
      });

      const initialTask = await createTask(testUserId, {
        title: "Initial Draft of PRD",
        priority: "medium",
      });

      await updateTask(testUserId, initialTask.id, {
        status: "completed",
      });

      await eventBus.drain();

      // Check tasks: should now have initial task + follow-up task
      const userTasks = await db
        .select()
        .from(tasks)
        .where(eq(tasks.userId, testUserId));

      const followup = userTasks.find((t) => t.title.includes("Review Final"));
      expect(followup).toBeDefined();
      expect(followup?.title).toBe("Review Final: Initial Draft of PRD");
      expect(followup?.priority).toBe("high");
      expect(followup?.dueDate).toBeDefined();

      const runs = await getAutomationRuns(testUserId, rule.id);
      expect(runs).toHaveLength(1);
      expect(runs[0].status).toBe("success");
    });

    it("updates project status to completed when project.all_tasks_completed is emitted", async () => {
      if (!probe.isAvailable) return;

      const project = await createProject(testUserId, {
        name: "Phase 7 Automations Milestone",
        status: "active",
      });

      const rule = await createAutomation(testUserId, {
        name: "Auto-Complete Project",
        triggerType: "event",
        triggerConfig: { eventName: "project.all_tasks_completed" },
        conditions: [],
        actionType: "update_project",
        actionConfig: {
          projectId: "{{project.id}}",
          status: "completed",
        },
      });

      // Publish project.all_tasks_completed
      await eventBus.publish(
        createDomainEvent("project.all_tasks_completed", testUserId, {
          project,
        })
      );
      await eventBus.drain();

      const [updatedProj] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.userId, testUserId), eq(projects.id, project.id)));

      expect(updatedProj.status).toBe("completed");

      const runs = await getAutomationRuns(testUserId, rule.id);
      expect(runs).toHaveLength(1);
      expect(runs[0].status).toBe("success");
    });
  });

  describe("Rule Filtering & Conditions", () => {
    it("ignores inactive rules", async () => {
      if (!probe.isAvailable) return;

      const rule = await createAutomation(testUserId, {
        name: "Disabled Rule",
        triggerType: "event",
        triggerConfig: { eventName: "task.created" },
        conditions: [],
        actionType: "create_notification",
        actionConfig: {
          title: "Should Not Appear",
          message: "Disabled rule fired",
        },
        isActive: false,
      });

      await createTask(testUserId, { title: "Some Task" });
      await eventBus.drain();

      const notifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, testUserId));
      expect(notifs).toHaveLength(0);

      const runs = await getAutomationRuns(testUserId, rule.id);
      expect(runs).toHaveLength(0);
    });

    it("skips execution and logs skipped run when conditions do not match", async () => {
      if (!probe.isAvailable) return;

      // Rule requires priority == critical
      const rule = await createAutomation(testUserId, {
        name: "Critical Task Alert",
        triggerType: "event",
        triggerConfig: { eventName: "task.created" },
        conditions: [
          { field: "task.priority", operator: "equals", value: "critical" },
        ],
        actionType: "create_notification",
        actionConfig: {
          title: "Critical Alert",
          message: "A critical task was created!",
        },
      });

      // Create a low priority task
      await createTask(testUserId, {
        title: "Low Priority Maintenance",
        priority: "low",
      });
      await eventBus.drain();

      // No notification should be created
      const notifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, testUserId));
      expect(notifs).toHaveLength(0);

      // Verify run status is 'skipped'
      const runs = await getAutomationRuns(testUserId, rule.id);
      expect(runs).toHaveLength(1);
      expect(runs[0].status).toBe("skipped");
      expect(runs[0].errorMessage).toContain("Conditions did not match");

      // Execution count remains 0
      const storedRule = await getAutomationById(testUserId, rule.id);
      expect(storedRule.executionCount).toBe(0);
    });
  });

  describe("Recursion Limit & Infinite Loop Defense", () => {
    it("detects and halts execution cascades when depth >= 3", async () => {
      if (!probe.isAvailable) return;

      // Create an automation rule listening to system.morning_routine_due
      const rule = await createAutomation(testUserId, {
        name: "Morning Cascade Guard Rule",
        triggerType: "event",
        triggerConfig: { eventName: "system.morning_routine_due" },
        conditions: [],
        actionType: "log_audit",
        actionConfig: {
          action: "automation.test_action",
        },
      });

      // Publish an event that arrives at depth 3
      const deepEvent = createDomainEvent(
        "system.morning_routine_due",
        testUserId,
        { userId: testUserId, date: "2026-09-23", targetHour: "08:00" },
        { depth: 3 }
      );

      // publish directly catches or engine stops
      try {
        await eventBus.publish(deepEvent);
      } catch (err: any) {
        expect(err.code).toBe("RECURSION_LIMIT_EXCEEDED");
      }
      await eventBus.drain();

      // Verify audit log has recursion limit exceeded
      const auditEntries = await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.userId, testUserId),
            eq(auditLog.category, "security")
          )
        );

      const hasRecursionAudit = auditEntries.some(
        (entry) =>
          entry.action === "system.recursion_limit_exceeded" ||
          entry.action === "automation.max_depth_exceeded"
      );
      expect(hasRecursionAudit).toBe(true);

      // Verify rule execution was halted and marked failed
      const runs = await getAutomationRuns(testUserId, rule.id);
      if (runs.length > 0) {
        expect(runs[0].status).toBe("failed");
        expect(runs[0].errorMessage).toBe("MAX_DEPTH_EXCEEDED");
      }
    });
  });

  describe("Audit Trail & Telemetry Invariants", () => {
    it("records accurate execution duration and context snapshot in automation_runs", async () => {
      if (!probe.isAvailable) return;

      const rule = await createAutomation(testUserId, {
        name: "Audit Trail Telemetry Test",
        triggerType: "event",
        triggerConfig: { eventName: "task.created" },
        conditions: [],
        actionType: "log_audit",
        actionConfig: {
          action: "custom.automation_logged",
        },
      });

      await createTask(testUserId, { title: "Telemetry Task" });
      await eventBus.drain();

      const runs = await getAutomationRuns(testUserId, rule.id);
      expect(runs).toHaveLength(1);
      const run = runs[0];

      expect(run.status).toBe("success");
      expect(typeof run.executionDurationMs).toBe("number");
      expect(run.executionDurationMs).toBeGreaterThanOrEqual(0);
      expect(run.contextSnapshot).toBeDefined();
      expect((run.contextSnapshot as any).task?.title).toBe("Telemetry Task");

      // Verify audit log entry for automation.executed
      const [execAudit] = await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.userId, testUserId),
            eq(auditLog.action, "automation.executed"),
            sql`${auditLog.details}->>'automationId' = ${rule.id}`
          )
        );
      expect(execAudit).toBeDefined();
      expect(execAudit.actor).toBe(`user:${testUserId}`);
      expect((execAudit.details as any)?.automationId).toBe(rule.id);
    });
  });
});
