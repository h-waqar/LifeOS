import { describe, it, expect } from "vitest";
import { calculateScheduleOptimization } from "@/server/analytics/schedule-optimizer";
import type { HistoricalRawData } from "@/server/analytics/types";

describe("Plan 09-01: Schedule Optimization Engine (INTEL-04)", () => {
  it("provides sensible circadian rhythm baseline when historical data is empty", () => {
    const res = calculateScheduleOptimization([], [], []);

    expect(res.peakFocusWindow.startHour).toBe("09:00");
    expect(res.peakFocusWindow.endHour).toBe("11:30");
    expect(res.peakFocusWindow.confidenceScore).toBe(70);

    expect(res.secondaryFocusWindow.startHour).toBe("14:00");
    expect(res.secondaryFocusWindow.endHour).toBe("16:00");

    expect(res.recommendedBlockDurationMinutes).toBe(60);
    expect(res.energyTiers).toHaveLength(3);
    expect(res.energyTiers.map((t) => t.tier)).toEqual(["high", "medium", "low"]);
    expect(res.bestProductivityDays).toHaveLength(7);
    expect(res.actionableRecommendations.length).toBeGreaterThanOrEqual(3);
    expect(res.dataPointsAnalyzed.tasksWithEnergyCount).toBe(0);
  });

  it("identifies peak deep-work morning window from high-energy task completions", () => {
    const tasks: HistoricalRawData["tasks"] = [
      {
        id: "t1",
        title: "Architecture Design",
        status: "completed",
        priority: "critical",
        energyLevel: "high",
        estimatedDuration: 60,
        actualDuration: 60,
        dueDate: null,
        scheduledDate: null,
        completedAt: "2026-09-01T10:15:00Z",
        createdAt: "2026-09-01",
        projectId: null,
        goalId: null,
      },
      {
        id: "t2",
        title: "Core Implementation",
        status: "completed",
        priority: "high",
        energyLevel: "high",
        estimatedDuration: 90,
        actualDuration: 90,
        dueDate: null,
        scheduledDate: null,
        completedAt: "2026-09-02T10:45:00Z",
        createdAt: "2026-09-01",
        projectId: null,
        goalId: null,
      },
      {
        id: "t3",
        title: "Complex Bug Fix",
        status: "completed",
        priority: "high",
        energyLevel: "high",
        estimatedDuration: 60,
        actualDuration: 60,
        dueDate: null,
        scheduledDate: null,
        completedAt: "2026-09-03T11:00:00Z",
        createdAt: "2026-09-01",
        projectId: null,
        goalId: null,
      },
      {
        id: "t4",
        title: "PR Review",
        status: "completed",
        priority: "medium",
        energyLevel: "medium",
        estimatedDuration: 30,
        actualDuration: 30,
        dueDate: null,
        scheduledDate: null,
        completedAt: "2026-09-01T15:00:00Z",
        createdAt: "2026-09-01",
        projectId: null,
        goalId: null,
      },
    ];

    const res = calculateScheduleOptimization(tasks, [], []);

    // Peak high-energy concentration is around 10am
    expect(res.peakFocusWindow.startHour).toBe("10:00");
    expect(res.peakFocusWindow.endHour).toBe("12:30");
    expect(res.peakFocusWindow.confidenceScore).toBeGreaterThanOrEqual(60);
    expect(res.dataPointsAnalyzed.tasksWithEnergyCount).toBe(4);
  });

  it("adapts recommended focus block duration to user's average completed blocks", () => {
    const timeBlocks: HistoricalRawData["timeBlocks"] = [
      {
        id: "b1",
        title: "Block 1",
        startTime: "2026-09-01T09:00:00Z",
        endTime: "2026-09-01T09:45:00Z",
        durationMinutes: 45,
        actualMinutes: 45,
        status: "completed",
        commitmentLevel: "hard",
        projectId: null,
        goalId: null,
        taskId: null,
      },
      {
        id: "b2",
        title: "Block 2",
        startTime: "2026-09-02T09:00:00Z",
        endTime: "2026-09-02T09:45:00Z",
        durationMinutes: 45,
        actualMinutes: 45,
        status: "completed",
        commitmentLevel: "hard",
        projectId: null,
        goalId: null,
        taskId: null,
      },
      {
        id: "b3",
        title: "Block 3",
        startTime: "2026-09-03T09:00:00Z",
        endTime: "2026-09-03T09:45:00Z",
        durationMinutes: 45,
        actualMinutes: 45,
        status: "completed",
        commitmentLevel: "hard",
        projectId: null,
        goalId: null,
        taskId: null,
      },
    ];

    const res = calculateScheduleOptimization([], timeBlocks, []);
    expect(res.recommendedBlockDurationMinutes).toBe(45);
  });

  it("ranks best productivity days based on evening reviews", () => {
    // 2026-09-01 is Tuesday, 2026-09-02 is Wednesday, 2026-09-03 is Thursday
    const reviews: HistoricalRawData["eveningReviews"] = [
      {
        id: "r1",
        date: "2026-09-01", // Tuesday
        productivityScore: 95,
        completedTaskIds: ["t1", "t2", "t3"],
      },
      {
        id: "r2",
        date: "2026-09-02", // Wednesday
        productivityScore: 70,
        completedTaskIds: ["t4"],
      },
      {
        id: "r3",
        date: "2026-09-03", // Thursday
        productivityScore: 90,
        completedTaskIds: ["t5", "t6"],
      },
    ];

    const res = calculateScheduleOptimization([], [], reviews);
    expect(res.bestProductivityDays[0].dayOfWeek).toBe("Tuesday");
    expect(res.bestProductivityDays[0].averageScore).toBe(95);
    expect(res.bestProductivityDays[1].dayOfWeek).toBe("Thursday");
    expect(res.bestProductivityDays[1].averageScore).toBe(90);
  });

  it("generates actionable recommendations tailored to user schedule", () => {
    const res = calculateScheduleOptimization([], [], []);
    expect(res.actionableRecommendations.some((r) => r.includes("09:00"))).toBe(true);
    expect(res.actionableRecommendations.some((r) => r.includes("focus block"))).toBe(true);
    expect(res.actionableRecommendations.some((r) => r.includes("low-energy"))).toBe(true);
  });
});
