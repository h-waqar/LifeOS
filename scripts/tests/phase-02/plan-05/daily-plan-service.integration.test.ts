// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { tasks, habits } from "@/server/db/schema";
import { auth } from "@/server/auth";
import {
  saveMorningPlan,
  getDailyPlan,
  completeEveningReview,
  executeRollover,
  getDailyPlanHistory,
  InvariantViolationError,
} from "@/server/daily-plan/service";
import { eq, and, sql } from "drizzle-orm";
import { formatUtc } from "@/server/habits/streaks";

describe("Phase 2 Plan 02-05: Daily Plan Service & Zero-Duplication Rollover (Integration)", () => {
  let probe: ProbeResult;

  const testUserData = {
    email: "p02_dp_serv_user@example.com",
    password: "Plan02DpServPassword123!",
    name: "DP Serv User",
  };

  let testUserId: string;
  const foreignUserId = "foreign_user_" + crypto.randomUUID().slice(0, 8);
  const foreignTaskId = "foreign_task_" + crypto.randomUUID().slice(0, 8);

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    await db.delete(user);

    // Create Test User
    const res = await auth.api.signUpEmail({
      body: testUserData,
      asResponse: true,
    });
    expect(res.status).toBe(200);
    const [u] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testUserData.email));
    testUserId = u.id;
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await db.delete(user);
      await closeDatabase();
    }
  });

  it("1. Saves morning plan, sets priority tasks and schedules unscheduled tasks (PLAN-01)", async () => {
    const date = "2026-10-20";

    // Create 3 unscheduled tasks
    const [task1] = await db
      .insert(tasks)
      .values({
        userId: testUserId,
        title: "Write design doc",
        status: "todo",
      })
      .returning();

    const [task2] = await db
      .insert(tasks)
      .values({
        userId: testUserId,
        title: "Review pull requests",
        status: "todo",
      })
      .returning();

    const [task3] = await db
      .insert(tasks)
      .values({
        userId: testUserId,
        title: "Deploy staging environment",
        status: "todo",
      })
      .returning();

    expect(task1.scheduledDate).toBeNull();

    // Save morning plan picking these 3 tasks
    const plan = await saveMorningPlan(testUserId, {
      date,
      priorityTaskIds: [task1.id, task2.id, task3.id],
      morningNotes: "Focus on release goals today",
      complete: true,
    });

    expect(plan.id).toBeDefined();
    expect(plan.status).toBe("completed");
    expect(plan.priorityTaskIds).toHaveLength(3);
    expect(plan.morningNotes).toBe("Focus on release goals today");

    // Verify task1 scheduledDate was automatically set to today's date
    const [updatedTask1] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, testUserId), eq(tasks.id, task1.id)));

    expect(updatedTask1.scheduledDate).not.toBeNull();
    expect(formatUtc(updatedTask1.scheduledDate!)).toBe(date);
  });

  it("2. getDailyPlan retrieves full context including priority tasks and habits", async () => {
    const date = "2026-10-20";

    // Create an active habit
    await db.insert(habits).values({
      userId: testUserId,
      title: "Morning Meditation",
      frequency: "daily",
    });

    const context = await getDailyPlan(testUserId, date);

    expect(context.date).toBe(date);
    expect(context.plan).not.toBeNull();
    expect(context.plan?.status).toBe("completed");
    expect(context.priorityTasks.length).toBeGreaterThanOrEqual(3);
    expect(context.todayHabits.some((h) => h.title === "Morning Meditation")).toBe(true);
  });

  it("3. Completes evening review and calculates productivity score (PLAN-02)", async () => {
    const date = "2026-10-20";

    const review = await completeEveningReview(testUserId, {
      date,
      positiveReflections: "Shipped all planned items smoothly",
      challengesReflections: "Afternoon slump after lunch",
      notes: "Get more sleep tonight",
      selfRating: 8,
    });

    expect(review.id).toBeDefined();
    expect(review.date).toBe(date);
    expect(review.productivityScore).toBeGreaterThanOrEqual(0);
    expect(review.productivityScore).toBeLessThanOrEqual(100);
    expect(review.positiveReflections).toBe("Shipped all planned items smoothly");
  });

  it("4. Zero-Duplication Rollover: Mutates canonical tasks directly with ZERO new rows (PLAN-03)", async () => {
    const date = "2026-10-21";

    // Setup 3 incomplete tasks
    const [t1] = await db
      .insert(tasks)
      .values({
        userId: testUserId,
        title: "Task 1 to Carry Over",
        scheduledDate: new Date(`${date}T00:00:00.000Z`),
        status: "todo",
      })
      .returning();

    const [t2] = await db
      .insert(tasks)
      .values({
        userId: testUserId,
        title: "Task 2 to Reschedule",
        scheduledDate: new Date(`${date}T00:00:00.000Z`),
        status: "todo",
      })
      .returning();

    const [t3] = await db
      .insert(tasks)
      .values({
        userId: testUserId,
        title: "Task 3 to Backlog",
        scheduledDate: new Date(`${date}T00:00:00.000Z`),
        status: "todo",
      })
      .returning();

    // 1. Measure total task count before rollover
    const countBeforeRes = await db.execute(sql`SELECT count(*) FROM tasks WHERE user_id = ${testUserId}`);
    const countBefore = Number(countBeforeRes.rows[0].count);

    // 2. Execute Rollover:
    // t1 -> carry_over (tomorrow is 2026-10-22)
    // t2 -> reschedule to 2026-10-25
    // t3 -> backlog (scheduledDate becomes null)
    const rolloverResult = await executeRollover(testUserId, {
      date,
      actions: [
        { taskId: t1.id, action: "carry_over" },
        { taskId: t2.id, action: "reschedule", targetDate: "2026-10-25" },
        { taskId: t3.id, action: "backlog" },
      ],
    });

    expect(rolloverResult.success).toBe(true);
    expect(rolloverResult.rolledOverCount).toBe(3);
    expect(rolloverResult.summary.carriedOver).toBe(1);
    expect(rolloverResult.summary.rescheduled).toBe(1);
    expect(rolloverResult.summary.backlogged).toBe(1);

    // 3. Measure total task count after rollover: MUST BE IDENTICAL
    const countAfterRes = await db.execute(sql`SELECT count(*) FROM tasks WHERE user_id = ${testUserId}`);
    const countAfter = Number(countAfterRes.rows[0].count);

    expect(countAfter).toBe(countBefore); // ZERO DUPLICATE TASKS!

    // 4. Verify canonical task identity and scheduled dates
    const [t1After] = await db.select().from(tasks).where(eq(tasks.id, t1.id));
    expect(t1After.id).toBe(t1.id);
    expect(formatUtc(t1After.scheduledDate!)).toBe("2026-10-22");

    const [t2After] = await db.select().from(tasks).where(eq(tasks.id, t2.id));
    expect(t2After.id).toBe(t2.id);
    expect(formatUtc(t2After.scheduledDate!)).toBe("2026-10-25");

    const [t3After] = await db.select().from(tasks).where(eq(tasks.id, t3.id));
    expect(t3After.id).toBe(t3.id);
    expect(t3After.scheduledDate).toBeNull();
  });

  it("5. Rollover is idempotent and safe to retry without errors or duplicates", async () => {
    const date = "2026-10-21";

    const [t] = await db
      .insert(tasks)
      .values({
        userId: testUserId,
        title: "Task for retry rollover",
        scheduledDate: new Date(`${date}T00:00:00.000Z`),
        status: "todo",
      })
      .returning();

    const countBeforeRes = await db.execute(sql`SELECT count(*) FROM tasks WHERE user_id = ${testUserId}`);
    const countBefore = Number(countBeforeRes.rows[0].count);

    // First rollover
    await executeRollover(testUserId, {
      date,
      actions: [{ taskId: t.id, action: "carry_over" }],
    });

    // Second rollover (immediate retry / double click)
    const retryResult = await executeRollover(testUserId, {
      date,
      actions: [{ taskId: t.id, action: "carry_over" }],
    });

    expect(retryResult.success).toBe(true);

    const countAfterRes = await db.execute(sql`SELECT count(*) FROM tasks WHERE user_id = ${testUserId}`);
    const countAfter = Number(countAfterRes.rows[0].count);

    expect(countAfter).toBe(countBefore);
  });

  it("6. Tenant isolation: Cannot rollover or mutate a foreign task", async () => {
    const date = "2026-10-21";

    // Attempting to rollover a non-existent or foreign task MUST FAIL
    await expect(
      executeRollover(testUserId, {
        date,
        actions: [{ taskId: foreignTaskId, action: "carry_over" }],
      })
    ).rejects.toThrow(InvariantViolationError);
  });

  it("7. getDailyPlanHistory calculates trends across date range (PLAN-04)", async () => {
    const history = await getDailyPlanHistory(testUserId, { days: 7 });

    expect(history.totalDays).toBe(7);
    expect(history.days).toHaveLength(7);
    expect(history.morningPlanCompletionRate).toBeGreaterThanOrEqual(0);
    expect(history.eveningReviewCompletionRate).toBeGreaterThanOrEqual(0);
    expect(history.averageProductivityScore).toBeGreaterThanOrEqual(0);
  });
});
