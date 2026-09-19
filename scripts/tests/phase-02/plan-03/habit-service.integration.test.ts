// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { auditLog } from "@/server/db/schema/audit";
import { habits, habitEntries, tasks, goals } from "@/server/db/schema";
import { auth } from "@/server/auth";
import {
  createHabit,
  getHabit,
  listHabits,
  updateHabit,
  deleteHabit,
  logHabitEntry,
  toggleHabitEntry,
  deleteHabitEntry,
  getHabitHistory,
  NotFoundError,
  InvariantViolationError,
} from "@/server/habits/service";
import { AuthorizationError } from "@/server/auth/guard";
import { eq, and } from "drizzle-orm";

describe("Plan 02-03 Wave 2: Habits Service Layer (Integration)", () => {
  let probe: ProbeResult;

  const testUserData = {
    email: "p02_habit_service_user@example.com",
    password: "Plan02HabitServicePassword123!",
    name: "Habit Service Tester",
  };

  let testUserId: string;
  let testGoalId: string;
  const foreignUserId = "foreign_user_" + crypto.randomUUID().slice(0, 8);

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    await db.delete(user);

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

    // Create a goal for linking tests
    const [createdGoal] = await db
      .insert(goals)
      .values({
        userId: testUserId,
        title: "Health & Vitality Goal",
        horizon: "long_term",
        area: "health",
      })
      .returning();
    testGoalId = createdGoal.id;
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await db.delete(user);
      await closeDatabase();
    }
  });

  describe("1. Habit Creation & Goal Linkage", () => {
    it("creates a habit with cues, schedule, goal link, and audit log", async () => {
      if (!probe.isAvailable) return;

      const created = await createHabit(
        testUserId,
        {
          title: "Morning Meditation",
          description: "20 minutes mindfulness meditation",
          frequency: "daily",
          timeOfDay: "morning",
          reminderTime: "07:30",
          goalId: testGoalId,
          identityStatement: "I am a calm and centered individual",
          targetValue: 20,
          unit: "minutes",
        },
        { ipAddress: "127.0.0.1", userAgent: "HabitServiceTest/1.0" }
      );

      expect(created.id).toBeDefined();
      expect(created.userId).toBe(testUserId);
      expect(created.title).toBe("Morning Meditation");
      expect(created.frequency).toBe("daily");
      expect(created.timeOfDay).toBe("morning");
      expect(created.reminderTime).toBe("07:30");
      expect(created.goalId).toBe(testGoalId);
      expect(created.identityStatement).toBe("I am a calm and centered individual");
      expect(created.targetValue).toBe(20);
      expect(created.unit).toBe("minutes");
      expect(created.currentStreak).toBe(0);
      expect(created.longestStreak).toBe(0);

      // Verify audit log
      const logs = await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.userId, testUserId),
            eq(auditLog.action, "habit.create")
          )
        );
      expect(logs.length).toBeGreaterThan(0);
      const latest = logs[logs.length - 1];
      expect((latest.details as any).habitId).toBe(created.id);
      expect((latest.details as any).title).toBe("Morning Meditation");
    });

    it("rejects creation with empty or unauthorized userId", async () => {
      if (!probe.isAvailable) return;

      await expect(
        createHabit("", { title: "Unauthenticated Habit" })
      ).rejects.toThrow(AuthorizationError);
    });

    it("rejects creation with non-existent or foreign goalId", async () => {
      if (!probe.isAvailable) return;

      await expect(
        createHabit(testUserId, {
          title: "Invalid Goal Link Habit",
          goalId: "non_existent_goal_id",
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("2. Habit Retrieval & Listing Filters", () => {
    it("retrieves a habit with streak stats and entries", async () => {
      if (!probe.isAvailable) return;

      const created = await createHabit(testUserId, {
        title: "Evening Reading",
        timeOfDay: "evening",
        frequency: "daily",
      });

      const fetched = await getHabit(testUserId, created.id, "2026-09-15");
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(created.id);
      expect(fetched?.currentStreak).toBe(0);
      expect(fetched?.isCompletedToday).toBe(false);
      expect(Array.isArray(fetched?.entries)).toBe(true);
    });

    it("enforces tenant isolation: foreign user cannot read habit", async () => {
      if (!probe.isAvailable) return;

      const created = await createHabit(testUserId, {
        title: "Secret Habit",
      });

      const result = await getHabit(foreignUserId, created.id);
      expect(result).toBeNull();
    });

    it("filters habits by status, timeOfDay, and goalId", async () => {
      if (!probe.isAvailable) return;

      const hMorning = await createHabit(testUserId, {
        title: "Morning Habit A",
        timeOfDay: "morning",
        status: "active",
        goalId: testGoalId,
      });

      const hEvening = await createHabit(testUserId, {
        title: "Evening Habit B",
        timeOfDay: "evening",
        status: "paused",
      });

      // Filter by timeOfDay
      const morningList = await listHabits(testUserId, {
        timeOfDay: "morning",
      });
      expect(morningList.some((h) => h.id === hMorning.id)).toBe(true);
      expect(morningList.some((h) => h.id === hEvening.id)).toBe(false);

      // Filter by status
      const pausedList = await listHabits(testUserId, { status: "paused" });
      expect(pausedList.some((h) => h.id === hEvening.id)).toBe(true);
      expect(pausedList.some((h) => h.id === hMorning.id)).toBe(false);

      // Filter by goalId
      const goalList = await listHabits(testUserId, { goalId: testGoalId });
      expect(goalList.some((h) => h.id === hMorning.id)).toBe(true);
      expect(goalList.some((h) => h.id === hEvening.id)).toBe(false);
    });
  });

  describe("3. Habit Update & Schedule Recalculation", () => {
    it("updates habit properties and writes audit log", async () => {
      if (!probe.isAvailable) return;

      const habit = await createHabit(testUserId, {
        title: "Initial Title",
        timeOfDay: "anytime",
      });

      const updated = await updateHabit(
        testUserId,
        habit.id,
        {
          title: "Updated Title",
          timeOfDay: "afternoon",
          status: "paused",
        },
        { ipAddress: "127.0.0.1" }
      );

      expect(updated.title).toBe("Updated Title");
      expect(updated.timeOfDay).toBe("afternoon");
      expect(updated.status).toBe("paused");

      // Verify audit log
      const logs = await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.userId, testUserId),
            eq(auditLog.action, "habit.update")
          )
        );
      expect(logs.length).toBeGreaterThan(0);
    });

    it("recalculates streaks when frequency schedule changes", async () => {
      if (!probe.isAvailable) return;

      const habit = await createHabit(testUserId, {
        title: "Schedule Change Habit",
        frequency: "daily",
      });

      // Log entries on Monday and Wednesday
      await logHabitEntry(testUserId, habit.id, { date: "2026-09-14", value: 1 });
      await logHabitEntry(testUserId, habit.id, { date: "2026-09-16", value: 1 });

      // In daily schedule, missing 2026-09-15 would break streak relative to 2026-09-16
      const beforeUpdate = await getHabit(testUserId, habit.id, "2026-09-16");
      expect(beforeUpdate?.currentStreak).toBe(1);

      // Update frequency to specific_days: Monday (1) and Wednesday (3)
      const afterUpdate = await updateHabit(
        testUserId,
        habit.id,
        {
          frequency: "specific_days",
          frequencyDays: [1, 3],
        },
        undefined,
        "2026-09-16"
      );

      // Now Tuesday was a rest day, so streak connects Monday and Wednesday!
      expect(afterUpdate.currentStreak).toBe(2);
      expect(afterUpdate.longestStreak).toBe(2);
    });

    it("rejects update on another user's habit", async () => {
      if (!probe.isAvailable) return;

      const habit = await createHabit(testUserId, { title: "Isolated Habit" });

      await expect(
        updateHabit(foreignUserId, habit.id, { title: "Hacked Title" })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("4. Habit Deletion & Cascade Referential Integrity", () => {
    it("deletes habit, cascades entries, unlinks tasks, and logs audit", async () => {
      if (!probe.isAvailable) return;

      const habit = await createHabit(testUserId, {
        title: "Habit to Delete",
      });

      // Log entry
      await logHabitEntry(testUserId, habit.id, { date: "2026-09-15" });

      // Create a task referencing this habit
      const [linkedTask] = await db
        .insert(tasks)
        .values({
          userId: testUserId,
          title: "Complete habit today",
          habitId: habit.id,
        })
        .returning();

      // Delete the habit
      const delRes = await deleteHabit(testUserId, habit.id);
      expect(delRes.success).toBe(true);

      // Habit must not exist
      const fetched = await getHabit(testUserId, habit.id);
      expect(fetched).toBeNull();

      // Entries must be cascaded
      const remainingEntries = await db
        .select()
        .from(habitEntries)
        .where(
          and(
            eq(habitEntries.userId, testUserId),
            eq(habitEntries.habitId, habit.id)
          )
        );
      expect(remainingEntries.length).toBe(0);

      // Linked task must have habit_id set to null (composite FK ON DELETE SET NULL)
      const [updatedTask] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, linkedTask.id));
      expect(updatedTask.habitId).toBeNull();

      // Verify audit log
      const logs = await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.userId, testUserId),
            eq(auditLog.action, "habit.delete")
          )
        );
      expect(logs.length).toBeGreaterThan(0);
    });

    it("throws NotFoundError when deleting non-existent habit", async () => {
      if (!probe.isAvailable) return;

      await expect(
        deleteHabit(testUserId, "non_existent_habit_id")
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("5. Idempotent Check-In & Quantitative Targets", () => {
    it("idempotently upserts check-in and maintains cached streaks", async () => {
      if (!probe.isAvailable) return;

      const habit = await createHabit(testUserId, {
        title: "Daily Floss",
        frequency: "daily",
      });

      // First check-in
      const res1 = await logHabitEntry(
        testUserId,
        habit.id,
        {
          date: "2026-09-15",
          value: 1,
          notes: "First check-in",
        },
        undefined,
        "2026-09-15"
      );

      expect(res1.entry.date).toBe("2026-09-15");
      expect(res1.entry.value).toBe(1);
      expect(res1.entry.notes).toBe("First check-in");
      expect(res1.stats.currentStreak).toBe(1);
      expect(res1.stats.isCompletedToday).toBe(true);

      // Database counter must be updated in sync
      const [dbHabit1] = await db
        .select()
        .from(habits)
        .where(and(eq(habits.userId, testUserId), eq(habits.id, habit.id)));
      expect(dbHabit1.currentStreak).toBe(1);
      expect(dbHabit1.longestStreak).toBe(1);

      // Second check-in on the exact same date (idempotent update)
      const res2 = await logHabitEntry(
        testUserId,
        habit.id,
        {
          date: "2026-09-15",
          value: 1,
          notes: "Updated check-in note",
        },
        undefined,
        "2026-09-15"
      );

      expect(res2.entry.notes).toBe("Updated check-in note");
      expect(res2.stats.currentStreak).toBe(1);

      // Check DB row count: strictly 1 entry
      const entries = await db
        .select()
        .from(habitEntries)
        .where(
          and(
            eq(habitEntries.userId, testUserId),
            eq(habitEntries.habitId, habit.id)
          )
        );
      expect(entries.length).toBe(1);
      expect(entries[0].notes).toBe("Updated check-in note");
    });

    it("validates quantitative targets: partial value does not count toward streak", async () => {
      if (!probe.isAvailable) return;

      const habit = await createHabit(testUserId, {
        title: "Water Intake",
        targetValue: 2000,
        unit: "ml",
        frequency: "daily",
      });

      // Log 1000ml (less than 2000ml target)
      const res1 = await logHabitEntry(
        testUserId,
        habit.id,
        {
          date: "2026-09-15",
          value: 1000,
        },
        undefined,
        "2026-09-15"
      );

      // Incomplete: does not meet target
      expect(res1.stats.currentStreak).toBe(0);
      expect(res1.stats.isCompletedToday).toBe(false);

      // Update same day to 2000ml (meets target)
      const res2 = await logHabitEntry(
        testUserId,
        habit.id,
        {
          date: "2026-09-15",
          value: 2000,
        },
        undefined,
        "2026-09-15"
      );

      expect(res2.stats.currentStreak).toBe(1);
      expect(res2.stats.isCompletedToday).toBe(true);
    });

    it("rejects check-in on an archived habit", async () => {
      if (!probe.isAvailable) return;

      const habit = await createHabit(testUserId, {
        title: "Archived Habit",
        status: "archived",
      });

      await expect(
        logHabitEntry(testUserId, habit.id, { date: "2026-09-15" })
      ).rejects.toThrow(InvariantViolationError);
    });

    it("rejects check-in attempt on another user's habit", async () => {
      if (!probe.isAvailable) return;

      const habit = await createHabit(testUserId, { title: "Private Habit" });

      await expect(
        logHabitEntry(foreignUserId, habit.id, { date: "2026-09-15" })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("6. Single-Click Toggle", () => {
    it("toggles uncompleted day to completed and back to uncompleted", async () => {
      if (!probe.isAvailable) return;

      const habit = await createHabit(testUserId, {
        title: "Daily Pushups",
        targetValue: 50,
        frequency: "daily",
      });

      // 1. Toggle ON for 2026-09-15
      const toggleOn = await toggleHabitEntry(
        testUserId,
        habit.id,
        "2026-09-15",
        undefined,
        "2026-09-15"
      );

      expect(toggleOn.toggled).toBe(true);
      expect(toggleOn.completed).toBe(true);
      expect(toggleOn.entry).not.toBeNull();
      expect(toggleOn.entry?.value).toBe(50);
      expect(toggleOn.stats.currentStreak).toBe(1);

      // Verify cached streak in DB
      const [h1] = await db
        .select()
        .from(habits)
        .where(and(eq(habits.userId, testUserId), eq(habits.id, habit.id)));
      expect(h1.currentStreak).toBe(1);

      // 2. Toggle OFF for 2026-09-15
      const toggleOff = await toggleHabitEntry(
        testUserId,
        habit.id,
        "2026-09-15",
        undefined,
        "2026-09-15"
      );

      expect(toggleOff.toggled).toBe(true);
      expect(toggleOff.completed).toBe(false);
      expect(toggleOff.entry).toBeNull();
      expect(toggleOff.stats.currentStreak).toBe(0);

      // Verify cached streak in DB reset to 0
      const [h2] = await db
        .select()
        .from(habits)
        .where(and(eq(habits.userId, testUserId), eq(habits.id, habit.id)));
      expect(h2.currentStreak).toBe(0);
    });

    it("rejects toggle on an archived habit", async () => {
      if (!probe.isAvailable) return;

      const habit = await createHabit(testUserId, {
        title: "Archived Habit For Toggle",
        status: "archived",
      });

      await expect(
        toggleHabitEntry(testUserId, habit.id, "2026-09-15")
      ).rejects.toThrow(InvariantViolationError);
    });
  });

  describe("7. Entry Deletion & History Range Matrix", () => {
    it("deletes check-in entry by date and recalculates streak", async () => {
      if (!probe.isAvailable) return;

      const habit = await createHabit(testUserId, {
        title: "Habit For Entry Deletion",
        frequency: "daily",
      });

      await logHabitEntry(testUserId, habit.id, { date: "2026-09-14" });
      await logHabitEntry(testUserId, habit.id, { date: "2026-09-15" });

      const beforeDel = await getHabit(testUserId, habit.id, "2026-09-15");
      expect(beforeDel?.currentStreak).toBe(2);

      const delRes = await deleteHabitEntry(
        testUserId,
        habit.id,
        "2026-09-15",
        undefined,
        "2026-09-15"
      );
      expect(delRes.success).toBe(true);
      expect(delRes.stats.currentStreak).toBe(1);

      // Deleting a date that doesn't exist throws NotFoundError
      await expect(
        deleteHabitEntry(testUserId, habit.id, "2026-09-20")
      ).rejects.toThrow(NotFoundError);
    });

    it("retrieves habit history matrix for calendar visualization", async () => {
      if (!probe.isAvailable) return;

      const habit = await createHabit(testUserId, {
        title: "History Habit",
        frequency: "weekdays",
      });

      // 2026-09-14 is Monday, 2026-09-15 is Tuesday, 2026-09-16 is Wednesday
      await logHabitEntry(testUserId, habit.id, { date: "2026-09-14" });
      await logHabitEntry(testUserId, habit.id, { date: "2026-09-15" });

      const history = await getHabitHistory(
        testUserId,
        habit.id,
        "2026-09-14",
        "2026-09-18"
      );

      expect(history.entries.length).toBe(2);
      expect(history.calendar.length).toBe(5); // 5 days: Mon to Fri
      expect(history.calendar[0].date).toBe("2026-09-14");
      expect(history.calendar[0].status).toBe("completed");
      expect(history.calendar[1].date).toBe("2026-09-15");
      expect(history.calendar[1].status).toBe("completed");
      expect(history.calendar[2].date).toBe("2026-09-16");
      expect(history.calendar[2].status).toBe("missed");
    });

    it("rejects getHabitHistory if startDate is after endDate", async () => {
      if (!probe.isAvailable) return;

      const habit = await createHabit(testUserId, { title: "Range Habit" });

      await expect(
        getHabitHistory(testUserId, habit.id, "2026-09-20", "2026-09-10")
      ).rejects.toThrow(InvariantViolationError);
    });
  });
});
