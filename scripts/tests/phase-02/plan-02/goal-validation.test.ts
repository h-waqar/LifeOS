import { describe, it, expect } from "vitest";
import {
  createGoalSchema,
  updateGoalSchema,
} from "@/server/goals/service";
import {
  createMilestoneSchema,
  updateMilestoneSchema,
  createProjectSchema,
  updateProjectSchema,
} from "@/server/projects/service";

describe("Phase 2 Plan 02-02: Goal & Milestone Validation Schemas", () => {
  describe("1. Goal Schema Validation (createGoalSchema)", () => {
    it("accepts valid goal with defaults", () => {
      const parsed = createGoalSchema.parse({
        title: "Run a Marathon",
      });
      expect(parsed.title).toBe("Run a Marathon");
      expect(parsed.horizon).toBe("medium_term");
      expect(parsed.area).toBe("general");
      expect(parsed.status).toBe("in_progress");
      expect(parsed.priority).toBe("medium");
      expect(parsed.metricType).toBe("none");
      expect(parsed.currentValue).toBe(0);
    });

    it("accepts valid goal with all multi-horizon and metric fields", () => {
      const parsed = createGoalSchema.parse({
        title: "Reach $100k Net Worth",
        description: "Diversified investments and liquid cash",
        horizon: "long_term",
        area: "finance",
        status: "in_progress",
        priority: "critical",
        metricType: "currency",
        targetValue: 100000,
        currentValue: 45000,
        unit: "USD",
        startDate: "2026-01-01T00:00:00.000Z",
        targetDate: "2028-12-31T23:59:59.000Z",
        parentGoalId: "goal-parent-123",
      });
      expect(parsed.horizon).toBe("long_term");
      expect(parsed.area).toBe("finance");
      expect(parsed.metricType).toBe("currency");
      expect(parsed.targetValue).toBe(100000);
      expect(parsed.currentValue).toBe(45000);
    });

    it("rejects empty or whitespace title", () => {
      expect(() => createGoalSchema.parse({ title: "" })).toThrow();
      expect(() => createGoalSchema.parse({ title: "   " })).toThrow();
    });

    it("rejects title exceeding 255 characters", () => {
      expect(() =>
        createGoalSchema.parse({ title: "a".repeat(256) })
      ).toThrow();
    });

    it("rejects description exceeding 4000 characters", () => {
      expect(() =>
        createGoalSchema.parse({
          title: "Valid Title",
          description: "a".repeat(4001),
        })
      ).toThrow();
    });

    it("rejects invalid horizon enum", () => {
      expect(() =>
        createGoalSchema.parse({
          title: "Goal",
          horizon: "ultra_long_term" as any,
        })
      ).toThrow();
    });

    it("rejects invalid area enum", () => {
      expect(() =>
        createGoalSchema.parse({
          title: "Goal",
          area: "astrology" as any,
        })
      ).toThrow();
    });

    it("rejects invalid metricType enum", () => {
      expect(() =>
        createGoalSchema.parse({
          title: "Goal",
          metricType: "arbitrary_scale" as any,
        })
      ).toThrow();
    });

    it("rejects client-specified userId or id (mass assignment protection)", () => {
      expect(() =>
        createGoalSchema.parse({
          title: "Goal",
          userId: "hacked-user",
        } as any)
      ).toThrow();

      expect(() =>
        createGoalSchema.parse({
          title: "Goal",
          id: "custom-id",
        } as any)
      ).toThrow();
    });
  });

  describe("2. Goal Schema Validation (updateGoalSchema)", () => {
    it("accepts partial updates", () => {
      const parsed = updateGoalSchema.parse({
        currentValue: 50000,
        status: "completed",
      });
      expect(parsed.currentValue).toBe(50000);
      expect(parsed.status).toBe("completed");
    });

    it("rejects unrecognized properties (strict mode)", () => {
      expect(() =>
        updateGoalSchema.parse({
          title: "Updated",
          unknownField: "foo",
        } as any)
      ).toThrow();
    });
  });

  describe("3. Project Milestone Schema Validation", () => {
    it("accepts valid milestone creation input", () => {
      const parsed = createMilestoneSchema.parse({
        title: "Alpha Release",
        description: "First working build",
        targetDate: "2026-10-01T00:00:00.000Z",
        status: "pending",
        sortOrder: 1,
      });
      expect(parsed.title).toBe("Alpha Release");
      expect(parsed.status).toBe("pending");
      expect(parsed.sortOrder).toBe(1);
    });

    it("rejects empty milestone title", () => {
      expect(() =>
        createMilestoneSchema.parse({
          title: "   ",
        })
      ).toThrow();
    });

    it("rejects invalid milestone status", () => {
      expect(() =>
        createMilestoneSchema.parse({
          title: "Beta",
          status: "in_progress" as any,
        })
      ).toThrow();
    });

    it("accepts partial milestone updates", () => {
      const parsed = updateMilestoneSchema.parse({
        status: "completed",
        completedAt: "2026-10-01T12:00:00.000Z",
      });
      expect(parsed.status).toBe("completed");
      expect(parsed.completedAt).toBe("2026-10-01T12:00:00.000Z");
    });
  });

  describe("4. Extended Project Schema Validation", () => {
    it("accepts project with area, dates, and goal link", () => {
      const parsed = createProjectSchema.parse({
        name: "Website Redesign",
        area: "career",
        status: "active",
        priority: "high",
        startDate: "2026-09-01T00:00:00.000Z",
        deadline: "2026-12-01T00:00:00.000Z",
        goalId: "goal-123",
      });
      expect(parsed.area).toBe("career");
      expect(parsed.goalId).toBe("goal-123");
      expect(parsed.deadline).toBe("2026-12-01T00:00:00.000Z");
    });

    it("accepts partial project updates with new fields", () => {
      const parsed = updateProjectSchema.parse({
        area: "health",
        goalId: null,
      });
      expect(parsed.area).toBe("health");
      expect(parsed.goalId).toBeNull();
    });
  });
});
