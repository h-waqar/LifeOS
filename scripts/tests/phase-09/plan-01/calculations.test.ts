import { describe, it, expect } from "vitest";
import {
  calculateDelta,
  calculateRollingAverages,
  getDatesInRange,
  calculateHabitConsistency,
  calculateVelocity,
  calculateTimeAllocation,
  calculateGoalProgressSummary,
  calculateCrossDomainCorrelations,
} from "@/server/analytics/calculations";
import type { HistoricalRawData } from "@/server/analytics/types";

describe("Plan 09-01: Deterministic Analytics Calculation Engine (Unit Tests)", () => {
  describe("1. Delta & Trend Direction Calculations", () => {
    it("handles zero to zero as flat with 0% delta", () => {
      const res = calculateDelta(0, 0);
      expect(res.absoluteDelta).toBe(0);
      expect(res.percentageDelta).toBe(0);
      expect(res.direction).toBe("flat");
    });

    it("handles zero to positive value as up with +100% delta", () => {
      const res = calculateDelta(10, 0);
      expect(res.absoluteDelta).toBe(10);
      expect(res.percentageDelta).toBe(100);
      expect(res.direction).toBe("up");
    });

    it("handles zero to negative value as down with -100% delta", () => {
      const res = calculateDelta(-5, 0);
      expect(res.absoluteDelta).toBe(-5);
      expect(res.percentageDelta).toBe(-100);
      expect(res.direction).toBe("down");
    });

    it("computes positive percentage change accurately", () => {
      const res = calculateDelta(150, 100);
      expect(res.absoluteDelta).toBe(50);
      expect(res.percentageDelta).toBe(50);
      expect(res.direction).toBe("up");
    });

    it("computes negative percentage change accurately", () => {
      const res = calculateDelta(75, 100);
      expect(res.absoluteDelta).toBe(-25);
      expect(res.percentageDelta).toBe(-25);
      expect(res.direction).toBe("down");
    });

    it("handles flat values when non-zero", () => {
      const res = calculateDelta(42, 42);
      expect(res.absoluteDelta).toBe(0);
      expect(res.percentageDelta).toBe(0);
      expect(res.direction).toBe("flat");
    });
  });

  describe("2. Rolling Averages & Date Range", () => {
    it("generates continuous dates between start and end inclusive", () => {
      const dates = getDatesInRange("2026-09-01", "2026-09-05");
      expect(dates).toEqual([
        "2026-09-01",
        "2026-09-02",
        "2026-09-03",
        "2026-09-04",
        "2026-09-05",
      ]);
    });

    it("handles single date range", () => {
      const dates = getDatesInRange("2026-09-15", "2026-09-15");
      expect(dates).toEqual(["2026-09-15"]);
    });

    it("handles reversed or invalid dates safely", () => {
      const dates = getDatesInRange("2026-09-20", "2026-09-10");
      expect(dates).toEqual(["2026-09-20"]);
    });

    it("calculates 7-day rolling averages deterministically", () => {
      const series = [
        { date: "2026-09-01", value: 10 },
        { date: "2026-09-02", value: 20 },
        { date: "2026-09-03", value: 30 },
      ];
      const res = calculateRollingAverages(series, 2);
      expect(res[0].rollingAvg).toBe(10); // [10] avg 10
      expect(res[1].rollingAvg).toBe(15); // [10, 20] avg 15
      expect(res[2].rollingAvg).toBe(25); // [20, 30] avg 25
    });
  });

  describe("3. Habit Consistency Calculations (INTEL-01)", () => {
    it("returns 0% consistency on empty habits", () => {
      const res = calculateHabitConsistency([], [], "2026-09-01", "2026-09-07");
      expect(res.overallConsistencyRate).toBe(0);
      expect(res.activeHabitsCount).toBe(0);
      expect(res.totalCompletions).toBe(0);
      expect(res.perfectDaysCount).toBe(0);
    });

    it("calculates daily habit consistency accurately", () => {
      const habits: HistoricalRawData["habits"] = [
        {
          id: "h1",
          title: "Daily Meditation",
          frequency: "daily",
          currentStreak: 5,
          longestStreak: 10,
          status: "active",
          timeOfDay: "morning",
        },
      ];
      const entries: HistoricalRawData["habitEntries"] = [
        { id: "e1", habitId: "h1", date: "2026-09-01", completedAt: "2026-09-01T08:00:00Z" },
        { id: "e2", habitId: "h1", date: "2026-09-02", completedAt: "2026-09-02T08:00:00Z" },
      ];

      // 4 days range: 2026-09-01 to 2026-09-04
      const res = calculateHabitConsistency(habits, entries, "2026-09-01", "2026-09-04");
      expect(res.activeHabitsCount).toBe(1);
      expect(res.totalExpected).toBe(4);
      expect(res.totalCompletions).toBe(2);
      expect(res.overallConsistencyRate).toBe(50);
      expect(res.perfectDaysCount).toBe(2);
      expect(res.timeOfDayBreakdown[0].cue).toBe("morning");
      expect(res.timeOfDayBreakdown[0].completions).toBe(2);
    });

    it("calculates weekday habit frequency ignoring weekends", () => {
      const habits: HistoricalRawData["habits"] = [
        {
          id: "h2",
          title: "Work Standup",
          frequency: "weekdays",
          currentStreak: 2,
          longestStreak: 5,
          status: "active",
        },
      ];
      // 2026-09-04 is Friday, 09-05 is Saturday, 09-06 is Sunday, 09-07 is Monday
      const res = calculateHabitConsistency(habits, [], "2026-09-04", "2026-09-07");
      // Friday and Monday = 2 weekdays
      expect(res.totalExpected).toBe(2);
      expect(res.overallConsistencyRate).toBe(0);
    });
  });

  describe("4. Task & Project Velocity Calculations (INTEL-01)", () => {
    it("handles empty tasks and projects safely with zero denominators", () => {
      const res = calculateVelocity([], [], "2026-09-01", "2026-09-07");
      expect(res.tasksCompletedCount).toBe(0);
      expect(res.velocityPerDay).toBe(0);
      expect(res.velocityPerWeek).toBe(0);
      expect(res.overdueRate).toBe(0);
      expect(res.estimationAccuracy).toBe(100);
      expect(res.activeProjectsCount).toBe(0);
    });

    it("computes completion velocity and overdue rate accurately", () => {
      const tasks: HistoricalRawData["tasks"] = [
        {
          id: "t1",
          title: "Task 1",
          status: "completed",
          priority: "high",
          energyLevel: "high",
          estimatedDuration: 60,
          actualDuration: 50,
          dueDate: "2026-09-03",
          scheduledDate: "2026-09-03",
          completedAt: "2026-09-03T10:00:00Z",
          createdAt: "2026-09-01T08:00:00Z",
          projectId: "p1",
          goalId: null,
        },
        {
          id: "t2",
          title: "Task 2",
          status: "completed",
          priority: "medium",
          energyLevel: "medium",
          estimatedDuration: 30,
          actualDuration: 30,
          dueDate: "2026-09-04",
          scheduledDate: "2026-09-04",
          completedAt: "2026-09-04T14:00:00Z",
          createdAt: "2026-09-01T08:00:00Z",
          projectId: "p1",
          goalId: null,
        },
        {
          id: "t3",
          title: "Overdue Task",
          status: "todo",
          priority: "high",
          energyLevel: "high",
          estimatedDuration: 45,
          actualDuration: null,
          dueDate: "2026-09-02",
          scheduledDate: null,
          completedAt: null,
          createdAt: "2026-09-01T08:00:00Z",
          projectId: null,
          goalId: null,
        },
      ];

      const projects: HistoricalRawData["projects"] = [
        {
          id: "p1",
          name: "Project LifeOS",
          status: "active",
          progress: 50,
          area: "career",
          createdAt: "2026-09-01",
        },
      ];

      // 4-day window: 2026-09-01 to 2026-09-04
      const res = calculateVelocity(tasks, projects, "2026-09-01", "2026-09-04");
      expect(res.tasksCompletedCount).toBe(2);
      expect(res.velocityPerDay).toBe(0.5); // 2 tasks / 4 days = 0.5
      expect(res.velocityPerWeek).toBe(3.5);
      expect(res.overdueCount).toBe(1);
      expect(res.overdueRate).toBe(100); // 1 active task which is overdue = 100%
      // Estimation accuracy: (50 + 30) / (60 + 30) = 80 / 90 = 88.9%
      expect(res.estimationAccuracy).toBe(88.9);
      expect(res.activeProjectsCount).toBe(1);
      expect(res.projectBreakdown[0].tasksCompleted).toBe(2);
    });
  });

  describe("5. Time Allocation Calculations (INTEL-01)", () => {
    it("handles empty time blocks safely", () => {
      const res = calculateTimeAllocation([], [], [], "2026-09-01", "2026-09-07");
      expect(res.totalScheduledMinutes).toBe(0);
      expect(res.totalCompletedMinutes).toBe(0);
      expect(res.completionRate).toBe(0);
      expect(res.focusMinutes).toBe(0);
      expect(res.shallowMinutes).toBe(0);
      expect(res.areaBreakdown).toHaveLength(6);
    });

    it("aggregates focus minutes, shallow minutes, and areas correctly", () => {
      const timeBlocks: HistoricalRawData["timeBlocks"] = [
        {
          id: "tb1",
          title: "Deep Coding",
          startTime: "2026-09-02T09:00:00Z",
          endTime: "2026-09-02T11:00:00Z",
          durationMinutes: 120,
          actualMinutes: 120,
          status: "completed",
          commitmentLevel: "hard",
          projectId: "p1",
          goalId: null,
          taskId: "t1",
        },
        {
          id: "tb2",
          title: "Quick Email Check",
          startTime: "2026-09-02T11:30:00Z",
          endTime: "2026-09-02T11:45:00Z",
          durationMinutes: 15,
          actualMinutes: 15,
          status: "completed",
          commitmentLevel: "soft",
          projectId: null,
          goalId: null,
          taskId: null,
        },
      ];

      const projects: HistoricalRawData["projects"] = [
        {
          id: "p1",
          name: "Project LifeOS",
          status: "active",
          progress: 50,
          area: "career",
          createdAt: "2026-09-01",
        },
      ];

      const res = calculateTimeAllocation(timeBlocks, projects, [], "2026-09-01", "2026-09-03");
      expect(res.totalScheduledMinutes).toBe(135);
      expect(res.totalCompletedMinutes).toBe(135);
      expect(res.completionRate).toBe(100);
      expect(res.focusMinutes).toBe(120);
      expect(res.shallowMinutes).toBe(15);

      const careerArea = res.areaBreakdown.find((a) => a.area === "career");
      expect(careerArea?.completedMinutes).toBe(120);
      const generalArea = res.areaBreakdown.find((a) => a.area === "general");
      expect(generalArea?.completedMinutes).toBe(15);
    });
  });

  describe("6. Goal Progress Summary (INTEL-01)", () => {
    it("handles empty goals safely", () => {
      const res = calculateGoalProgressSummary([]);
      expect(res.totalGoalsCount).toBe(0);
      expect(res.activeGoalsCount).toBe(0);
      expect(res.averageProgress).toBe(0);
      expect(res.stalledGoalsCount).toBe(0);
      expect(res.goalsMovingForwardCount).toBe(0);
    });

    it("aggregates progress rollups across horizons and areas", () => {
      const goals: HistoricalRawData["goals"] = [
        {
          id: "g1",
          title: "Ship LifeOS MVP",
          status: "in_progress",
          progress: 80,
          area: "career",
          horizon: "short_term",
          targetDate: "2026-10-01",
          updatedAt: "2026-09-25",
        },
        {
          id: "g2",
          title: "Run Marathon",
          status: "in_progress",
          progress: 0,
          area: "health",
          horizon: "long_term",
          targetDate: "2027-05-01",
          updatedAt: "2026-09-01",
        },
      ];

      const res = calculateGoalProgressSummary(goals);
      expect(res.totalGoalsCount).toBe(2);
      expect(res.activeGoalsCount).toBe(2);
      expect(res.averageProgress).toBe(40); // (80 + 0) / 2
      expect(res.stalledGoalsCount).toBe(1);
      expect(res.goalsMovingForwardCount).toBe(1);

      const careerArea = res.areaRollup.find((a) => a.area === "career");
      expect(careerArea?.averageProgress).toBe(80);

      const shortHorizon = res.horizonRollup.find((h) => h.horizon === "short_term");
      expect(shortHorizon?.averageProgress).toBe(80);
    });
  });

  describe("7. Cross-Domain Correlation Calculations (INTEL-01)", () => {
    it("computes correlations across habits, velocity, and reviews", () => {
      const tasks: HistoricalRawData["tasks"] = [
        {
          id: "t1",
          title: "T1",
          status: "completed",
          priority: "high",
          energyLevel: "high",
          estimatedDuration: 60,
          actualDuration: 60,
          dueDate: null,
          scheduledDate: null,
          completedAt: "2026-09-01T10:00:00Z",
          createdAt: "2026-09-01",
          projectId: null,
          goalId: null,
        },
        {
          id: "t2",
          title: "T2",
          status: "completed",
          priority: "high",
          energyLevel: "high",
          estimatedDuration: 60,
          actualDuration: 60,
          dueDate: null,
          scheduledDate: null,
          completedAt: "2026-09-01T11:00:00Z",
          createdAt: "2026-09-01",
          projectId: null,
          goalId: null,
        },
      ];

      const habitEntries: HistoricalRawData["habitEntries"] = [
        { id: "e1", habitId: "h1", date: "2026-09-01", completedAt: "2026-09-01" },
        { id: "e2", habitId: "h2", date: "2026-09-01", completedAt: "2026-09-01" },
        { id: "e3", habitId: "h3", date: "2026-09-01", completedAt: "2026-09-01" },
      ];

      const timeBlocks: HistoricalRawData["timeBlocks"] = [
        {
          id: "tb1",
          title: "Deep work",
          startTime: "2026-09-01T09:00:00Z",
          endTime: "2026-09-01T11:00:00Z",
          durationMinutes: 120,
          actualMinutes: 120,
          status: "completed",
          commitmentLevel: "hard",
          projectId: null,
          goalId: null,
          taskId: null,
        },
      ];

      const dailyPlans: HistoricalRawData["dailyPlans"] = [
        {
          id: "dp1",
          date: "2026-09-01",
          status: "completed",
          priorityTaskIds: ["t1", "t2"],
        },
      ];

      const eveningReviews: HistoricalRawData["eveningReviews"] = [
        {
          id: "er1",
          date: "2026-09-01",
          productivityScore: 90,
          completedTaskIds: ["t1", "t2"],
        },
      ];

      const res = calculateCrossDomainCorrelations(
        tasks,
        habitEntries,
        timeBlocks,
        dailyPlans,
        eveningReviews,
        [],
        "2026-09-01",
        "2026-09-02"
      );

      expect(res.habitVsVelocityCorrelation.highHabitDaysAvgTasks).toBe(2);
      expect(res.deepWorkVsProductivityScore.highFocusDaysAvgScore).toBe(90);
      expect(res.dailyPlanCompletionImpact.plannedDaysAvgVelocity).toBe(2);
    });
  });
});
