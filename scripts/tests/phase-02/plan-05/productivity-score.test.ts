import { describe, it, expect } from "vitest";
import { calculateProductivityScore } from "@/server/daily-plan/productivity-score";

describe("Phase 2 Plan 02-05: Productivity Scoring Engine (Pure Math Unit Tests)", () => {
  it("1. Returns 100 for perfect execution across tasks, habits, and time blocks", () => {
    const res = calculateProductivityScore({
      plannedTasksCount: 5,
      completedTasksCount: 5,
      plannedHabitsCount: 3,
      completedHabitsCount: 3,
      plannedTimeBlocksCount: 4,
      completedTimeBlocksCount: 4,
    });

    expect(res.score).toBe(100);
    expect(res.taskCompletionRate).toBe(100);
    expect(res.habitCompletionRate).toBe(100);
    expect(res.timeBlockCompletionRate).toBe(100);
    expect(res.summary).toContain("Exceptional day");
  });

  it("2. Returns 0 when everything planned was missed", () => {
    const res = calculateProductivityScore({
      plannedTasksCount: 4,
      completedTasksCount: 0,
      plannedHabitsCount: 2,
      completedHabitsCount: 0,
      plannedTimeBlocksCount: 2,
      completedTimeBlocksCount: 0,
    });

    expect(res.score).toBe(0);
    expect(res.taskCompletionRate).toBe(0);
    expect(res.habitCompletionRate).toBe(0);
    expect(res.timeBlockCompletionRate).toBe(0);
  });

  it("3. Returns 0 with informative summary when nothing was planned", () => {
    const res = calculateProductivityScore({
      plannedTasksCount: 0,
      completedTasksCount: 0,
      plannedHabitsCount: 0,
      completedHabitsCount: 0,
    });

    expect(res.score).toBe(0);
    expect(res.summary).toContain("No planned items");
  });

  it("4. Redistributes weights proportionally when time blocks are not planned", () => {
    // 50% task weight, 30% habit weight normalized to 5/8 (62.5%) and 3/8 (37.5%)
    // 100% tasks completed, 0% habits completed -> score = 62.5% -> 63
    const res = calculateProductivityScore({
      plannedTasksCount: 4,
      completedTasksCount: 4,
      plannedHabitsCount: 2,
      completedHabitsCount: 0,
      plannedTimeBlocksCount: 0,
      completedTimeBlocksCount: 0,
    });

    expect(res.weightsUsed.timeBlocks).toBe(0);
    expect(res.weightsUsed.tasks + res.weightsUsed.habits).toBe(100);
    expect(res.score).toBe(63);
  });

  it("5. Redistributes weights proportionally when habits are not planned", () => {
    // Tasks: 50%, TimeBlocks: 20% -> normalized to 5/7 (71.4%) and 2/7 (28.6%)
    // 100% tasks, 100% time blocks -> 100
    const res = calculateProductivityScore({
      plannedTasksCount: 3,
      completedTasksCount: 3,
      plannedHabitsCount: 0,
      completedHabitsCount: 0,
      plannedTimeBlocksCount: 2,
      completedTimeBlocksCount: 2,
    });

    expect(res.weightsUsed.habits).toBe(0);
    expect(res.score).toBe(100);
  });

  it("6. Integrates subjective self-rating into composite score", () => {
    // Perfect task execution (100%), but user felt off and gave selfRating: 2 (20%)
    const res = calculateProductivityScore({
      plannedTasksCount: 4,
      completedTasksCount: 4,
      plannedHabitsCount: 0,
      completedHabitsCount: 0,
      plannedTimeBlocksCount: 0,
      completedTimeBlocksCount: 0,
      selfRating: 2, // 20%
    });

    // Nominal weights: Tasks 40, SelfRating 20 -> normalized: Tasks 67%, SelfRating 33%
    // 100 * 0.667 + 20 * 0.333 = 66.7 + 6.67 = 73
    expect(res.score).toBeLessThan(100);
    expect(res.score).toBeGreaterThan(65);
    expect(res.weightsUsed.selfRating).toBeGreaterThan(0);
  });

  it("7. Clamps negative or exceeding numbers gracefully", () => {
    const res = calculateProductivityScore({
      plannedTasksCount: -5,
      completedTasksCount: 10,
      plannedHabitsCount: 2,
      completedHabitsCount: 99, // exceeds planned, should cap at 100%
      selfRating: 15, // exceeds 10, should clamp to 10
    });

    expect(res.score).toBeLessThanOrEqual(100);
    expect(res.score).toBeGreaterThanOrEqual(0);
    expect(res.habitCompletionRate).toBe(100);
  });

  it("8. Half-completion across categories yields approximately 50%", () => {
    const res = calculateProductivityScore({
      plannedTasksCount: 4,
      completedTasksCount: 2,
      plannedHabitsCount: 2,
      completedHabitsCount: 1,
      plannedTimeBlocksCount: 2,
      completedTimeBlocksCount: 1,
    });

    expect(res.score).toBe(50);
  });
});
