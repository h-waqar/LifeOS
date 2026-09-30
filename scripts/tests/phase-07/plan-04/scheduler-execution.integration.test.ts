// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import {
  user,
  tasks,
  goals,
  dailyPlans,
  eveningReviews,
  notifications,
  automations,
  automationRuns,
  schedulerLocks,
  auditLog,
} from "@/server/db/schema";
import { auth } from "@/server/auth";
import { eq, and } from "drizzle-orm";
import { NextRequest } from "next/server";
import {
  eventBus,
  type AnyDomainEvent,
} from "@/server/events";
import { createTask } from "@/server/tasks/service";
import { createGoal } from "@/server/goals/service";
import {
  saveMorningPlan,
  completeEveningReview,
} from "@/server/daily-plan/service";
import {
  listNotifications,
} from "@/server/notifications/service";

async function getNotifications(userId: string) {
  const res = await listNotifications(userId);
  return res.notifications;
}
import {
  createAutomation,
  clearAllAutomations,
} from "@/server/automations/service";
import { registerAutomationEngine } from "@/server/automations/engine";
import {
  acquireJobLock,
  isJobLocked,
  withJobLock,
} from "@/server/scheduler/lock-service";
import { schedulerEngine } from "@/server/scheduler/engine";
import { POST as cronPost, GET as cronGet } from "@/app/api/cron/scheduler/route";

