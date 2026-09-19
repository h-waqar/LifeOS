import { describe, it, expect } from "vitest";
import { calculateNextOccurrence } from "@/server/tasks/recurrence";

describe("Plan 02-01: Task Recurrence Engine (Unit)", () => {
  describe("Daily Recurrence", () => {
    it("adds 1 day for daily interval 1", () => {
      const base = new Date("2026-09-14T10:00:00.000Z");
      const next = calculateNextOccurrence(base, {
        frequency: "daily",
        interval: 1,
      });

      expect(next).not.toBeNull();
      expect(next!.toISOString()).toBe("2026-09-15T10:00:00.000Z");
    });

    it("adds N days for daily interval N", () => {
      const base = new Date("2026-09-14T10:00:00.000Z");
      const next = calculateNextOccurrence(base, {
        frequency: "daily",
        interval: 3,
      });

      expect(next).not.toBeNull();
      expect(next!.toISOString()).toBe("2026-09-17T10:00:00.000Z");
    });
  });

  describe("Weekly Recurrence", () => {
    it("adds 7 days for weekly interval 1 without specific days", () => {
      const base = new Date("2026-09-14T10:00:00.000Z"); // Monday
      const next = calculateNextOccurrence(base, {
        frequency: "weekly",
        interval: 1,
      });

      expect(next).not.toBeNull();
      expect(next!.toISOString()).toBe("2026-09-21T10:00:00.000Z");
    });

    it("advances to next scheduled day within same week (Mon -> Wed -> Fri)", () => {
      const monday = new Date("2026-09-14T10:00:00.000Z"); // day 1 (Monday)
      const rule = {
        frequency: "weekly" as const,
        interval: 1,
        daysOfWeek: [1, 3, 5], // Mon, Wed, Fri
      };

      const wednesday = calculateNextOccurrence(monday, rule);
      expect(wednesday).not.toBeNull();
      expect(wednesday!.getDay()).toBe(3); // Wednesday
      expect(wednesday!.toISOString()).toBe("2026-09-16T10:00:00.000Z");

      const friday = calculateNextOccurrence(wednesday!, rule);
      expect(friday).not.toBeNull();
      expect(friday!.getDay()).toBe(5); // Friday
      expect(friday!.toISOString()).toBe("2026-09-18T10:00:00.000Z");
    });

    it("wraps around to next week when on the last scheduled day of week", () => {
      const friday = new Date("2026-09-18T10:00:00.000Z"); // Friday (day 5)
      const rule = {
        frequency: "weekly" as const,
        interval: 1,
        daysOfWeek: [1, 3, 5], // Mon, Wed, Fri
      };

      const nextMonday = calculateNextOccurrence(friday, rule);
      expect(nextMonday).not.toBeNull();
      expect(nextMonday!.getDay()).toBe(1); // Monday
      expect(nextMonday!.toISOString()).toBe("2026-09-21T10:00:00.000Z");
    });

    it("jumps multiple weeks when interval > 1 with specific days", () => {
      const friday = new Date("2026-09-18T10:00:00.000Z"); // Friday
      const rule = {
        frequency: "weekly" as const,
        interval: 2, // Every 2 weeks
        daysOfWeek: [1, 5], // Mon, Fri
      };

      const nextOccurrence = calculateNextOccurrence(friday, rule);
      expect(nextOccurrence).not.toBeNull();
      expect(nextOccurrence!.getDay()).toBe(1); // Monday
      // 18th is Fri. End of week is Sun 20th (+2 days). + 1 week skip (+7 days). + Mon (+1 day) = 10 days = Sept 28
      expect(nextOccurrence!.toISOString()).toBe("2026-09-28T10:00:00.000Z");
    });
  });

  describe("Monthly Recurrence & Month-End Clamping", () => {
    it("advances 1 month preserving day of month", () => {
      const base = new Date("2026-04-15T12:00:00.000Z");
      const next = calculateNextOccurrence(base, {
        frequency: "monthly",
        interval: 1,
      });

      expect(next).not.toBeNull();
      expect(next!.toISOString()).toBe("2026-05-15T12:00:00.000Z");
    });

    it("clamps Jan 31 to Feb 28 in a non-leap year (2027)", () => {
      const jan31 = new Date("2027-01-31T12:00:00.000Z");
      const feb = calculateNextOccurrence(jan31, {
        frequency: "monthly",
        interval: 1,
      });

      expect(feb).not.toBeNull();
      expect(feb!.getUTCFullYear()).toBe(2027);
      expect(feb!.getUTCMonth()).toBe(1); // February (0-indexed)
      expect(feb!.getUTCDate()).toBe(28); // Clamped to 28
    });

    it("clamps Jan 31 to Feb 29 in a leap year (2028)", () => {
      const jan31 = new Date("2028-01-31T12:00:00.000Z");
      const feb = calculateNextOccurrence(jan31, {
        frequency: "monthly",
        interval: 1,
      });

      expect(feb).not.toBeNull();
      expect(feb!.getUTCFullYear()).toBe(2028);
      expect(feb!.getUTCMonth()).toBe(1); // February
      expect(feb!.getUTCDate()).toBe(29); // Clamped to 29
    });

    it("clamps Aug 31 to Sept 30", () => {
      const aug31 = new Date("2026-08-31T12:00:00.000Z");
      const sept = calculateNextOccurrence(aug31, {
        frequency: "monthly",
        interval: 1,
      });

      expect(sept).not.toBeNull();
      expect(sept!.getUTCMonth()).toBe(8); // September
      expect(sept!.getUTCDate()).toBe(30);
    });
  });

  describe("Recurrence Termination (count & endDate limits)", () => {
    it("returns null when currentCount reaches or exceeds rule.count", () => {
      const base = new Date("2026-09-14T10:00:00.000Z");
      const rule = {
        frequency: "daily" as const,
        interval: 1,
        count: 5,
      };

      expect(calculateNextOccurrence(base, rule, 4)).not.toBeNull();
      expect(calculateNextOccurrence(base, rule, 5)).toBeNull();
      expect(calculateNextOccurrence(base, rule, 6)).toBeNull();
    });

    it("returns null when next occurrence date exceeds rule.endDate", () => {
      const base = new Date("2026-09-14T10:00:00.000Z");
      const rule = {
        frequency: "daily" as const,
        interval: 1,
        endDate: "2026-09-16T00:00:00.000Z",
      };

      const sep15 = calculateNextOccurrence(base, rule);
      expect(sep15).not.toBeNull();

      // From Sept 15, next is Sept 16 10:00 which exceeds endDate Sept 16 00:00
      const sep16 = calculateNextOccurrence(sep15!, rule);
      expect(sep16).toBeNull();
    });

    it("returns null for invalid or empty inputs", () => {
      expect(calculateNextOccurrence("invalid-date", { frequency: "daily", interval: 1 })).toBeNull();
      expect(calculateNextOccurrence(new Date(), null as any)).toBeNull();
    });
  });
});
