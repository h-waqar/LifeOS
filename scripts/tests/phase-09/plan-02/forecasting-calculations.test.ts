// @vitest-environment node
import { describe, it, expect } from "vitest";
import { calculateGoalRiskForecast } from "@/server/goals/forecasting/calculations";
import type { GoalForecastSignalInput } from "@/server/goals/forecasting/types";

describe("Plan 09-02: Goal Risk Forecasting Engine (INTEL-02)", () => {
  const baseAsOf = new Date("2026-09-30T12:00:00.000Z");

  const createBaseInput = (
    overrides: Partial<GoalForecastSignalInput> = {}
  ): GoalForecastSignalInput => ({
    goalId: "goal_test_01",
    goalTitle: "Launch LifeOS Phase 9",
    goalStatus: "in_progress",
    priority: "high",
    area: "career",
    horizon: "medium_term",
    currentProgress: 50,
    startDate: new Date("2026-09-01T00:00:00.000Z"),
    targetDate: new Date("2026-10-31T00:00:00.000Z"),
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    asOfDate: baseAsOf,
    tasks: [],
    projects: [],
    habits: [],
    focusMinutes: 120,
    ...overrides,
  });

  describe("1. Goal Completion Status & Invariants", () => {
    it("classifies completed goal with 0 risk score and 1.0 confidence", () => {
      const input = createBaseInput({
        goalStatus: "completed",
        currentProgress: 100,
        completedAt: new Date("2026-09-29T10:00:00.000Z"),
      });

      const forecast = calculateGoalRiskForecast(input);

      expect(forecast.riskLevel).toBe("completed");
      expect(forecast.riskScore).toBe(0);
      expect(forecast.confidenceScore).toBe(1.0);
      expect(forecast.isOverdue).toBe(false);
      expect(forecast.daysToCompleteProjected).toBe(0);
      expect(forecast.projectedCompletionDate).toBe("2026-09-29T10:00:00.000Z");
      expect(forecast.actionableRecommendations[0]).toContain("Goal is completed");
    });

    it("treats progress >= 100 as completed even if status string is in_progress", () => {
      const input = createBaseInput({
        currentProgress: 100,
        goalStatus: "in_progress",
      });

      const forecast = calculateGoalRiskForecast(input);
      expect(forecast.riskLevel).toBe("completed");
      expect(forecast.riskScore).toBe(0);
    });
  });

  describe("2. Healthy & On-Track Trajectory Scenarios", () => {
    it("evaluates healthy trajectory when current velocity exceeds required velocity", () => {
      // 29 days elapsed, 50% progress done (~1.72% / day). 31 days left for 50% (~1.61% / day required)
      const input = createBaseInput({
        currentProgress: 60, // 60% done in 29.5 days (~2.03% / day)
        tasks: [
          {
            id: "t1",
            status: "completed",
            dueDate: new Date("2026-09-10T00:00:00.000Z"),
            completedAt: new Date("2026-09-10T00:00:00.000Z"),
            createdAt: new Date("2026-09-01T00:00:00.000Z"),
          },
          {
            id: "t2",
            status: "completed",
            dueDate: new Date("2026-09-20T00:00:00.000Z"),
            completedAt: new Date("2026-09-20T00:00:00.000Z"),
            createdAt: new Date("2026-09-01T00:00:00.000Z"),
          },
          {
            id: "t3",
            status: "todo",
            dueDate: new Date("2026-10-15T00:00:00.000Z"),
            completedAt: null,
            createdAt: new Date("2026-09-01T00:00:00.000Z"),
          },
        ],
        projects: [
          {
            id: "p1",
            name: "Core Infrastructure",
            status: "active",
            progress: 70,
            targetDate: new Date("2026-10-15T00:00:00.000Z"),
            createdAt: new Date("2026-09-01T00:00:00.000Z"),
          },
        ],
        habits: [{ id: "h1", title: "Daily Review", consistencyRate: 90, currentStreak: 14 }],
      });

      const forecast = calculateGoalRiskForecast(input);

      expect(forecast.riskLevel).toBe("on_track");
      expect(forecast.riskScore).toBeLessThan(25);
      expect(forecast.velocityRatio).toBeGreaterThanOrEqual(1.0);
      expect(forecast.isOverdue).toBe(false);
      expect(forecast.projectedCompletionDate).not.toBeNull();
      expect(new Date(forecast.projectedCompletionDate!).getTime()).toBeLessThan(
        new Date("2026-10-31T00:00:00.000Z").getTime()
      );
    });

    it("calculates optimistic and conservative completion windows", () => {
      const input = createBaseInput({
        currentProgress: 50,
      });

      const forecast = calculateGoalRiskForecast(input);
      expect(forecast.projectedCompletionWindow).not.toBeNull();
      const earliest = new Date(forecast.projectedCompletionWindow!.earliestDate).getTime();
      const latest = new Date(forecast.projectedCompletionWindow!.latestDate).getTime();
      const projected = new Date(forecast.projectedCompletionDate!).getTime();

      expect(earliest).toBeLessThan(projected);
      expect(latest).toBeGreaterThan(projected);
    });
  });

  describe("3. Declining & Lagging Trajectory Scenarios", () => {
    it("flags medium/high risk when current velocity is significantly below required velocity", () => {
      // Goal 10% done after 29 days (0.34% / day). Deadline in 31 days with 90% remaining (requires ~2.9% / day)
      const input = createBaseInput({
        currentProgress: 10,
        tasks: [
          {
            id: "t1",
            status: "todo",
            dueDate: new Date("2026-10-10T00:00:00.000Z"),
            completedAt: null,
            createdAt: new Date("2026-09-01T00:00:00.000Z"),
          },
        ],
      });

      const forecast = calculateGoalRiskForecast(input);

      expect(["medium_risk", "high_risk", "critical"]).toContain(forecast.riskLevel);
      expect(forecast.riskScore).toBeGreaterThanOrEqual(40);
      expect(forecast.velocityRatio).toBeLessThan(0.5);

      const severeDeficitFactor = forecast.contributingFactors.find(
        (f) => f.code === "SEVERE_VELOCITY_DEFICIT" || f.code === "MODERATE_VELOCITY_DEFICIT"
      );
      expect(severeDeficitFactor).toBeDefined();
    });

    it("penalizes goals with high overdue-task ratio", () => {
      const input = createBaseInput({
        currentProgress: 40,
        tasks: [
          {
            id: "t1",
            status: "todo",
            dueDate: new Date("2026-09-15T00:00:00.000Z"), // Overdue!
            completedAt: null,
            createdAt: new Date("2026-09-01T00:00:00.000Z"),
          },
          {
            id: "t2",
            status: "todo",
            dueDate: new Date("2026-09-20T00:00:00.000Z"), // Overdue!
            completedAt: null,
            createdAt: new Date("2026-09-01T00:00:00.000Z"),
          },
          {
            id: "t3",
            status: "todo",
            dueDate: new Date("2026-09-25T00:00:00.000Z"), // Overdue!
            completedAt: null,
            createdAt: new Date("2026-09-01T00:00:00.000Z"),
          },
          {
            id: "t4",
            status: "todo",
            dueDate: new Date("2026-10-20T00:00:00.000Z"), // Not overdue
            completedAt: null,
            createdAt: new Date("2026-09-01T00:00:00.000Z"),
          },
        ],
      });

      const forecast = calculateGoalRiskForecast(input);
      expect(forecast.signals.overdueTasks).toBe(3);
      expect(forecast.signals.overdueTaskRate).toBe(0.75);

      const overdueFactor = forecast.contributingFactors.find((f) => f.code === "OVERDUE_TASKS");
      expect(overdueFactor).toBeDefined();
      expect(overdueFactor!.severity).toBe("high");
      expect(forecast.riskScore).toBeGreaterThanOrEqual(45);
    });
  });

  describe("4. Overdue Goal Scenarios", () => {
    it("classifies overdue goal as critical with high risk score", () => {
      const input = createBaseInput({
        currentProgress: 40,
        targetDate: new Date("2026-09-20T00:00:00.000Z"), // 10 days ago!
      });

      const forecast = calculateGoalRiskForecast(input);

      expect(forecast.isOverdue).toBe(true);
      expect(forecast.riskLevel).toBe("critical");
      expect(forecast.riskScore).toBeGreaterThanOrEqual(90);
      expect(forecast.daysRemaining).toBeLessThan(0);

      const overdueFactor = forecast.contributingFactors.find(
        (f) => f.code === "OVERDUE_DEADLINE"
      );
      expect(overdueFactor).toBeDefined();
      expect(overdueFactor!.severity).toBe("critical");
      expect(forecast.actionableRecommendations[0]).toContain("Goal deadline has passed");
    });
  });

  describe("5. Stalled Progress & Zero Progress Scenarios", () => {
    it("handles zero progress safely without division by zero or NaN", () => {
      const input = createBaseInput({
        currentProgress: 0,
        tasks: [],
        projects: [],
      });

      const forecast = calculateGoalRiskForecast(input);

      expect(forecast.currentVelocityPerDay).toBe(0);
      expect(forecast.projectedCompletionDate).toBeNull();
      expect(forecast.projectedCompletionWindow).toBeNull();
      expect(forecast.daysToCompleteProjected).toBeNull();
      expect(isNaN(forecast.riskScore)).toBe(false);

      const stalledFactor = forecast.contributingFactors.find(
        (f) => f.code === "STALLED_PROGRESS"
      );
      expect(stalledFactor).toBeDefined();
    });

    it("flags stalled projects with zero progress", () => {
      const input = createBaseInput({
        currentProgress: 20,
        projects: [
          {
            id: "p1",
            name: "Unstarted Project 1",
            status: "active",
            progress: 0,
            targetDate: new Date("2026-10-15T00:00:00.000Z"),
            createdAt: new Date("2026-09-01T00:00:00.000Z"),
          },
          {
            id: "p2",
            name: "Unstarted Project 2",
            status: "planning",
            progress: 0,
            targetDate: new Date("2026-10-20T00:00:00.000Z"),
            createdAt: new Date("2026-09-01T00:00:00.000Z"),
          },
        ],
      });

      const forecast = calculateGoalRiskForecast(input);
      expect(forecast.signals.stalledProjectsCount).toBe(2);

      const stalledFactor = forecast.contributingFactors.find(
        (f) => f.code === "STALLED_PROJECTS"
      );
      expect(stalledFactor).toBeDefined();
    });
  });

  describe("6. Missing & Invalid Deadline Scenarios", () => {
    it("handles goal with no target deadline gracefully", () => {
      const input = createBaseInput({
        targetDate: null,
      });

      const forecast = calculateGoalRiskForecast(input);

      expect(forecast.targetDate).toBeNull();
      expect(forecast.daysRemaining).toBeNull();
      expect(forecast.requiredVelocityPerDay).toBeNull();
      expect(forecast.velocityRatio).toBeNull();
      expect(forecast.signals.expectedProgressByTimeline).toBeNull();
      expect(forecast.signals.progressGap).toBeNull();

      const noDeadlineFactor = forecast.contributingFactors.find(
        (f) => f.code === "NO_TARGET_DEADLINE"
      );
      expect(noDeadlineFactor).toBeDefined();
      expect(forecast.actionableRecommendations).toContain(
        "Assign a target completion date to enable accurate velocity trajectory forecasting."
      );
    });

    it("handles targetDate before startDate safely", () => {
      const input = createBaseInput({
        startDate: new Date("2026-10-01T00:00:00.000Z"),
        targetDate: new Date("2026-09-15T00:00:00.000Z"),
      });

      const forecast = calculateGoalRiskForecast(input);
      expect(forecast.isOverdue).toBe(true);
      expect(isNaN(forecast.riskScore)).toBe(false);
    });
  });

  describe("7. Data Sufficiency & Confidence Indicators", () => {
    it("reports insufficient data when newly created with 0 activity", () => {
      const input = createBaseInput({
        currentProgress: 0,
        createdAt: new Date("2026-09-29T12:00:00.000Z"), // 1 day ago
        startDate: new Date("2026-09-29T12:00:00.000Z"),
        tasks: [],
        projects: [],
        habits: [],
        focusMinutes: 0,
      });

      const forecast = calculateGoalRiskForecast(input);

      expect(forecast.dataSufficiency).toBe("insufficient");
      expect(forecast.sufficientData).toBe(false);
      expect(forecast.confidenceScore).toBeLessThanOrEqual(0.35);
      expect(forecast.sufficiencyExplanation).toContain("Insufficient activity logged");
    });

    it("reports sparse data when only 1-2 data points exist", () => {
      const input = createBaseInput({
        currentProgress: 10,
        createdAt: new Date("2026-09-27T12:00:00.000Z"), // 3 days ago
        startDate: new Date("2026-09-27T12:00:00.000Z"),
        focusMinutes: 0,
        tasks: [
          {
            id: "t1",
            status: "todo",
            dueDate: new Date("2026-10-15T00:00:00.000Z"),
            completedAt: null,
            createdAt: new Date("2026-09-27T12:00:00.000Z"),
          },
        ],
        projects: [],
        habits: [],
      });

      const forecast = calculateGoalRiskForecast(input);
      expect(forecast.dataSufficiency).toBe("sparse");
      expect(forecast.confidenceScore).toBeLessThanOrEqual(0.65);
    });

    it("reports sufficient data when full task, project, and habit history exist", () => {
      const input = createBaseInput({
        currentProgress: 50,
        tasks: [
          {
            id: "t1",
            status: "completed",
            dueDate: null,
            completedAt: new Date("2026-09-10T00:00:00.000Z"),
            createdAt: new Date("2026-09-01T00:00:00.000Z"),
          },
          {
            id: "t2",
            status: "completed",
            dueDate: null,
            completedAt: new Date("2026-09-20T00:00:00.000Z"),
            createdAt: new Date("2026-09-01T00:00:00.000Z"),
          },
          {
            id: "t3",
            status: "todo",
            dueDate: new Date("2026-10-10T00:00:00.000Z"),
            completedAt: null,
            createdAt: new Date("2026-09-01T00:00:00.000Z"),
          },
        ],
        projects: [
          {
            id: "p1",
            name: "Proj",
            status: "active",
            progress: 50,
            targetDate: null,
            createdAt: new Date("2026-09-01T00:00:00.000Z"),
          },
        ],
        habits: [{ id: "h1", title: "Habit", consistencyRate: 80, currentStreak: 7 }],
      });

      const forecast = calculateGoalRiskForecast(input);
      expect(forecast.dataSufficiency).toBe("sufficient");
      expect(forecast.confidenceScore).toBeGreaterThanOrEqual(0.75);
    });
  });

  describe("8. Boundary Conditions & Numerical Robustness", () => {
    it("handles boundary values 0% and 100% progress without error", () => {
      const forecast0 = calculateGoalRiskForecast(createBaseInput({ currentProgress: 0 }));
      expect(forecast0.currentProgress).toBe(0);

      const forecast100 = calculateGoalRiskForecast(createBaseInput({ currentProgress: 100 }));
      expect(forecast100.currentProgress).toBe(100);
      expect(forecast100.riskScore).toBe(0);
    });

    it("clamps negative progress and >100 progress strictly within [0, 100]", () => {
      const forecastNegative = calculateGoalRiskForecast(
        createBaseInput({ currentProgress: -25 })
      );
      expect(forecastNegative.currentProgress).toBe(0);

      const forecastOver = calculateGoalRiskForecast(
        createBaseInput({ currentProgress: 150 })
      );
      expect(forecastOver.currentProgress).toBe(100);
    });

    it("handles empty strings and invalid dates without throwing exceptions", () => {
      expect(() =>
        calculateGoalRiskForecast(
          createBaseInput({
            startDate: "invalid-date",
            targetDate: "invalid-date",
            asOfDate: "invalid-date",
          })
        )
      ).not.toThrow();
    });
  });
});
