// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { timeBlocks, tasks, projects, goals, habits } from "@/server/db/schema";
import { auth } from "@/server/auth";
import { eq, and } from "drizzle-orm";

describe("Phase 2 Plan 02-04: Calendar Schema & Tenant Isolation (Integration)", () => {
  let probe: ProbeResult;

  const testUserData = {
    email: "p02_cal_iso_user@example.com",
    password: "Plan02CalPassword123!",
    name: "Calendar Isolation User",
  };

  let testUserId: string;
  const foreignUserId = "foreign_user_" + crypto.randomUUID().slice(0, 8);
  const foreignTaskId = "foreign_task_" + crypto.randomUUID().slice(0, 8);
  const foreignProjectId = "foreign_project_" + crypto.randomUUID().slice(0, 8);
  const foreignGoalId = "foreign_goal_" + crypto.randomUUID().slice(0, 8);
  const foreignHabitId = "foreign_habit_" + crypto.randomUUID().slice(0, 8);

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    // Clean user table
    await db.delete(user);

    // Create Test User
    const res = await auth.api.signUpEmail({
      body: testUserData,
      asResponse: true,
    });
    expect(res.status).toBe(200);

    const [createdUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testUserData.email));
    testUserId = createdUser.id;
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await db.delete(user);
      await closeDatabase();
    }
  });

  it("1. Successfully inserts a well-formed time block", async () => {
    const blockId = "tb_valid_" + crypto.randomUUID().slice(0, 8);
    const start = new Date("2026-10-01T09:00:00.000Z");
    const end = new Date("2026-10-01T10:30:00.000Z");

    await db.insert(timeBlocks).values({
      id: blockId,
      userId: testUserId,
      title: "Morning Focus Block",
      description: "Calendar engine design",
      startTime: start,
      endTime: end,
      durationMinutes: 90,
      commitmentLevel: "hard",
      status: "scheduled",
    });

    const [row] = await db
      .select()
      .from(timeBlocks)
      .where(and(eq(timeBlocks.userId, testUserId), eq(timeBlocks.id, blockId)));

    expect(row).toBeDefined();
    expect(row.title).toBe("Morning Focus Block");
    expect(row.durationMinutes).toBe(90);
    expect(row.commitmentLevel).toBe("hard");
  });

  it("2. Enforces time order constraint (endTime > startTime)", async () => {
    const blockId = "tb_invalid_time_" + crypto.randomUUID().slice(0, 8);
    const start = new Date("2026-10-01T10:00:00.000Z");
    const end = new Date("2026-10-01T09:00:00.000Z"); // end < start

    await expect(
      db.insert(timeBlocks).values({
        id: blockId,
        userId: testUserId,
        title: "Inverted Time Block",
        startTime: start,
        endTime: end,
        durationMinutes: 60,
      })
    ).rejects.toThrow();
  });

  it("3. Enforces completed invariant (status = completed requires completed_at)", async () => {
    const blockId = "tb_completed_inv_" + crypto.randomUUID().slice(0, 8);
    const start = new Date("2026-10-01T10:00:00.000Z");
    const end = new Date("2026-10-01T11:00:00.000Z");

    // completed without completedAt must be rejected by check constraint
    await expect(
      db.insert(timeBlocks).values({
        id: blockId,
        userId: testUserId,
        title: "Completed Without Timestamp",
        startTime: start,
        endTime: end,
        durationMinutes: 60,
        status: "completed",
        completedAt: null,
      })
    ).rejects.toThrow();
  });

  it("4. Blocks cross-tenant task linkage via composite FK (user_id, task_id)", async () => {
    const blockId = "tb_cross_task_" + crypto.randomUUID().slice(0, 8);
    const start = new Date("2026-10-01T11:00:00.000Z");
    const end = new Date("2026-10-01T12:00:00.000Z");

    await expect(
      db.insert(timeBlocks).values({
        id: blockId,
        userId: testUserId,
        title: "Block with Foreign Task",
        startTime: start,
        endTime: end,
        durationMinutes: 60,
        taskId: foreignTaskId,
      })
    ).rejects.toThrow();
  });

  it("5. Blocks cross-tenant project linkage via composite FK (user_id, project_id)", async () => {
    const blockId = "tb_cross_proj_" + crypto.randomUUID().slice(0, 8);
    const start = new Date("2026-10-01T11:00:00.000Z");
    const end = new Date("2026-10-01T12:00:00.000Z");

    await expect(
      db.insert(timeBlocks).values({
        id: blockId,
        userId: testUserId,
        title: "Block with Foreign Project",
        startTime: start,
        endTime: end,
        durationMinutes: 60,
        projectId: foreignProjectId,
      })
    ).rejects.toThrow();
  });

  it("6. Blocks cross-tenant goal linkage via composite FK (user_id, goal_id)", async () => {
    const blockId = "tb_cross_goal_" + crypto.randomUUID().slice(0, 8);
    const start = new Date("2026-10-01T11:00:00.000Z");
    const end = new Date("2026-10-01T12:00:00.000Z");

    await expect(
      db.insert(timeBlocks).values({
        id: blockId,
        userId: testUserId,
        title: "Block with Foreign Goal",
        startTime: start,
        endTime: end,
        durationMinutes: 60,
        goalId: foreignGoalId,
      })
    ).rejects.toThrow();
  });

  it("7. Blocks cross-tenant habit linkage via composite FK (user_id, habit_id)", async () => {
    const blockId = "tb_cross_habit_" + crypto.randomUUID().slice(0, 8);
    const start = new Date("2026-10-01T11:00:00.000Z");
    const end = new Date("2026-10-01T12:00:00.000Z");

    await expect(
      db.insert(timeBlocks).values({
        id: blockId,
        userId: testUserId,
        title: "Block with Foreign Habit",
        startTime: start,
        endTime: end,
        durationMinutes: 60,
        habitId: foreignHabitId,
      })
    ).rejects.toThrow();
  });

  it("8. Allows valid user-scoped task, project, goal, and habit linkages", async () => {
    const goalId = "goal_cal_val_" + crypto.randomUUID().slice(0, 8);
    const projectId = "proj_cal_val_" + crypto.randomUUID().slice(0, 8);
    const taskId = "task_cal_val_" + crypto.randomUUID().slice(0, 8);
    const habitId = "habit_cal_val_" + crypto.randomUUID().slice(0, 8);
    const blockId = "tb_all_val_" + crypto.randomUUID().slice(0, 8);

    await db.insert(goals).values({
      id: goalId,
      userId: testUserId,
      title: "Fitness Goal",
    });

    await db.insert(projects).values({
      id: projectId,
      userId: testUserId,
      name: "Productivity Overhaul",
      goalId,
    });

    await db.insert(habits).values({
      id: habitId,
      userId: testUserId,
      title: "Morning Routine",
      goalId,
    });

    await db.insert(tasks).values({
      id: taskId,
      userId: testUserId,
      title: "Calendar Planning Task",
      projectId,
      goalId,
      habitId,
    });

    const start = new Date("2026-10-01T13:00:00.000Z");
    const end = new Date("2026-10-01T14:00:00.000Z");

    await db.insert(timeBlocks).values({
      id: blockId,
      userId: testUserId,
      title: "Integrated Block",
      startTime: start,
      endTime: end,
      durationMinutes: 60,
      taskId,
      projectId,
      goalId,
      habitId,
    });

    const [b] = await db
      .select()
      .from(timeBlocks)
      .where(and(eq(timeBlocks.userId, testUserId), eq(timeBlocks.id, blockId)));

    expect(b).toBeDefined();
    expect(b.taskId).toBe(taskId);
    expect(b.projectId).toBe(projectId);
    expect(b.goalId).toBe(goalId);
    expect(b.habitId).toBe(habitId);
  });

  it("9. Nullifies linked entity IDs when entities are deleted (ON DELETE SET NULL)", async () => {
    const taskId = "task_del_setnull_" + crypto.randomUUID().slice(0, 8);
    const blockId = "tb_del_setnull_" + crypto.randomUUID().slice(0, 8);

    await db.insert(tasks).values({
      id: taskId,
      userId: testUserId,
      title: "Task to be deleted",
    });

    await db.insert(timeBlocks).values({
      id: blockId,
      userId: testUserId,
      title: "Time Block for Task",
      startTime: new Date("2026-10-01T15:00:00.000Z"),
      endTime: new Date("2026-10-01T16:00:00.000Z"),
      durationMinutes: 60,
      taskId,
    });

    // Delete task
    await db.delete(tasks).where(and(eq(tasks.userId, testUserId), eq(tasks.id, taskId)));

    // Verify time block still exists, with taskId = null
    const [b] = await db
      .select({ id: timeBlocks.id, taskId: timeBlocks.taskId })
      .from(timeBlocks)
      .where(and(eq(timeBlocks.userId, testUserId), eq(timeBlocks.id, blockId)));

    expect(b).toBeDefined();
    expect(b.taskId).toBeNull();
  });
});
