import { describe, it, expect } from "vitest";
import {
  createTimeBlockSchema,
  updateTimeBlockSchema,
  completeTimeBlockSchema,
  timeBlocksQuerySchema,
  calendarFeedQuerySchema,
} from "@/server/calendar/validation";

describe("Plan 02-04: Calendar & Time Blocking Validation Schemas (Unit)", () => {
  describe("createTimeBlockSchema", () => {
    it("validates a well-formed create time block payload", () => {
      const input = {
        title: "Deep Work: Core Productivity Engine",
        description: "Focus session on calendar engine",
        startTime: "2026-10-01T09:00:00.000Z",
        endTime: "2026-10-01T11:00:00.000Z",
        durationMinutes: 120,
        commitmentLevel: "hard" as const,
        taskId: "task-123",
        projectId: "proj-123",
      };

      const result = createTimeBlockSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("Deep Work: Core Productivity Engine");
        expect(result.data.commitmentLevel).toBe("hard");
        expect(result.data.durationMinutes).toBe(120);
      }
    });

    it("defaults commitmentLevel to soft when omitted", () => {
      const input = {
        title: "Gym Workout",
        startTime: "2026-10-01T07:00:00.000Z",
        endTime: "2026-10-01T08:00:00.000Z",
      };

      const result = createTimeBlockSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.commitmentLevel).toBe("soft");
      }
    });

    it("rejects empty or whitespace-only title", () => {
      const invalidTitles = ["", "   ", "\t\n"];
      for (const title of invalidTitles) {
        const result = createTimeBlockSchema.safeParse({
          title,
          startTime: "2026-10-01T09:00:00.000Z",
          endTime: "2026-10-01T10:00:00.000Z",
        });
        expect(result.success).toBe(false);
      }
    });

    it("rejects title exceeding 255 characters", () => {
      const longTitle = "x".repeat(256);
      const result = createTimeBlockSchema.safeParse({
        title: longTitle,
        startTime: "2026-10-01T09:00:00.000Z",
        endTime: "2026-10-01T10:00:00.000Z",
      });
      expect(result.success).toBe(false);
    });

    it("rejects description exceeding 4000 characters", () => {
      const longDesc = "d".repeat(4001);
      const result = createTimeBlockSchema.safeParse({
        title: "Valid Title",
        description: longDesc,
        startTime: "2026-10-01T09:00:00.000Z",
        endTime: "2026-10-01T10:00:00.000Z",
      });
      expect(result.success).toBe(false);
    });

    it("rejects endTime occurring before or at startTime", () => {
      const resultBefore = createTimeBlockSchema.safeParse({
        title: "Inverted Times",
        startTime: "2026-10-01T11:00:00.000Z",
        endTime: "2026-10-01T10:00:00.000Z",
      });
      expect(resultBefore.success).toBe(false);

      const resultEqual = createTimeBlockSchema.safeParse({
        title: "Zero Duration",
        startTime: "2026-10-01T10:00:00.000Z",
        endTime: "2026-10-01T10:00:00.000Z",
      });
      expect(resultEqual.success).toBe(false);
    });

    it("rejects block duration exceeding 24 hours (1440 minutes)", () => {
      const result = createTimeBlockSchema.safeParse({
        title: "Multi-day block",
        startTime: "2026-10-01T00:00:00.000Z",
        endTime: "2026-10-02T01:00:00.000Z", // 25 hours
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid date strings", () => {
      const result = createTimeBlockSchema.safeParse({
        title: "Bad Date",
        startTime: "not-a-valid-date",
        endTime: "2026-10-01T10:00:00.000Z",
      });
      expect(result.success).toBe(false);
    });

    it("rejects client-supplied userId or id (strict schema)", () => {
      const resultUserId = createTimeBlockSchema.safeParse({
        title: "Forged User",
        startTime: "2026-10-01T09:00:00.000Z",
        endTime: "2026-10-01T10:00:00.000Z",
        userId: "attacker_id",
      });
      expect(resultUserId.success).toBe(false);

      const resultId = createTimeBlockSchema.safeParse({
        title: "Forged Id",
        startTime: "2026-10-01T09:00:00.000Z",
        endTime: "2026-10-01T10:00:00.000Z",
        id: "custom_id",
      });
      expect(resultId.success).toBe(false);
    });
  });

  describe("updateTimeBlockSchema", () => {
    it("validates partial updates", () => {
      const result = updateTimeBlockSchema.safeParse({
        title: "Updated Title",
        commitmentLevel: "hard",
      });
      expect(result.success).toBe(true);
    });

    it("validates start and end time changes if end > start", () => {
      const result = updateTimeBlockSchema.safeParse({
        startTime: "2026-10-01T14:00:00.000Z",
        endTime: "2026-10-01T16:00:00.000Z",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid time ordering in updates", () => {
      const result = updateTimeBlockSchema.safeParse({
        startTime: "2026-10-01T16:00:00.000Z",
        endTime: "2026-10-01T14:00:00.000Z",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("completeTimeBlockSchema", () => {
    it("validates completion with actual minutes", () => {
      const result = completeTimeBlockSchema.safeParse({
        actualMinutes: 45,
        completeLinkedTask: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.actualMinutes).toBe(45);
        expect(result.data.completeLinkedTask).toBe(true);
      }
    });

    it("rejects negative actual minutes", () => {
      const result = completeTimeBlockSchema.safeParse({
        actualMinutes: -10,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("calendarFeedQuerySchema", () => {
    it("validates feed query with valid dates and view", () => {
      const result = calendarFeedQuerySchema.safeParse({
        startDate: "2026-10-01",
        endDate: "2026-10-07",
        view: "week",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing startDate or endDate", () => {
      const result = calendarFeedQuerySchema.safeParse({
        startDate: "2026-10-01",
      });
      expect(result.success).toBe(false);
    });
  });
});
