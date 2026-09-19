import { describe, it, expect } from "vitest";
import {
  saveMorningPlanSchema,
  completeEveningReviewSchema,
  executeRolloverSchema,
  dailyPlanHistoryQuerySchema,
} from "@/server/daily-plan/validation";

describe("Phase 2 Plan 02-05: Daily Plan Validation Schemas (Unit Tests)", () => {
  describe("saveMorningPlanSchema", () => {
    it("accepts valid morning plan input", () => {
      const valid = {
        date: "2026-10-01",
        priorityTaskIds: ["task-1", "task-2", "task-3"],
        habitIntentionIds: ["habit-1"],
        morningNotes: "Focus on testing",
        complete: true,
      };
      const parsed = saveMorningPlanSchema.parse(valid);
      expect(parsed.date).toBe("2026-10-01");
      expect(parsed.priorityTaskIds).toHaveLength(3);
      expect(parsed.complete).toBe(true);
    });

    it("rejects invalid date format", () => {
      expect(() =>
        saveMorningPlanSchema.parse({
          date: "01-10-2026",
          priorityTaskIds: [],
        })
      ).toThrow();
    });

    it("rejects more than 10 priority tasks", () => {
      const tasks = Array.from({ length: 11 }, (_, i) => `task-${i}`);
      expect(() =>
        saveMorningPlanSchema.parse({
          date: "2026-10-01",
          priorityTaskIds: tasks,
        })
      ).toThrow();
    });

    it("defaults complete to false when omitted", () => {
      const parsed = saveMorningPlanSchema.parse({
        date: "2026-10-01",
      });
      expect(parsed.complete).toBe(false);
      expect(parsed.priorityTaskIds).toEqual([]);
    });
  });

  describe("completeEveningReviewSchema", () => {
    it("accepts valid evening review input", () => {
      const valid = {
        date: "2026-10-01",
        positiveReflections: "Completed all goals",
        challengesReflections: "Distracted in morning",
        notes: "Rest well",
        selfRating: 9,
      };
      const parsed = completeEveningReviewSchema.parse(valid);
      expect(parsed.selfRating).toBe(9);
    });

    it("rejects selfRating below 1 or above 10", () => {
      expect(() =>
        completeEveningReviewSchema.parse({
          date: "2026-10-01",
          selfRating: 0,
        })
      ).toThrow();

      expect(() =>
        completeEveningReviewSchema.parse({
          date: "2026-10-01",
          selfRating: 11,
        })
      ).toThrow();
    });
  });

  describe("executeRolloverSchema", () => {
    it("accepts valid rollover actions", () => {
      const valid = {
        date: "2026-10-01",
        actions: [
          { taskId: "task-1", action: "carry_over" as const },
          {
            taskId: "task-2",
            action: "reschedule" as const,
            targetDate: "2026-10-05",
          },
          { taskId: "task-3", action: "backlog" as const },
        ],
      };
      const parsed = executeRolloverSchema.parse(valid);
      expect(parsed.actions).toHaveLength(3);
    });

    it("rejects empty actions array", () => {
      expect(() =>
        executeRolloverSchema.parse({
          date: "2026-10-01",
          actions: [],
        })
      ).toThrow();
    });

    it("rejects unknown action type", () => {
      expect(() =>
        executeRolloverSchema.parse({
          date: "2026-10-01",
          actions: [{ taskId: "task-1", action: "delete_task" as any }],
        })
      ).toThrow();
    });
  });

  describe("dailyPlanHistoryQuerySchema", () => {
    it("defaults to 30 days when no params are provided", () => {
      const parsed = dailyPlanHistoryQuerySchema.parse({});
      expect(parsed.days).toBe(30);
    });

    it("coerces string numbers for days parameter", () => {
      const parsed = dailyPlanHistoryQuerySchema.parse({ days: "14" });
      expect(parsed.days).toBe(14);
    });

    it("rejects invalid date range format", () => {
      expect(() =>
        dailyPlanHistoryQuerySchema.parse({ startDate: "invalid-date" })
      ).toThrow();
    });
  });
});
