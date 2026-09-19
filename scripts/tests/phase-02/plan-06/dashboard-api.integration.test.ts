// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import {
  goals,
  projects,
  tasks,
  habits,
  habitEntries,
  timeBlocks,
  dailyPlans,
  eveningReviews,
} from "@/server/db/schema";
import { auth } from "@/server/auth";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { GET as dashboardGet } from "@/app/api/dashboard/route";
import { getDashboardOverview } from "@/server/dashboard/service";
import type { DashboardOverviewDTO } from "@/types";

describe("Phase 2 Plan 02-06: Unified Dashboard API & Multi-Tenant Isolation (Integration)", () => {
  let probe: ProbeResult;

  const testUserData = {
    email: "p02_dash_owner@example.com",
    password: "DashOwnerPassword123!",
    name: "Owner User",
  };

  let testUserId: string;
  let cookieHeader: string;
  const foreignUserId = "foreign_user_" + crypto.randomUUID().slice(0, 8);

  const testDate = "2026-09-16";

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    await db.delete(user);

    // Register primary user
    const res = await auth.api.signUpEmail({
      body: testUserData,
      asResponse: true,
    });
    expect(res.status).toBe(200);
    const match = res.headers
      .get("set-cookie")!
      .match(/better-auth\.session_token=([^;]+)/);
    expect(match).toBeTruthy();
    cookieHeader = `better-auth.session_token=${match![1]}`;

    const [u] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testUserData.email));
    testUserId = u.id;

    // 1. Seed Domain Data for testUserId
    // Goal
    const [goal] = await db
      .insert(goals)
      .values({
        userId: testUserId,
        title: "Owner Master Goal",
        horizon: "long_term",
        area: "career",
        status: "in_progress",
        priority: "critical",
        metricType: "none",
        currentValue: 0,
      })
      .returning();

    // Project
    const [proj] = await db
      .insert(projects)
      .values({
        userId: testUserId,
        name: "Owner Core Project",
        area: "career",
        status: "active",
        priority: "high",
        goalId: goal.id,
      })
      .returning();

    // Task (scheduled today)
    const [task] = await db
      .insert(tasks)
      .values({
        userId: testUserId,
        title: "Owner Priority Task",
        projectId: proj.id,
        status: "todo",
        priority: "critical",
        scheduledDate: new Date(`${testDate}T09:00:00Z`),
      })
      .returning();

    // Habit
    const [habit] = await db
      .insert(habits)
      .values({
        userId: testUserId,
        title: "Owner Daily Habit",
        frequency: "daily",
        frequencyTarget: 1,
        frequencyDays: [0, 1, 2, 3, 4, 5, 6],
        intervalDays: 1,
        targetValue: 1,
        status: "active",
      })
      .returning();

    // Habit Entry for today
    await db.insert(habitEntries).values({
      userId: testUserId,
      habitId: habit.id,
      date: testDate,
      value: 1,
      targetValue: 1,
      completedAt: new Date(),
    });

    // Time Block
    await db.insert(timeBlocks).values({
      userId: testUserId,
      title: "Owner Focus Session",
      startTime: new Date(`${testDate}T10:00:00Z`),
      endTime: new Date(`${testDate}T12:00:00Z`),
      durationMinutes: 120,
      status: "completed",
      commitmentLevel: "hard",
      actualMinutes: 120,
      completedAt: new Date(),
      taskId: task.id,
    });

    // Daily Plan
    const [plan] = await db
      .insert(dailyPlans)
      .values({
        userId: testUserId,
        date: testDate,
        status: "completed",
        priorityTaskIds: [task.id],
        completedAt: new Date(),
        morningNotes: "Owner morning focus notes",
      })
      .returning();

    // Evening Review
    await db.insert(eveningReviews).values({
      userId: testUserId,
      dailyPlanId: plan.id,
      date: testDate,
      productivityScore: 95,
      positiveReflections: "Exceptional progress today",
      completedTaskIds: [],
      incompleteTaskIds: [task.id],
      rolledOverTaskIds: [],
      completedHabitIds: [habit.id],
    });
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await db.delete(user);
      await closeDatabase();
    }
  });

  it("1. Rejects unauthenticated requests with HTTP 401", async () => {
    const req = new NextRequest(`http://localhost:3000/api/dashboard?date=${testDate}`);
    const res = await dashboardGet(req);
    expect(res.status).toBe(401);
  });

  it("2. GET /api/dashboard returns complete executive overview for authenticated user", async () => {
    const req = new NextRequest(`http://localhost:3000/api/dashboard?date=${testDate}`, {
      headers: { cookie: cookieHeader },
    });
    const res = await dashboardGet(req);
    expect(res.status).toBe(200);

    // Verify security cache headers
    expect(res.headers.get("Cache-Control")).toContain("no-store");

    const data = await res.json();
    expect(data.overview).toBeDefined();

    const ov: DashboardOverviewDTO = data.overview;
    expect(ov.date).toBe(testDate);
    expect(ov.greeting.userName).toBe("Owner User");

    // Metrics
    expect(ov.metrics.activeGoalsCount).toBe(1);
    expect(ov.metrics.activeProjectsCount).toBe(1);
    expect(ov.metrics.pendingTasksCount).toBe(1);
    expect(ov.metrics.todayHabitsTotal).toBe(1);
    expect(ov.metrics.todayHabitsCompleted).toBe(1);
    expect(ov.metrics.todayTimeBlocksCount).toBe(1);
    expect(ov.metrics.todayProductivityScore).toBe(95);

    // Daily plan
    expect(ov.dailyPlan.hasPlan).toBe(true);
    expect(ov.dailyPlan.planStatus).toBe("completed");
    expect(ov.dailyPlan.hasReview).toBe(true);
    expect(ov.dailyPlan.productivityScore).toBe(95);

    // Priorities
    expect(ov.priorities.todayTasks.length).toBeGreaterThanOrEqual(1);
    expect(ov.priorities.todayTasks[0].title).toBe("Owner Priority Task");

    // Schedule
    expect(ov.schedule.todayBlocks).toHaveLength(1);
    expect(ov.schedule.todayBlocks[0].title).toBe("Owner Focus Session");
    expect(ov.schedule.completedMinutes).toBe(120);

    // Habits
    expect(ov.habits.items).toHaveLength(1);
    expect(ov.habits.items[0].title).toBe("Owner Daily Habit");
    expect(ov.habits.completionRateToday).toBe(100);
  });

  it("3. Enforces strict multi-tenant isolation at service layer", async () => {
    // Calling getDashboardOverview with a foreign user ID returns ZERO domain entities
    const foreignOverview = await getDashboardOverview(foreignUserId, testDate);

    expect(foreignOverview.metrics.activeGoalsCount).toBe(0);
    expect(foreignOverview.metrics.activeProjectsCount).toBe(0);
    expect(foreignOverview.metrics.pendingTasksCount).toBe(0);
    expect(foreignOverview.metrics.todayHabitsTotal).toBe(0);
    expect(foreignOverview.metrics.todayTimeBlocksCount).toBe(0);
    expect(foreignOverview.metrics.todayProductivityScore).toBeNull();
    expect(foreignOverview.dailyPlan.hasPlan).toBe(false);
    expect(foreignOverview.priorities.todayTasks).toEqual([]);
    expect(foreignOverview.schedule.todayBlocks).toEqual([]);
    expect(foreignOverview.habits.items).toEqual([]);
    expect(foreignOverview.goalsAndProjects.activeGoals).toEqual([]);
    expect(foreignOverview.goalsAndProjects.activeProjects).toEqual([]);
  });

  it("4. Guarantees task count invariance (zero-duplication rollover invariant)", async () => {
    const initialTasks = await db.select({ id: tasks.id }).from(tasks);
    const initialCount = initialTasks.length;

    // Request dashboard overview
    const req = new NextRequest(`http://localhost:3000/api/dashboard?date=${testDate}`, {
      headers: { cookie: cookieHeader },
    });
    const res = await dashboardGet(req);
    expect(res.status).toBe(200);

    // Verify task count is 100% unchanged
    const finalTasks = await db.select({ id: tasks.id }).from(tasks);
    expect(finalTasks.length).toBe(initialCount);
  });
});
