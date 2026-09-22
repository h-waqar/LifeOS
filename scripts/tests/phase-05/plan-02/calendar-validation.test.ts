import { describe, it, expect } from "vitest";
import {
  calendarQuerySchema,
  scheduleContentSchema,
  markPublishedSchema,
  logMetricsSchema,
  reschedulePublicationSchema,
} from "@/server/content/validation";

describe("Phase 5 Plan 05-02: Calendar & Metrics Zod Validation Schemas Unit Tests", () => {
  describe("1. calendarQuerySchema", () => {
    it("accepts valid ISO date strings where startDate <= endDate", () => {
      const valid = calendarQuerySchema.parse({
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        platform: "twitter",
      });
      expect(valid.startDate).toBe("2026-09-01");
      expect(valid.endDate).toBe("2026-09-30");
      expect(valid.platform).toBe("twitter");
    });

    it("rejects non YYYY-MM-DD date formats", () => {
      expect(() =>
        calendarQuerySchema.parse({
          startDate: "01-09-2026",
          endDate: "2026-09-30",
        })
      ).toThrow();

      expect(() =>
        calendarQuerySchema.parse({
          startDate: "2026/09/01",
          endDate: "2026/09/30",
        })
      ).toThrow();
    });

    it("rejects when startDate is after endDate", () => {
      expect(() =>
        calendarQuerySchema.parse({
          startDate: "2026-10-01",
          endDate: "2026-09-01",
        })
      ).toThrow("Start date must be on or before end date");
    });

    it("rejects invalid platform enum in calendar query", () => {
      expect(() =>
        calendarQuerySchema.parse({
          startDate: "2026-09-01",
          endDate: "2026-09-30",
          platform: "tiktok",
        })
      ).toThrow();
    });
  });

  describe("2. scheduleContentSchema", () => {
    it("accepts valid scheduledFor datetime and platform", () => {
      const valid = scheduleContentSchema.parse({
        platform: "linkedin",
        scheduledFor: "2026-09-25T14:30:00Z",
      });
      expect(valid.platform).toBe("linkedin");
      expect(valid.scheduledFor).toBe("2026-09-25T14:30:00Z");
    });

    it("rejects invalid platform", () => {
      expect(() =>
        scheduleContentSchema.parse({
          platform: "snapchat",
          scheduledFor: "2026-09-25T14:30:00Z",
        })
      ).toThrow();
    });

    it("rejects invalid datetime format", () => {
      expect(() =>
        scheduleContentSchema.parse({
          platform: "blog",
          scheduledFor: "next tuesday at 5pm",
        })
      ).toThrow();
    });
  });

  describe("3. reschedulePublicationSchema", () => {
    it("accepts valid ISO datetime", () => {
      const valid = reschedulePublicationSchema.parse({
        scheduledFor: "2026-10-01T09:00:00.000Z",
      });
      expect(valid.scheduledFor).toBe("2026-10-01T09:00:00.000Z");
    });

    it("rejects non-ISO datetime string", () => {
      expect(() =>
        reschedulePublicationSchema.parse({
          scheduledFor: "tomorrow",
        })
      ).toThrow();
    });
  });

  describe("4. markPublishedSchema", () => {
    it("accepts valid postUrl, externalPostId, and notes", () => {
      const valid = markPublishedSchema.parse({
        postUrl: "https://x.com/username/status/123456789",
        externalPostId: "123456789",
        publishedAt: "2026-09-22T10:00:00Z",
        notes: "Published on schedule.",
      });
      expect(valid.postUrl).toBe("https://x.com/username/status/123456789");
      expect(valid.externalPostId).toBe("123456789");
    });

    it("accepts empty string or null for postUrl", () => {
      const valid = markPublishedSchema.parse({
        postUrl: "",
        notes: "No live URL",
      });
      expect(valid.postUrl).toBe("");
    });

    it("rejects invalid URL string", () => {
      expect(() =>
        markPublishedSchema.parse({
          postUrl: "not-a-url",
        })
      ).toThrow("Invalid post URL");
    });
  });

  describe("5. logMetricsSchema", () => {
    it("accepts valid non-negative metrics and defaults omitted values to 0", () => {
      const valid = logMetricsSchema.parse({
        views: 1200,
        likes: 45,
      });
      expect(valid.views).toBe(1200);
      expect(valid.likes).toBe(45);
      expect(valid.comments).toBe(0);
      expect(valid.shares).toBe(0);
      expect(valid.saves).toBe(0);
      expect(valid.clicks).toBe(0);
    });

    it("rejects negative metrics values", () => {
      expect(() =>
        logMetricsSchema.parse({
          views: -10,
        })
      ).toThrow("Views cannot be negative");

      expect(() =>
        logMetricsSchema.parse({
          likes: -1,
        })
      ).toThrow("Likes cannot be negative");

      expect(() =>
        logMetricsSchema.parse({
          clicks: -5,
        })
      ).toThrow("Clicks cannot be negative");
    });
  });
});