describe("Plan 07-04: Background Scheduler & Periodic Sweepers (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p07_sched_user@example.com",
    password: "Plan07SchedPassword123!",
    name: "Scheduler Tenant",
  };

  let testUserId: string;
  const foreignUserId = "foreign_user_id_" + crypto.randomUUID().slice(0, 8);

  const TEST_CRON_SECRET = "test_cron_secret_token_1234567890abcdef";

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    process.env.CRON_SECRET = TEST_CRON_SECRET;

    // Reset user table for clean environment respecting single_user_lock
    await db.delete(user);

    // Register primary user
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

    // Clean up domain entities for clean test runs
    await db.delete(notifications).where(eq(notifications.userId, testUserId));
    await clearAllAutomations(testUserId);
    await db.delete(schedulerLocks).where(eq(schedulerLocks.userId, testUserId));
    await db.delete(tasks).where(eq(tasks.userId, testUserId));
    await db.delete(goals).where(eq(goals.userId, testUserId));
    await db.delete(dailyPlans).where(eq(dailyPlans.userId, testUserId));
    await db.delete(eveningReviews).where(eq(eveningReviews.userId, testUserId));
  });

  describe("1. Distributed Idempotency Locks (lock-service)", () => {
    it("acquires an idempotency lock atomically", async () => {
      if (!probe.isAvailable) return;
      const acquired = await acquireJobLock(testUserId, "test_job", "key_001");
      expect(acquired).toBe(true);

      const isLocked = await isJobLocked(testUserId, "key_001");
      expect(isLocked).toBe(true);
    });

    it("prevents double acquisition of the same idempotency key", async () => {
      if (!probe.isAvailable) return;
      const first = await acquireJobLock(testUserId, "test_job", "key_double");
      expect(first).toBe(true);

      // Concurrent or sequential second attempt must fail
      const second = await acquireJobLock(testUserId, "test_job", "key_double");
      expect(second).toBe(false);
    });

    it("enforces tenant isolation and foreign key constraints on job locks", async () => {
      if (!probe.isAvailable) return;
      const lockA = await acquireJobLock(testUserId, "morning_plan", "morning_plan:date_today");
      expect(lockA).toBe(true);

      // Attempting to acquire lock for non-existent foreign user fails due to DB FK constraint
      const lockForeign = await acquireJobLock(foreignUserId, "morning_plan", "morning_plan:date_today");
      expect(lockForeign).toBe(false);
    });

    it("executes routine with withJobLock and marks completed", async () => {
      if (!probe.isAvailable) return;
      let executed = false;
      const result = await withJobLock(testUserId, "test_with_lock", "key_routine", async () => {
        executed = true;
        return "job_success";
      });

      expect(result.executed).toBe(true);
      expect(result.result).toBe("job_success");
      expect(executed).toBe(true);

      // Verify lock status in database
      const [lockRow] = await db
        .select()
        .from(schedulerLocks)
        .where(
          and(
            eq(schedulerLocks.userId, testUserId),
            eq(schedulerLocks.idempotencyKey, "key_routine")
          )
        );
      expect(lockRow.status).toBe("completed");
      expect(lockRow.completedAt).not.toBeNull();
    });

    it("marks lock as failed when routine throws in withJobLock", async () => {
      if (!probe.isAvailable) return;
      await expect(
        withJobLock(testUserId, "test_fail", "key_fail", async () => {
          throw new Error("Job explosion");
        })
      ).rejects.toThrow("Job explosion");

      const [lockRow] = await db
        .select()
        .from(schedulerLocks)
        .where(
          and(
            eq(schedulerLocks.userId, testUserId),
            eq(schedulerLocks.idempotencyKey, "key_fail")
          )
        );
      expect(lockRow.status).toBe("failed");
    });
  });

  describe("2. Periodic Sweeper: Overdue Tasks", () => {
    it("detects overdue uncompleted tasks and dispatches notifications & domain events", async () => {
      if (!probe.isAvailable) return;
      // 1. Create an overdue task (due 3 days ago)
      const task = await createTask(testUserId, {
        title: "Submit Tax Return",
        priority: "high",
      });

      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      await db
        .update(tasks)
        .set({ dueDate: threeDaysAgo })
        .where(eq(tasks.id, task.id));

      // 2. Capture emitted events
      const events: AnyDomainEvent[] = [];
      eventBus.subscribe("task.overdue", (ev) => {
        events.push(ev);
      });

      // 3. Run sweeper at 14:00 (outside planning prompt windows)
      const summary = await schedulerEngine.runSweepers(testUserId, {
        referenceDate: new Date("2026-09-24T14:00:00Z"),
      });
      const overdueJob = summary.results.find((r) => r.jobName === "overdue_tasks");

      expect(overdueJob).toBeDefined();
      expect(overdueJob!.executed).toBe(true);

      // 4. Verify domain event
      expect(events.length).toBe(1);
      const ev = events[0];
      expect(ev.name).toBe("task.overdue");
      if (ev.name === "task.overdue") {
        expect(ev.payload.task.id).toBe(task.id);
        expect(ev.payload.daysOverdue).toBeGreaterThanOrEqual(3);
      }

      // 5. Verify in-app notification created
      const notifs = await getNotifications(testUserId);
      expect(notifs.length).toBe(1);
      expect(notifs[0].title).toBe("Overdue Task: Submit Tax Return");
      expect(notifs[0].type).toBe("warning");
      expect(notifs[0].entityType).toBe("task");
      expect(notifs[0].entityId).toBe(task.id);
    });

    it("ignores completed and cancelled tasks even if dueDate is in the past", async () => {
      if (!probe.isAvailable) return;
      // Create a completed task with past dueDate
      const completedTask = await createTask(testUserId, {
        title: "Already Finished Task",
      });
      await db
        .update(tasks)
        .set({
          status: "completed",
          dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          completedAt: new Date(),
        })
        .where(eq(tasks.id, completedTask.id));

      const summary = await schedulerEngine.runSweepers(testUserId, {
        referenceDate: new Date("2026-09-24T14:00:00Z"),
      });
      const overdueJob = summary.results.find((r) => r.jobName === "overdue_tasks");

      expect(overdueJob!.executed).toBe(false);
      expect(overdueJob!.skippedReason).toContain("No overdue tasks found");

      const notifs = await getNotifications(testUserId);
      expect(notifs.length).toBe(0);
    });

    it("ignores future tasks whose dueDate has not arrived yet", async () => {
      if (!probe.isAvailable) return;
      const futureTask = await createTask(testUserId, {
        title: "Future Milestone Task",
      });
      await db
        .update(tasks)
        .set({ dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) })
        .where(eq(tasks.id, futureTask.id));

      const summary = await schedulerEngine.runSweepers(testUserId, {
        referenceDate: new Date("2026-09-24T14:00:00Z"),
      });
      const overdueJob = summary.results.find((r) => r.jobName === "overdue_tasks");

      expect(overdueJob!.executed).toBe(false);
      const notifs = await getNotifications(testUserId);
      expect(notifs.length).toBe(0);
    });

    it("skips duplicate alerts for the same overdue task on the same day due to idempotency locks", async () => {
      if (!probe.isAvailable) return;
      const task = await createTask(testUserId, { title: "Monthly Report" });
      await db
        .update(tasks)
        .set({ dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) })
        .where(eq(tasks.id, task.id));

      // First run: executes
      const firstRun = await schedulerEngine.runSweepers(testUserId, {
        referenceDate: new Date("2026-09-24T14:00:00Z"),
      });
      const firstJob = firstRun.results.find((r) => r.jobName === "overdue_tasks");
      expect(firstJob!.executed).toBe(true);

      // Second immediate run: skipped due to lock
      const secondRun = await schedulerEngine.runSweepers(testUserId, {
        referenceDate: new Date("2026-09-24T14:00:00Z"),
      });
      const secondJob = secondRun.results.find((r) => r.jobName === "overdue_tasks");
      expect(secondJob!.executed).toBe(false);
      expect(secondJob!.skippedReason).toContain("already notified today");

      // Verify only 1 notification was delivered
      const notifs = await getNotifications(testUserId);
      expect(notifs.length).toBe(1);
    });
  });

  describe("3. Periodic Sweeper: Planning Prompts (Morning & Evening)", () => {
    it("triggers morning routine prompt when simulated in morning window (08:30) and plan not started", async () => {
      if (!probe.isAvailable) return;
      const simulatedMorning = new Date("2026-09-24T08:30:00.000Z");

      const events: AnyDomainEvent[] = [];
      eventBus.subscribe("system.morning_routine_due", (ev) => {
        events.push(ev);
      });

      const summary = await schedulerEngine.runSweepers(testUserId, {
        referenceDate: simulatedMorning,
        timezone: "UTC",
      });

      const promptJob = summary.results.find((r) => r.jobName === "planning_prompts");
      expect(promptJob!.executed).toBe(true);
      expect(promptJob!.details?.executedActions).toContain("morning_plan");

      expect(events.length).toBe(1);
      const ev = events[0];
      expect(ev.name).toBe("system.morning_routine_due");
      if (ev.name === "system.morning_routine_due") {
        expect(ev.payload.date).toBe("2026-09-24");
      }

      const notifs = await getNotifications(testUserId);
      expect(notifs.some((n) => n.title === "Plan Your Day")).toBe(true);
    });

    it("skips morning prompt if daily plan has already been started or completed for today", async () => {
      if (!probe.isAvailable) return;
      const simulatedMorning = new Date("2026-09-24T08:30:00.000Z");

      // Save a morning plan for today
      await saveMorningPlan(testUserId, {
        date: "2026-09-24",
        morningNotes: "Today I will focus on the scheduler architecture.",
        priorityTaskIds: [],
        habitIntentionIds: [],
      });

      const summary = await schedulerEngine.runSweepers(testUserId, {
        referenceDate: simulatedMorning,
        timezone: "UTC",
      });

      const promptJob = summary.results.find((r) => r.jobName === "planning_prompts");
      expect(promptJob!.executed).toBe(false);
      expect(promptJob!.skippedReason).toContain("already started or completed");

      const notifs = await getNotifications(testUserId);
      expect(notifs.length).toBe(0);
    });

    it("triggers evening review prompt when simulated in evening window (21:30) and review not completed", async () => {
      if (!probe.isAvailable) return;
      const simulatedEvening = new Date("2026-09-24T21:30:00.000Z");

      const events: AnyDomainEvent[] = [];
      eventBus.subscribe("system.evening_review_due", (ev) => {
        events.push(ev);
      });

      const summary = await schedulerEngine.runSweepers(testUserId, {
        referenceDate: simulatedEvening,
        timezone: "UTC",
      });

      const promptJob = summary.results.find((r) => r.jobName === "planning_prompts");
      expect(promptJob!.executed).toBe(true);
      expect(promptJob!.details?.executedActions).toContain("evening_review");

      expect(events.length).toBe(1);
      expect(events[0].name).toBe("system.evening_review_due");

      const notifs = await getNotifications(testUserId);
      expect(notifs.some((n) => n.title === "Daily Evening Review")).toBe(true);
    });

    it("skips evening review prompt if evening review has already been completed for today", async () => {
      if (!probe.isAvailable) return;
      const simulatedEvening = new Date("2026-09-24T21:30:00.000Z");

      // Create daily plan and complete evening review
      const plan = await saveMorningPlan(testUserId, {
        date: "2026-09-24",
        morningNotes: "Day plan notes",
        priorityTaskIds: [],
        habitIntentionIds: [],
      });

      await completeEveningReview(testUserId, {
        date: "2026-09-24",
        positiveReflections: "Great day accomplished everything.",
        challengesReflections: "None",
        completedTaskIds: [],
        incompleteTaskIds: [],
        completedHabitIds: [],
      });

      const summary = await schedulerEngine.runSweepers(testUserId, {
        referenceDate: simulatedEvening,
        timezone: "UTC",
      });

      const promptJob = summary.results.find((r) => r.jobName === "planning_prompts");
      expect(promptJob!.executed).toBe(false);
      expect(promptJob!.skippedReason).toContain("already completed");
    });

    it("skips prompts when local time is outside both morning and evening windows", async () => {
      if (!probe.isAvailable) return;
      const simulatedAfternoon = new Date("2026-09-24T14:30:00.000Z"); // 2:30 PM

      const summary = await schedulerEngine.runSweepers(testUserId, {
        referenceDate: simulatedAfternoon,
        timezone: "UTC",
      });

      const promptJob = summary.results.find((r) => r.jobName === "planning_prompts");
      expect(promptJob!.executed).toBe(false);
      expect(promptJob!.skippedReason).toContain("Outside planning prompt windows");
    });
  });

  describe("4. Periodic Sweeper: Stagnant Goals", () => {
    it("detects active goals unchanged for 14+ days and emits goal.stagnant with warning notification", async () => {
      if (!probe.isAvailable) return;
      const goal = await createGoal(testUserId, {
        title: "Master Quantum Computing",
        status: "in_progress",
      });

      const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
      await db
        .update(goals)
        .set({ updatedAt: twentyDaysAgo })
        .where(eq(goals.id, goal.id));

      const events: AnyDomainEvent[] = [];
      eventBus.subscribe("goal.stagnant", (ev) => {
        events.push(ev);
      });

      const summary = await schedulerEngine.runSweepers(testUserId);
      const goalJob = summary.results.find((r) => r.jobName === "stagnant_goals");

      expect(goalJob!.executed).toBe(true);

      expect(events.length).toBe(1);
      const ev = events[0];
      expect(ev.name).toBe("goal.stagnant");
      if (ev.name === "goal.stagnant") {
        expect(ev.payload.goal.id).toBe(goal.id);
        expect(ev.payload.daysWithoutProgress).toBeGreaterThanOrEqual(14);
      }

      const notifs = await getNotifications(testUserId);
      expect(notifs.some((n) => n.title.includes("Goal Needs Attention"))).toBe(true);
    });

    it("ignores recently updated goals (< 14 days)", async () => {
      if (!probe.isAvailable) return;
      const recentGoal = await createGoal(testUserId, {
        title: "Learn Rust",
        status: "in_progress",
      });

      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      await db
        .update(goals)
        .set({ updatedAt: fiveDaysAgo })
        .where(eq(goals.id, recentGoal.id));

      const summary = await schedulerEngine.runSweepers(testUserId);
      const goalJob = summary.results.find((r) => r.jobName === "stagnant_goals");

      expect(goalJob!.executed).toBe(false);
      expect(goalJob!.skippedReason).toContain("No stagnant goals found");
    });

    it("ignores completed goals even if updatedAt is > 14 days ago", async () => {
      if (!probe.isAvailable) return;
      const completedGoal = await createGoal(testUserId, {
        title: "Finish Marathon",
        status: "completed",
      });

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      await db
        .update(goals)
        .set({
          updatedAt: thirtyDaysAgo,
          completedAt: thirtyDaysAgo,
          status: "completed",
        })
        .where(eq(goals.id, completedGoal.id));

      const summary = await schedulerEngine.runSweepers(testUserId);
      const goalJob = summary.results.find((r) => r.jobName === "stagnant_goals");

      expect(goalJob!.executed).toBe(false);
    });
  });

  describe("5. Tenant Isolation Guarantees", () => {
    it("strictly isolates overdue tasks and notifications between tenants", async () => {
      if (!probe.isAvailable) return;
      // Create overdue task for testUserId
      const task = await createTask(testUserId, { title: "Primary Confidential Task" });
      await db
        .update(tasks)
        .set({ dueDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) })
        .where(eq(tasks.id, task.id));

      // Sweep for foreignUserId only
      const foreignSummary = await schedulerEngine.runSweepers(foreignUserId, {
        referenceDate: new Date("2026-09-24T14:00:00Z"),
      });
      const overdueJobForeign = foreignSummary.results.find((r) => r.jobName === "overdue_tasks");
      expect(overdueJobForeign!.executed).toBe(false);

      // Verify foreignUserId has zero notifications
      const notifsForeign = await getNotifications(foreignUserId);
      expect(notifsForeign.length).toBe(0);

      // Sweep for testUserId
      const primarySummary = await schedulerEngine.runSweepers(testUserId, {
        referenceDate: new Date("2026-09-24T14:00:00Z"),
      });
      const overdueJobPrimary = primarySummary.results.find((r) => r.jobName === "overdue_tasks");
      expect(overdueJobPrimary!.executed).toBe(true);

      const notifsPrimary = await getNotifications(testUserId);
      expect(notifsPrimary.length).toBe(1);
      expect(notifsPrimary[0].userId).toBe(testUserId);
    });
  });

  describe("6. Scheduled Automations & Canonical Rule Engine Integration", () => {
    it("executes due scheduled automation through Automation Engine, creates task, records run, and updates executionCount", async () => {
      if (!probe.isAvailable) return;
      // 1. Create a scheduled automation rule: daily at 08:00
      const auto = await createAutomation(testUserId, {
        name: "Morning Standup Task Spawner",
        triggerType: "schedule",
        triggerConfig: {
          type: "daily",
          time: "08:00",
        },
        actionType: "create_task",
        actionConfig: {
          title: "Prepare Daily Standup Notes",
          priority: "high",
        },
        isActive: true,
      });

      // 2. Simulate scheduler tick at 08:15 AM
      const simulatedTime = new Date("2026-09-24T08:15:00.000Z");

      const results = await schedulerEngine.runScheduledAutomations(testUserId, {
        referenceDate: simulatedTime,
        timezone: "UTC",
      });

      expect(results.length).toBe(1);
      expect(results[0].executed).toBe(true);

      // 3. Verify action was executed through canonical TaskService
      const userTasks = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.userId, testUserId), eq(tasks.title, "Prepare Daily Standup Notes")));
      expect(userTasks.length).toBe(1);
      expect(userTasks[0].priority).toBe("high");

      // 4. Verify automation_runs recorded canonical execution log
      const runs = await db
        .select()
        .from(automationRuns)
        .where(eq(automationRuns.automationId, auto.id));
      expect(runs.length).toBe(1);
      expect(runs[0].status).toBe("success");
      expect(runs[0].triggerEvent).toBe("schedule.tick");

      // 5. Verify executionCount incremented and lastRunAt updated on the rule
      const [updatedAuto] = await db
        .select()
        .from(automations)
        .where(eq(automations.id, auto.id));
      expect(updatedAuto.executionCount).toBe(1);
      expect(updatedAuto.lastRunAt).not.toBeNull();

      // 6. Verify audit log entry
      const auditEntries = await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.userId, testUserId),
            eq(auditLog.action, "automation.executed")
          )
        );
      expect(auditEntries.length).toBeGreaterThanOrEqual(1);

      // 7. Verify subsequent run in the same time window is skipped due to idempotency lock
      const secondRunResults = await schedulerEngine.runScheduledAutomations(testUserId, {
        referenceDate: simulatedTime,
        timezone: "UTC",
      });
      expect(secondRunResults.length).toBe(1);
      expect(secondRunResults[0].executed).toBe(false);
      expect(secondRunResults[0].skippedReason).toContain("Already executed");
    });

    it("executes one-time schedule and automatically deactivates the rule", async () => {
      if (!probe.isAvailable) return;
      const scheduledTime = new Date("2026-09-24T10:00:00.000Z");

      const auto = await createAutomation(testUserId, {
        name: "One-Off Server Maintenance Notification",
        triggerType: "schedule",
        triggerConfig: {
          type: "once",
          runAt: scheduledTime.toISOString(),
        },
        actionType: "create_notification",
        actionConfig: {
          title: "Maintenance Starting",
          message: "Scheduled maintenance window has begun.",
        },
        isActive: true,
      });

      // Run when due
      const results = await schedulerEngine.runScheduledAutomations(testUserId, {
        referenceDate: new Date("2026-09-24T10:05:00.000Z"),
      });

      expect(results.length).toBe(1);
      expect(results[0].executed).toBe(true);

      // Rule must now be inactive
      const [updatedRule] = await db
        .select()
        .from(automations)
        .where(eq(automations.id, auto.id));
      expect(updatedRule.isActive).toBe(false);

      // Future run should not execute because rule is now inactive
      const futureRun = await schedulerEngine.runScheduledAutomations(testUserId, {
        referenceDate: new Date("2026-09-24T10:30:00.000Z"),
      });
      expect(futureRun.length).toBe(0);
    });

    it("does not execute inactive or disabled scheduled automations", async () => {
      if (!probe.isAvailable) return;
      await createAutomation(testUserId, {
        name: "Disabled Rule",
        triggerType: "schedule",
        triggerConfig: {
          type: "daily",
          time: "08:00",
        },
        actionType: "create_notification",
        actionConfig: {
          title: "Disabled Notification",
          message: "Should never fire",
        },
        isActive: false, // Disabled
      });

      const results = await schedulerEngine.runScheduledAutomations(testUserId, {
        referenceDate: new Date("2026-09-24T08:30:00.000Z"),
      });

      expect(results.length).toBe(0);
      const notifs = await getNotifications(testUserId);
      expect(notifs.length).toBe(0);
    });
  });

  describe("7. Secure HTTP Cron Route (/api/cron/scheduler)", () => {
    it("returns 401 Unauthorized when Authorization header is missing", async () => {
      if (!probe.isAvailable) return;
      const req = new NextRequest("http://localhost:3000/api/cron/scheduler", {
        method: "POST",
      });
      const res = await cronPost(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain("Unauthorized");
    });

    it("returns 401 Unauthorized when Bearer token is invalid", async () => {
      if (!probe.isAvailable) return;
      const req = new NextRequest("http://localhost:3000/api/cron/scheduler", {
        method: "POST",
        headers: {
          authorization: "Bearer wrong_secret_token_12345",
        },
      });
      const res = await cronPost(req);

      expect(res.status).toBe(401);
    });

    it("returns 200 OK and executes sweepers across tenants with valid CRON_SECRET via POST", async () => {
      if (!probe.isAvailable) return;
      const req = new NextRequest("http://localhost:3000/api/cron/scheduler", {
        method: "POST",
        headers: {
          authorization: `Bearer ${TEST_CRON_SECRET}`,
        },
      });
      const res = await cronPost(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.mode).toBe("all_tenants");
      expect(json.summary.totalUsers).toBeGreaterThanOrEqual(1);
    });

    it("returns 200 OK via GET request for webhook-compatible cron providers", async () => {
      if (!probe.isAvailable) return;
      const req = new NextRequest("http://localhost:3000/api/cron/scheduler", {
        method: "GET",
        headers: {
          authorization: `Bearer ${TEST_CRON_SECRET}`,
        },
      });
      const res = await cronGet(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it("supports single-tenant execution via ?userId= query parameter", async () => {
      if (!probe.isAvailable) return;
      const req = new NextRequest(
        `http://localhost:3000/api/cron/scheduler?userId=${testUserId}`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${TEST_CRON_SECRET}`,
          },
        }
      );
      const res = await cronPost(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.mode).toBe("single_tenant");
      expect(json.summary.userId).toBe(testUserId);
    });
  });
});
