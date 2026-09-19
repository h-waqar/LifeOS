import { describe, it, expect } from "vitest";
import {
  calculateStreakStats,
  calculateCompletionRate,
  isScheduledDay,
  getStreakCalendar,
  type HabitStreakConfig,
  type HabitEntryRecord,
} from "@/server/habits/streaks";

describe("Phase 2 Plan 02-03: Pure Deterministic Habit Streak Engine", () => {
  describe("1. Daily Frequency Habit Semantics", () => {
    const dailyHabit: HabitStreakConfig = {
      id: "habit-daily-1",
      frequency: "daily",
      frequencyTarget: 1,
      targetValue: 1,
    };

    it("evaluates empty entries with all zeroes and false flags", () => {
      const stats = calculateStreakStats(dailyHabit, [], "2026-09-15");
      expect(stats.currentStreak).toBe(0);
      expect(stats.longestStreak).toBe(0);
      expect(stats.completionRate30d).toBe(0);
      expect(stats.completionRateAllTime).toBe(0);
      expect(stats.isCompletedToday).toBe(false);
      expect(stats.totalCompletions).toBe(0);
    });

    it("calculates consecutive daily streak correctly when today is completed", () => {
      const entries: HabitEntryRecord[] = [
        { date: "2026-09-13", value: 1 },
        { date: "2026-09-14", value: 1 },
        { date: "2026-09-15", value: 1 },
      ];
      const stats = calculateStreakStats(dailyHabit, entries, "2026-09-15");
      expect(stats.currentStreak).toBe(3);
      expect(stats.longestStreak).toBe(3);
      expect(stats.isCompletedToday).toBe(true);
    });

    it("preserves streak during active day grace period when today is not yet completed", () => {
      const entries: HabitEntryRecord[] = [
        { date: "2026-09-13", value: 1 },
        { date: "2026-09-14", value: 1 },
        // 2026-09-15 is active (today) but incomplete
      ];
      const stats = calculateStreakStats(dailyHabit, entries, "2026-09-15");
      // Does NOT immediately reset to 0; remains the streak through yesterday
      expect(stats.currentStreak).toBe(2);
      expect(stats.longestStreak).toBe(2);
      expect(stats.isCompletedToday).toBe(false);
    });

    it("breaks streak when a scheduled day has fully passed without completion", () => {
      const entries: HabitEntryRecord[] = [
        { date: "2026-09-12", value: 1 },
        { date: "2026-09-13", value: 1 },
        // 2026-09-14 missed
        // 2026-09-15 today not yet completed
      ];
      const stats = calculateStreakStats(dailyHabit, entries, "2026-09-15");
      expect(stats.currentStreak).toBe(0);
      expect(stats.longestStreak).toBe(2);
      expect(stats.isCompletedToday).toBe(false);
    });

    it("starts a new streak of 1 when completed today after a missed past day", () => {
      const entries: HabitEntryRecord[] = [
        { date: "2026-09-10", value: 1 },
        { date: "2026-09-11", value: 1 },
        // 2026-09-12..14 missed
        { date: "2026-09-15", value: 1 },
      ];
      const stats = calculateStreakStats(dailyHabit, entries, "2026-09-15");
      expect(stats.currentStreak).toBe(1);
      expect(stats.longestStreak).toBe(2);
      expect(stats.isCompletedToday).toBe(true);
    });

    it("maintains historical longest streak when past streak exceeds current streak", () => {
      const entries: HabitEntryRecord[] = [
        { date: "2026-08-01", value: 1 },
        { date: "2026-08-02", value: 1 },
        { date: "2026-08-03", value: 1 },
        { date: "2026-08-04", value: 1 },
        { date: "2026-08-05", value: 1 }, // 5-day streak
        // gap
        { date: "2026-09-14", value: 1 },
        { date: "2026-09-15", value: 1 }, // 2-day streak
      ];
      const stats = calculateStreakStats(dailyHabit, entries, "2026-09-15");
      expect(stats.currentStreak).toBe(2);
      expect(stats.longestStreak).toBe(5);
    });
  });

  describe("2. Target-Value Quantitative Semantics", () => {
    const readingHabit: HabitStreakConfig = {
      id: "habit-reading",
      frequency: "daily",
      frequencyTarget: 1,
      targetValue: 20, // 20 pages
    };

    it("treats partial values as incomplete and does NOT increment streaks", () => {
      const entries: HabitEntryRecord[] = [
        { date: "2026-09-13", value: 20 }, // Complete
        { date: "2026-09-14", value: 15 }, // Partial (< 20)
        { date: "2026-09-15", value: 10 }, // Partial (< 20)
      ];
      const stats = calculateStreakStats(readingHabit, entries, "2026-09-15");
      expect(stats.isCompletedToday).toBe(false);
      expect(stats.currentStreak).toBe(0);
      expect(stats.longestStreak).toBe(1);
      expect(stats.totalCompletions).toBe(1);
    });

    it("qualifies when value meets or exceeds targetValue", () => {
      const entries: HabitEntryRecord[] = [
        { date: "2026-09-13", value: 20 },
        { date: "2026-09-14", value: 25 }, // Exceeds target
        { date: "2026-09-15", value: 20 },
      ];
      const stats = calculateStreakStats(readingHabit, entries, "2026-09-15");
      expect(stats.isCompletedToday).toBe(true);
      expect(stats.currentStreak).toBe(3);
      expect(stats.longestStreak).toBe(3);
      expect(stats.totalCompletions).toBe(3);
    });
  });

  describe("3. Weekdays Frequency Habit Semantics", () => {
    const weekdayHabit: HabitStreakConfig = {
      id: "habit-weekdays",
      frequency: "weekdays",
      frequencyTarget: 1,
      targetValue: 1,
    };

    it("correctly identifies weekdays vs weekend rest days", () => {
      // 2026-09-14 is Monday (1)
      expect(isScheduledDay(weekdayHabit, "2026-09-14")).toBe(true);
      expect(isScheduledDay(weekdayHabit, "2026-09-15")).toBe(true); // Tue
      expect(isScheduledDay(weekdayHabit, "2026-09-16")).toBe(true); // Wed
      expect(isScheduledDay(weekdayHabit, "2026-09-17")).toBe(true); // Thu
      expect(isScheduledDay(weekdayHabit, "2026-09-18")).toBe(true); // Fri
      expect(isScheduledDay(weekdayHabit, "2026-09-19")).toBe(false); // Sat (rest)
      expect(isScheduledDay(weekdayHabit, "2026-09-20")).toBe(false); // Sun (rest)
    });

    it("carries streak through weekend rest days without breaking", () => {
      // Mon (14) through Fri (18) completed
      const entries: HabitEntryRecord[] = [
        { date: "2026-09-14", value: 1 },
        { date: "2026-09-15", value: 1 },
        { date: "2026-09-16", value: 1 },
        { date: "2026-09-17", value: 1 },
        { date: "2026-09-18", value: 1 },
      ];

      // On Saturday: rest day, streak remains 5
      const satStats = calculateStreakStats(weekdayHabit, entries, "2026-09-19");
      expect(satStats.currentStreak).toBe(5);

      // On Sunday: rest day, streak remains 5
      const sunStats = calculateStreakStats(weekdayHabit, entries, "2026-09-20");
      expect(sunStats.currentStreak).toBe(5);

      // On Monday morning (active, incomplete): streak remains 5
      const monMorningStats = calculateStreakStats(
        weekdayHabit,
        entries,
        "2026-09-21"
      );
      expect(monMorningStats.currentStreak).toBe(5);
      expect(monMorningStats.isCompletedToday).toBe(false);

      // Once Monday is completed: streak increments to 6
      const entriesWithMon: HabitEntryRecord[] = [
        ...entries,
        { date: "2026-09-21", value: 1 },
      ];
      const monEveningStats = calculateStreakStats(
        weekdayHabit,
        entriesWithMon,
        "2026-09-21"
      );
      expect(monEveningStats.currentStreak).toBe(6);
    });

    it("resets streak if Monday passed without completion when Tuesday arrives", () => {
      // Completed Fri 18, missed Mon 21, evaluating Tue 22
      const entries: HabitEntryRecord[] = [
        { date: "2026-09-18", value: 1 },
        // Mon 2026-09-21 missed
      ];
      const stats = calculateStreakStats(weekdayHabit, entries, "2026-09-22");
      expect(stats.currentStreak).toBe(0);
    });
  });

  describe("4. Specific-Days Frequency Habit Semantics", () => {
    // Habit scheduled on Monday (1), Wednesday (3), Friday (5)
    const mwfHabit: HabitStreakConfig = {
      id: "habit-mwf",
      frequency: "specific_days",
      frequencyTarget: 3,
      frequencyDays: [1, 3, 5],
      targetValue: 1,
    };

    it("preserves streak across non-scheduled days (Tue, Thu, Sat, Sun)", () => {
      // Mon 2026-09-14 completed
      const entriesMon: HabitEntryRecord[] = [{ date: "2026-09-14", value: 1 }];

      // Tue 2026-09-15: non-scheduled day -> streak remains 1
      const tueStats = calculateStreakStats(mwfHabit, entriesMon, "2026-09-15");
      expect(tueStats.currentStreak).toBe(1);

      // Wed 2026-09-16 completed -> streak 2
      const entriesWed = [...entriesMon, { date: "2026-09-16", value: 1 }];
      const wedStats = calculateStreakStats(mwfHabit, entriesWed, "2026-09-16");
      expect(wedStats.currentStreak).toBe(2);

      // Thu 2026-09-17: non-scheduled day -> streak remains 2
      const thuStats = calculateStreakStats(mwfHabit, entriesWed, "2026-09-17");
      expect(thuStats.currentStreak).toBe(2);

      // Fri 2026-09-18: active scheduled day incomplete -> streak remains 2
      const friIncomplete = calculateStreakStats(
        mwfHabit,
        entriesWed,
        "2026-09-18"
      );
      expect(friIncomplete.currentStreak).toBe(2);

      // Fri 2026-09-18 completed -> streak 3
      const entriesFri = [...entriesWed, { date: "2026-09-18", value: 1 }];
      const friStats = calculateStreakStats(mwfHabit, entriesFri, "2026-09-18");
      expect(friStats.currentStreak).toBe(3);

      // Sat 19 and Sun 20: non-scheduled -> streak remains 3
      expect(calculateStreakStats(mwfHabit, entriesFri, "2026-09-19").currentStreak).toBe(3);
      expect(calculateStreakStats(mwfHabit, entriesFri, "2026-09-20").currentStreak).toBe(3);
    });

    it("resets streak when a scheduled day (Wednesday) was missed", () => {
      // Mon 14 completed, Wed 16 missed, Fri 18 completed
      const entries: HabitEntryRecord[] = [
        { date: "2026-09-14", value: 1 },
        // Wed 16 missed
        { date: "2026-09-18", value: 1 },
      ];
      const stats = calculateStreakStats(mwfHabit, entries, "2026-09-18");
      expect(stats.currentStreak).toBe(1);
      expect(stats.longestStreak).toBe(1);
    });
  });

  describe("5. Weekly X-Times Habit Semantics (Monday–Sunday Calendar Weeks)", () => {
    // 3 times per week habit
    const weeklyHabit: HabitStreakConfig = {
      id: "habit-weekly-3x",
      frequency: "weekly",
      frequencyTarget: 3,
      targetValue: 1,
    };

    it("calculates qualifying weeks and carries forward during active week grace period", () => {
      // Week 1: Mon 2026-09-07 to Sun 2026-09-13 -> 3 completions (Qualifies)
      const week1Entries: HabitEntryRecord[] = [
        { date: "2026-09-07", value: 1 },
        { date: "2026-09-09", value: 1 },
        { date: "2026-09-11", value: 1 },
      ];

      // On Sunday of Week 1: streak is 1
      const w1Stats = calculateStreakStats(weeklyHabit, week1Entries, "2026-09-13");
      expect(w1Stats.currentStreak).toBe(1);

      // Week 2: Mon 2026-09-14 to Sun 2026-09-20
      // On Wednesday 2026-09-16, user has 1 completion in Week 2
      const w2MidEntries: HabitEntryRecord[] = [
        ...week1Entries,
        { date: "2026-09-15", value: 1 },
      ];
      // Week 2 is incomplete but active: streak must NOT be treated as failed!
      const w2WedStats = calculateStreakStats(
        weeklyHabit,
        w2MidEntries,
        "2026-09-16"
      );
      expect(w2WedStats.currentStreak).toBe(1);

      // On Friday 2026-09-18, user logs 2 more completions (total 3 in Week 2)
      const w2CompleteEntries: HabitEntryRecord[] = [
        ...w2MidEntries,
        { date: "2026-09-17", value: 1 },
        { date: "2026-09-18", value: 1 },
      ];
      const w2FriStats = calculateStreakStats(
        weeklyHabit,
        w2CompleteEntries,
        "2026-09-18"
      );
      expect(w2FriStats.currentStreak).toBe(2);
      expect(w2FriStats.longestStreak).toBe(2);
    });

    it("breaks weekly streak when past week ended with fewer completions than target", () => {
      // Week 1 qualified (3 completions)
      // Week 2 ended with only 2 completions (< 3 target)
      // Evaluating on Monday 2026-09-21 (Week 3 start)
      const entries: HabitEntryRecord[] = [
        { date: "2026-09-07", value: 1 },
        { date: "2026-09-09", value: 1 },
        { date: "2026-09-11", value: 1 },
        // Week 2
        { date: "2026-09-15", value: 1 },
        { date: "2026-09-17", value: 1 },
      ];

      const w3MonStats = calculateStreakStats(
        weeklyHabit,
        entries,
        "2026-09-21"
      );
      // Week 2 failed, so on Week 3 Monday, streak is broken
      expect(w3MonStats.currentStreak).toBe(0);
      expect(w3MonStats.longestStreak).toBe(1);
    });
  });

  describe("6. Custom Interval Habit Semantics", () => {
    // Every 3 days starting 2026-09-01
    const customHabit: HabitStreakConfig = {
      id: "habit-custom-3d",
      frequency: "custom",
      frequencyTarget: 1,
      intervalDays: 3,
      targetValue: 1,
      createdAt: "2026-09-01T00:00:00.000Z",
    };

    it("identifies scheduled days based on interval from createdAt anchor", () => {
      expect(isScheduledDay(customHabit, "2026-09-01")).toBe(true); // Day 0
      expect(isScheduledDay(customHabit, "2026-09-02")).toBe(false);
      expect(isScheduledDay(customHabit, "2026-09-03")).toBe(false);
      expect(isScheduledDay(customHabit, "2026-09-04")).toBe(true); // Day 3
      expect(isScheduledDay(customHabit, "2026-09-07")).toBe(true); // Day 6
    });

    it("tracks streaks across custom intervals with rest-day grace periods", () => {
      const entries: HabitEntryRecord[] = [
        { date: "2026-09-01", value: 1 },
        { date: "2026-09-04", value: 1 },
      ];
      // On 2026-09-05 (rest day) -> streak remains 2
      const restStats = calculateStreakStats(customHabit, entries, "2026-09-05");
      expect(restStats.currentStreak).toBe(2);

      // On 2026-09-07 (active scheduled day incomplete) -> streak remains 2
      const activeIncomplete = calculateStreakStats(
        customHabit,
        entries,
        "2026-09-07"
      );
      expect(activeIncomplete.currentStreak).toBe(2);

      // Once 2026-09-07 completed -> streak 3
      const entriesComplete = [...entries, { date: "2026-09-07", value: 1 }];
      const completeStats = calculateStreakStats(
        customHabit,
        entriesComplete,
        "2026-09-07"
      );
      expect(completeStats.currentStreak).toBe(3);
    });
  });

  describe("7. Completion Rate Calculations & Bounds", () => {
    const habit: HabitStreakConfig = {
      id: "habit-comp-rate",
      frequency: "daily",
      frequencyTarget: 1,
      targetValue: 1,
    };

    it("bounds completion rates strictly between 0 and 100", () => {
      // Inverted date range returns 0
      expect(
        calculateCompletionRate(habit, [], "2026-09-15", "2026-09-10")
      ).toBe(0);

      // 0 completed in 10 days returns 0
      expect(
        calculateCompletionRate(habit, [], "2026-09-01", "2026-09-10")
      ).toBe(0);

      // 10 completed in 10 days returns 100
      const fullEntries: HabitEntryRecord[] = Array.from({ length: 10 }, (_, i) => ({
        date: `2026-09-${String(i + 1).padStart(2, "0")}`,
        value: 1,
      }));
      expect(
        calculateCompletionRate(
          habit,
          fullEntries,
          "2026-09-01",
          "2026-09-10"
        )
      ).toBe(100);

      // 5 completed out of 10 days returns 50
      const halfEntries = fullEntries.slice(0, 5);
      expect(
        calculateCompletionRate(
          habit,
          halfEntries,
          "2026-09-01",
          "2026-09-10"
        )
      ).toBe(50);
    });

    it("evaluates completion rates for specific-days habits only against scheduled days", () => {
      const mwfHabit: HabitStreakConfig = {
        id: "habit-mwf-rate",
        frequency: "specific_days",
        frequencyTarget: 3,
        frequencyDays: [1, 3, 5], // Mon, Wed, Fri
        targetValue: 1,
      };

      // In the week Mon 2026-09-14 to Sun 2026-09-20:
      // Scheduled days: Mon 14, Wed 16, Fri 18 (Total 3 scheduled days)
      // Completed Mon 14 and Wed 16 (2 out of 3 = 66.666...% -> 67%)
      const entries: HabitEntryRecord[] = [
        { date: "2026-09-14", value: 1 },
        { date: "2026-09-16", value: 1 },
      ];
      const rate = calculateCompletionRate(
        mwfHabit,
        entries,
        "2026-09-14",
        "2026-09-20"
      );
      expect(rate).toBe(67);
    });
  });

  describe("8. Streak Calendar Matrix (getStreakCalendar)", () => {
    const habit: HabitStreakConfig = {
      id: "habit-cal",
      frequency: "weekdays",
      frequencyTarget: 1,
      targetValue: 1,
    };

    it("generates calendar day matrix with accurate status categorization", () => {
      // 5-day strip ending on Monday 2026-09-21:
      // Thu 17 (completed), Fri 18 (missed), Sat 19 (rest), Sun 20 (rest), Mon 21 (pending)
      const entries: HabitEntryRecord[] = [{ date: "2026-09-17", value: 1 }];

      const calendar = getStreakCalendar(habit, entries, 5, "2026-09-21");
      expect(calendar).toHaveLength(5);

      expect(calendar[0]).toEqual({
        date: "2026-09-17",
        isScheduled: true,
        isCompleted: true,
        value: 1,
        targetValue: 1,
        status: "completed",
      });

      expect(calendar[1]).toEqual({
        date: "2026-09-18",
        isScheduled: true,
        isCompleted: false,
        value: 0,
        targetValue: 1,
        status: "missed",
      });

      expect(calendar[2]).toEqual({
        date: "2026-09-19",
        isScheduled: false,
        isCompleted: false,
        value: 0,
        targetValue: 1,
        status: "rest",
      });

      expect(calendar[3]).toEqual({
        date: "2026-09-20",
        isScheduled: false,
        isCompleted: false,
        value: 0,
        targetValue: 1,
        status: "rest",
      });

      expect(calendar[4]).toEqual({
        date: "2026-09-21",
        isScheduled: true,
        isCompleted: false,
        value: 0,
        targetValue: 1,
        status: "pending", // active reference day
      });
    });
  });
});
