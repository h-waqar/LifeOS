// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { habits, habitEntries, goals, tasks } from "@/server/db/schema";
import { auth } from "@/server/auth";
import { eq, and } from "drizzle-orm";

describe("Phase 2 Plan 02-03: Habits Schema & Tenant Isolation (Integration)", () => {
  let probe: ProbeResult;

  const testUserData = {
    email: "p02_habit_iso_user@example.com",
    password: "Plan02HabitPassword123!",
    name: "Habit Isolation User",
  };

  let testUserId: string;
  const foreignUserId = "foreign_user_" + crypto.randomUUID().slice(0, 8);
  const foreignGoalId = "foreign_goal_" + crypto.randomUUID().slice(0, 8);
  const foreignHabitId = "foreign_habit_" + crypto.randomUUID().slice(0, 8);

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    // Clean user table
    await db.delete(user);

    // Create Test User (single user mode)
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

  it("1. Rejects duplicate entries for the same (user_id, habit_id, date)", async () => {
    const habitId = "habit_dup_" + crypto.randomUUID().slice(0, 8);
    await db.insert(habits).values({
      id: habitId,
      userId: testUserId,
      title: "Daily Floss",
      frequency: "daily",
    });

    // First entry succeeds
    await db.insert(habitEntries).values({
      userId: testUserId,
      habitId,
      date: "2026-09-15",
      value: 1,
    });

    // Duplicate entry for same user, habit, and date MUST fail
    await expect(
      db.insert(habitEntries).values({
        userId: testUserId,
        habitId,
        date: "2026-09-15",
        value: 1,
      })
    ).rejects.toThrow();
  });

  it("2. Blocks cross-tenant habit entry creation via composite FK (user_id, habit_id)", async () => {
    const habitId = "habit_cross_" + crypto.randomUUID().slice(0, 8);
    await db.insert(habits).values({
      id: habitId,
      userId: testUserId,
      title: "Running Habit",
    });

    // Attempt to log entry with foreign habitId against testUserId
    await expect(
      db.insert(habitEntries).values({
        userId: testUserId,
        habitId: foreignHabitId,
        date: "2026-09-15",
        value: 1,
      })
    ).rejects.toThrow();

    // Attempt to log entry with foreign userId against existing habit
    await expect(
      db.insert(habitEntries).values({
        userId: foreignUserId,
        habitId,
        date: "2026-09-15",
        value: 1,
      })
    ).rejects.toThrow();
  });

  it("3. Blocks cross-tenant goal linkage on habit via composite FK (user_id, goal_id)", async () => {
    // Attempt to link a habit to a non-existent/foreign goal
    await expect(
      db.insert(habits).values({
        userId: testUserId,
        title: "Habit With Invalid Goal",
        goalId: foreignGoalId,
      })
    ).rejects.toThrow();
  });

  it("4. Blocks cross-tenant task-to-habit association via composite FK (user_id, habit_id)", async () => {
    // Attempt to link a task to a non-existent/foreign habit
    await expect(
      db.insert(tasks).values({
        userId: testUserId,
        title: "Task with Foreign Habit",
        habitId: foreignHabitId,
      })
    ).rejects.toThrow();
  });

  it("5. Allows valid user-scoped task-to-habit association", async () => {
    const habitId = "habit_task_valid_" + crypto.randomUUID().slice(0, 8);
    const taskId = "task_habit_valid_" + crypto.randomUUID().slice(0, 8);

    await db.insert(habits).values({
      id: habitId,
      userId: testUserId,
      title: "Meditation Habit",
    });

    await db.insert(tasks).values({
      id: taskId,
      userId: testUserId,
      title: "Meditate 10 mins",
      habitId,
    });

    const [t] = await db
      .select({ id: tasks.id, habitId: tasks.habitId })
      .from(tasks)
      .where(and(eq(tasks.userId, testUserId), eq(tasks.id, taskId)));

    expect(t).toBeDefined();
    expect(t.habitId).toBe(habitId);
  });

  it("6. Nullifies task.habit_id when linked habit is deleted (ON DELETE SET NULL)", async () => {
    const habitId = "habit_del_task_" + crypto.randomUUID().slice(0, 8);
    const taskId = "task_del_habit_" + crypto.randomUUID().slice(0, 8);

    await db.insert(habits).values({
      id: habitId,
      userId: testUserId,
      title: "Habit To Be Deleted",
    });

    await db.insert(tasks).values({
      id: taskId,
      userId: testUserId,
      title: "Linked Task",
      habitId,
    });

    // Delete habit
    await db
      .delete(habits)
      .where(and(eq(habits.userId, testUserId), eq(habits.id, habitId)));

    // Verify task.habitId was set to null
    const [taskRow] = await db
      .select({ habitId: tasks.habitId })
      .from(tasks)
      .where(and(eq(tasks.userId, testUserId), eq(tasks.id, taskId)));

    expect(taskRow).toBeDefined();
    expect(taskRow.habitId).toBeNull();
  });

  it("7. Nullifies habit.goal_id when linked goal is deleted (ON DELETE SET NULL)", async () => {
    const goalId = "goal_del_habit_" + crypto.randomUUID().slice(0, 8);
    const habitId = "habit_with_goal_" + crypto.randomUUID().slice(0, 8);

    await db.insert(goals).values({
      id: goalId,
      userId: testUserId,
      title: "Goal To Be Deleted",
    });

    await db.insert(habits).values({
      id: habitId,
      userId: testUserId,
      title: "Habit Linked to Goal",
      goalId,
    });

    // Delete goal
    await db
      .delete(goals)
      .where(and(eq(goals.userId, testUserId), eq(goals.id, goalId)));

    // Verify habit.goalId was set to null
    const [habitRow] = await db
      .select({ goalId: habits.goalId })
      .from(habits)
      .where(and(eq(habits.userId, testUserId), eq(habits.id, habitId)));

    expect(habitRow).toBeDefined();
    expect(habitRow.goalId).toBeNull();
  });

  it("8. Cascades deletion of habit_entries when parent habit is deleted (ON DELETE CASCADE)", async () => {
    const habitId = "habit_casc_ent_" + crypto.randomUUID().slice(0, 8);

    await db.insert(habits).values({
      id: habitId,
      userId: testUserId,
      title: "Habit With Multiple Entries",
    });

    await db.insert(habitEntries).values([
      { userId: testUserId, habitId, date: "2026-09-13", value: 1 },
      { userId: testUserId, habitId, date: "2026-09-14", value: 1 },
      { userId: testUserId, habitId, date: "2026-09-15", value: 1 },
    ]);

    // Verify 3 entries exist
    const entriesBefore = await db
      .select()
      .from(habitEntries)
      .where(and(eq(habitEntries.userId, testUserId), eq(habitEntries.habitId, habitId)));
    expect(entriesBefore).toHaveLength(3);

    // Delete parent habit
    await db
      .delete(habits)
      .where(and(eq(habits.userId, testUserId), eq(habits.id, habitId)));

    // Verify entries were cascade deleted
    const entriesAfter = await db
      .select()
      .from(habitEntries)
      .where(and(eq(habitEntries.userId, testUserId), eq(habitEntries.habitId, habitId)));
    expect(entriesAfter).toHaveLength(0);
  });

  it("9. Enforces CHECK constraints at the database level", async () => {
    // Empty title rejected
    await expect(
      db.insert(habits).values({
        userId: testUserId,
        title: "   ",
      })
    ).rejects.toThrow();

    // Target value <= 0 rejected
    await expect(
      db.insert(habits).values({
        userId: testUserId,
        title: "Zero Target Habit",
        targetValue: 0,
      })
    ).rejects.toThrow();

    const validHabitId = "habit_chk_" + crypto.randomUUID().slice(0, 8);
    await db.insert(habits).values({
      id: validHabitId,
      userId: testUserId,
      title: "Valid Habit for Entry Checks",
    });

    // Invalid date format rejected
    await expect(
      db.insert(habitEntries).values({
        userId: testUserId,
        habitId: validHabitId,
        date: "invalid-date-format",
        value: 1,
      })
    ).rejects.toThrow();

    // Negative entry value rejected
    await expect(
      db.insert(habitEntries).values({
        userId: testUserId,
        habitId: validHabitId,
        date: "2026-09-15",
        value: -5,
      })
    ).rejects.toThrow();
  });
});
