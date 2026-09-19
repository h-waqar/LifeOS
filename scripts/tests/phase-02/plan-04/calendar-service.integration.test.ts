// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { tasks, habits, goals, projects, habitEntries, timeBlocks } from "@/server/db/schema";
import { auth } from "@/server/auth";
import {
  createTimeBlock,
  getTimeBlock,
  listTimeBlocks,
  updateTimeBlock,
  completeTimeBlock,
  deleteTimeBlock,
  getCalendarFeed,
  ConflictError,
  NotFoundError,
  InvariantViolationError,
} from "@/server/calendar/service";
import { eq, and } from "drizzle-orm";

describe("Phase 2 Plan 02-04: Calendar Service Layer & Business Invariants (Integration)", () => {
  let probe: ProbeResult;

  const testUserData = {
    email: "p02_cal_service_user@example.com",
    password: "Plan02CalServicePassword123!",
    name: "Calendar Service User",
  };

  let testUserId: string;

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

  it("1. Successfully creates, retrieves, and lists time blocks", async () => {
    const start = "2026-10-01T09:00:00.000Z";
    const end = "2026-10-01T10:00:00.000Z";

    const created = await createTimeBlock(testUserId, {
      title: "Deep Work Block",
      description: "Writing calendar tests",
      startTime: start,
      endTime: end,
      commitmentLevel: "soft",
    });

    expect(created.id).toBeDefined();
    expect(created.title).toBe("Deep Work Block");
    expect(created.durationMinutes).toBe(60);
    expect(created.status).toBe("scheduled");

    const retrieved = await getTimeBlock(testUserId, created.id);
    expect(retrieved.id).toBe(created.id);
    expect(retrieved.hasConflict).toBe(false);

    const list = await listTimeBlocks(testUserId, {
      startDate: "2026-10-01",
      endDate: "2026-10-01",
    });
    expect(list.some((b) => b.id === created.id)).toBe(true);
  });

  it("2. Rejects overlapping hard commitments with ConflictError (409)", async () => {
    const start1 = "2026-10-02T10:00:00.000Z";
    const end1 = "2026-10-02T11:30:00.000Z";

    // 1st hard commitment
    const hardBlock1 = await createTimeBlock(testUserId, {
      title: "Important Client Meeting",
      startTime: start1,
      endTime: end1,
      commitmentLevel: "hard",
    });
    expect(hardBlock1.id).toBeDefined();

    // 2nd hard commitment overlapping 10:30 - 11:30 MUST fail
    const start2 = "2026-10-02T10:30:00.000Z";
    const end2 = "2026-10-02T12:00:00.000Z";

    await expect(
      createTimeBlock(testUserId, {
        title: "Conflicting Hard Meeting",
        startTime: start2,
        endTime: end2,
        commitmentLevel: "hard",
      })
    ).rejects.toThrow(ConflictError);

    // Adjacent non-overlapping hard commitment 11:30 - 12:30 MUST succeed
    const start3 = "2026-10-02T11:30:00.000Z";
    const end3 = "2026-10-02T12:30:00.000Z";

    const adjacentHard = await createTimeBlock(testUserId, {
      title: "Adjacent Hard Meeting",
      startTime: start3,
      endTime: end3,
      commitmentLevel: "hard",
    });
    expect(adjacentHard.id).toBeDefined();
  });

  it("3. Allows soft commitments to overlap and highlights scheduling conflicts", async () => {
    const start = "2026-10-03T14:00:00.000Z";
    const end = "2026-10-03T15:30:00.000Z";

    // Soft block 1
    const soft1 = await createTimeBlock(testUserId, {
      title: "Reading Documentation",
      startTime: start,
      endTime: end,
      commitmentLevel: "soft",
    });

    // Soft block 2 overlapping 14:30 - 16:00
    const soft2 = await createTimeBlock(testUserId, {
      title: "Optional Webinar",
      startTime: "2026-10-03T14:30:00.000Z",
      endTime: "2026-10-03T16:00:00.000Z",
      commitmentLevel: "soft",
    });

    expect(soft1.id).toBeDefined();
    expect(soft2.id).toBeDefined();

    const retrieved1 = await getTimeBlock(testUserId, soft1.id);
    expect(retrieved1.hasConflict).toBe(true);
    expect(retrieved1.hasHardConflict).toBe(false);
    expect(retrieved1.conflictingBlockIds).toContain(soft2.id);
  });

  it("4. Completed time block reflects actual time and updates linked task analytics (CAL-03)", async () => {
    // 1. Create a task
    const taskId = "task_analytics_" + crypto.randomUUID().slice(0, 8);
    await db.insert(tasks).values({
      id: taskId,
      userId: testUserId,
      title: "Write documentation",
      actualDuration: 0,
    });

    // 2. Schedule a 60 min time block for this task
    const block = await createTimeBlock(testUserId, {
      title: "Doc writing session 1",
      startTime: "2026-10-04T09:00:00.000Z",
      endTime: "2026-10-04T10:00:00.000Z",
      durationMinutes: 60,
      taskId,
    });

    // 3. Mark completed with actualMinutes = 75
    const completed = await completeTimeBlock(testUserId, block.id, {
      actualMinutes: 75,
      completeLinkedTask: false,
    });

    expect(completed.status).toBe("completed");
    expect(completed.actualMinutes).toBe(75);
    expect(completed.completedAt).not.toBeNull();

    // 4. Verify task actualDuration updated to 75
    const [taskAfter] = await db
      .select({ actualDuration: tasks.actualDuration, status: tasks.status })
      .from(tasks)
      .where(and(eq(tasks.userId, testUserId), eq(tasks.id, taskId)));

    expect(taskAfter.actualDuration).toBe(75);
    expect(taskAfter.status).not.toBe("completed");
  });

  it("5. Completes linked task when completeLinkedTask option is set", async () => {
    const taskId = "task_complete_opt_" + crypto.randomUUID().slice(0, 8);
    await db.insert(tasks).values({
      id: taskId,
      userId: testUserId,
      title: "Task to complete via block",
      status: "in_progress",
    });

    const block = await createTimeBlock(testUserId, {
      title: "Final task sprint",
      startTime: "2026-10-04T11:00:00.000Z",
      endTime: "2026-10-04T12:00:00.000Z",
      taskId,
    });

    await completeTimeBlock(testUserId, block.id, {
      actualMinutes: 60,
      completeLinkedTask: true,
    });

    const [t] = await db
      .select({ status: tasks.status, completedAt: tasks.completedAt })
      .from(tasks)
      .where(and(eq(tasks.userId, testUserId), eq(tasks.id, taskId)));

    expect(t.status).toBe("completed");
    expect(t.completedAt).not.toBeNull();
  });

  it("6. Habit check-in integration: completes habit entry when habit block is completed", async () => {
    const habitId = "habit_tb_checkin_" + crypto.randomUUID().slice(0, 8);
    await db.insert(habits).values({
      id: habitId,
      userId: testUserId,
      title: "Daily Reading",
      frequency: "daily",
    });

    const block = await createTimeBlock(testUserId, {
      title: "Evening Reading Block",
      startTime: "2026-10-04T20:00:00.000Z",
      endTime: "2026-10-04T20:45:00.000Z",
      habitId,
    });

    // Complete the block
    await completeTimeBlock(testUserId, block.id, {
      logHabitEntry: true,
    });

    // Verify habit entry was logged for that date
    const [entry] = await db
      .select()
      .from(habitEntries)
      .where(
        and(
          eq(habitEntries.userId, testUserId),
          eq(habitEntries.habitId, habitId),
          eq(habitEntries.date, "2026-10-04")
        )
      );

    expect(entry).toBeDefined();
    expect(entry.value).toBe(1);
  });

  it("7. Rollback of task actualDuration when completed block is deleted", async () => {
    const taskId = "task_del_rollback_" + crypto.randomUUID().slice(0, 8);
    await db.insert(tasks).values({
      id: taskId,
      userId: testUserId,
      title: "Task with block to delete",
      actualDuration: 50,
    });

    const block = await createTimeBlock(testUserId, {
      title: "Temporary session",
      startTime: "2026-10-05T08:00:00.000Z",
      endTime: "2026-10-05T09:00:00.000Z",
      taskId,
    });

    await completeTimeBlock(testUserId, block.id, { actualMinutes: 60 });

    // Verify task duration reached 110 (50 + 60)
    let [taskRow] = await db
      .select({ actualDuration: tasks.actualDuration })
      .from(tasks)
      .where(and(eq(tasks.userId, testUserId), eq(tasks.id, taskId)));
    expect(taskRow.actualDuration).toBe(110);

    // Delete the completed time block
    await deleteTimeBlock(testUserId, block.id);

    // Verify task duration rolled back to 50
    [taskRow] = await db
      .select({ actualDuration: tasks.actualDuration })
      .from(tasks)
      .where(and(eq(tasks.userId, testUserId), eq(tasks.id, taskId)));
    expect(taskRow.actualDuration).toBe(50);
  });

  it("8. getCalendarFeed aggregates time blocks, deadlines, scheduled tasks, and habit cues (CAL-01)", async () => {
    const windowDate = "2026-10-06";

    // 1. Time block on that day
    await createTimeBlock(testUserId, {
      title: "Feed Test Block",
      startTime: `${windowDate}T10:00:00.000Z`,
      endTime: `${windowDate}T11:00:00.000Z`,
    });

    // 2. Task with due date on that day
    const dueTaskId = "task_due_" + crypto.randomUUID().slice(0, 8);
    await db.insert(tasks).values({
      id: dueTaskId,
      userId: testUserId,
      title: "Tax Filing Deadline",
      dueDate: new Date(`${windowDate}T17:00:00.000Z`),
      status: "todo",
      priority: "critical",
    });

    // 3. Project with deadline on that day
    const projId = "proj_due_" + crypto.randomUUID().slice(0, 8);
    await db.insert(projects).values({
      id: projId,
      userId: testUserId,
      name: "Q4 Launch",
      deadline: new Date(`${windowDate}T18:00:00.000Z`),
      status: "active",
      priority: "high",
    });

    // 4. Query calendar feed
    const feed = await getCalendarFeed(testUserId, {
      startDate: windowDate,
      endDate: windowDate,
      view: "day",
    });

    expect(feed.timeBlocks.length).toBeGreaterThanOrEqual(1);
    expect(feed.deadlines.some((d) => d.entityId === dueTaskId && d.type === "task_due")).toBe(true);
    expect(feed.deadlines.some((d) => d.entityId === projId && d.type === "project_deadline")).toBe(true);
    expect(feed.totalScheduledMinutes).toBeGreaterThanOrEqual(60);
  });
});
