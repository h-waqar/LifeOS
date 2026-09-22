import { describe, it, expect } from "vitest";
import {
  calculateFollowUpStatus,
  isFollowUpDueWithinDays,
  categorizeFollowUpReminders,
  formatFollowUpLabel,
} from "@/server/people/follow-up";
import type { PersonDTO } from "@/types";

describe("Phase 3 Plan 03-02: Follow-up Engine Unit Suite", () => {
  // Use local date constructor so setHours(0,0,0,0) matches relative comparisons cleanly
  const fixedNow = new Date(2026, 8, 22, 12, 0, 0); // Sept 22, 2026 12:00:00 local

  describe("calculateFollowUpStatus", () => {
    it("returns 'none' for null, undefined, or invalid dates", () => {
      expect(calculateFollowUpStatus(null, fixedNow)).toBe("none");
      expect(calculateFollowUpStatus(undefined, fixedNow)).toBe("none");
      expect(calculateFollowUpStatus("invalid-date-string", fixedNow)).toBe("none");
    });

    it("returns 'overdue' for dates in the past (before start of today)", () => {
      const yesterday = new Date(2026, 8, 21, 12, 0, 0);
      const lastWeek = new Date(2026, 8, 15, 12, 0, 0);

      expect(calculateFollowUpStatus(yesterday, fixedNow)).toBe("overdue");
      expect(calculateFollowUpStatus(lastWeek, fixedNow)).toBe("overdue");
    });

    it("returns 'today' for dates occurring within today", () => {
      const earlierToday = new Date(2026, 8, 22, 1, 0, 0);
      const laterToday = new Date(2026, 8, 22, 23, 0, 0);

      expect(calculateFollowUpStatus(earlierToday, fixedNow)).toBe("today");
      expect(calculateFollowUpStatus(laterToday, fixedNow)).toBe("today");
    });

    it("returns 'upcoming' for dates after today", () => {
      const tomorrow = new Date(2026, 8, 23, 9, 0, 0);
      const nextMonth = new Date(2026, 9, 22, 12, 0, 0);

      expect(calculateFollowUpStatus(tomorrow, fixedNow)).toBe("upcoming");
      expect(calculateFollowUpStatus(nextMonth, fixedNow)).toBe("upcoming");
    });
  });

  describe("isFollowUpDueWithinDays", () => {
    it("returns false for null or invalid dates", () => {
      expect(isFollowUpDueWithinDays(null, 7, fixedNow)).toBe(false);
      expect(isFollowUpDueWithinDays("invalid", 7, fixedNow)).toBe(false);
    });

    it("returns true for overdue dates and dates within the window", () => {
      const past = new Date(2026, 8, 20, 10, 0, 0);
      const today = new Date(2026, 8, 22, 14, 0, 0);
      const in5Days = new Date(2026, 8, 27, 10, 0, 0);

      expect(isFollowUpDueWithinDays(past, 7, fixedNow)).toBe(true);
      expect(isFollowUpDueWithinDays(today, 7, fixedNow)).toBe(true);
      expect(isFollowUpDueWithinDays(in5Days, 7, fixedNow)).toBe(true);
    });

    it("returns false for dates beyond the window", () => {
      const in10Days = new Date(2026, 9, 2, 10, 0, 0); // Oct 2
      expect(isFollowUpDueWithinDays(in10Days, 7, fixedNow)).toBe(false);
    });
  });

  describe("categorizeFollowUpReminders", () => {
    const mockPerson = (
      id: string,
      name: string,
      nextFollowUpDate: string | null,
      isArchived: boolean = false
    ): PersonDTO => ({
      id,
      userId: "user_1",
      name,
      relationshipType: "client",
      company: null,
      role: null,
      email: null,
      phone: null,
      contactInfo: {},
      tags: [],
      notes: null,
      lastInteractionDate: null,
      nextFollowUpDate,
      followUpStatus: "none",
      isArchived,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    it("correctly partitions people into overdue, today, and upcoming buckets", () => {
      const people: PersonDTO[] = [
        mockPerson("1", "Overdue Person", new Date(2026, 8, 20, 10, 0, 0).toISOString()),
        mockPerson("2", "Today Person", new Date(2026, 8, 22, 15, 0, 0).toISOString()),
        mockPerson("3", "Upcoming Person", new Date(2026, 8, 25, 10, 0, 0).toISOString()),
        mockPerson("4", "Far Future Person", new Date(2026, 10, 20, 10, 0, 0).toISOString()), // > 14 days
        mockPerson("5", "No Follow-up Person", null),
        mockPerson("6", "Archived Person", new Date(2026, 8, 20, 10, 0, 0).toISOString(), true), // archived
      ];

      const result = categorizeFollowUpReminders(people, fixedNow);

      expect(result.overdue).toHaveLength(1);
      expect(result.overdue[0].id).toBe("1");

      expect(result.today).toHaveLength(1);
      expect(result.today[0].id).toBe("2");

      expect(result.upcoming).toHaveLength(1);
      expect(result.upcoming[0].id).toBe("3");

      expect(result.totalReminders).toBe(3);
    });

    it("sorts overdue items with oldest (most overdue) first", () => {
      const people: PersonDTO[] = [
        mockPerson("b", "Recent Overdue", new Date(2026, 8, 21, 10, 0, 0).toISOString()),
        mockPerson("a", "Ancient Overdue", new Date(2026, 8, 10, 10, 0, 0).toISOString()),
      ];

      const result = categorizeFollowUpReminders(people, fixedNow);
      expect(result.overdue[0].id).toBe("a");
      expect(result.overdue[1].id).toBe("b");
    });
  });

  describe("formatFollowUpLabel", () => {
    it("returns 'No follow-up' when date is missing or invalid", () => {
      expect(formatFollowUpLabel(null, fixedNow)).toBe("No follow-up");
      expect(formatFollowUpLabel("not-a-date", fixedNow)).toBe("No follow-up");
    });

    it("formats overdue dates with exact day count", () => {
      const yesterday = new Date(2026, 8, 21, 10, 0, 0);
      const fourDaysAgo = new Date(2026, 8, 18, 10, 0, 0);

      expect(formatFollowUpLabel(yesterday, fixedNow)).toBe("Overdue by 1 day");
      expect(formatFollowUpLabel(fourDaysAgo, fixedNow)).toBe("Overdue by 4 days");
    });

    it("formats today and tomorrow dates", () => {
      const today = new Date(2026, 8, 22, 19, 0, 0);
      const tomorrow = new Date(2026, 8, 23, 10, 0, 0);

      expect(formatFollowUpLabel(today, fixedNow)).toBe("Due today");
      expect(formatFollowUpLabel(tomorrow, fixedNow)).toBe("Due tomorrow");
    });

    it("formats future dates with 'In X days'", () => {
      const fiveDaysOut = new Date(2026, 8, 27, 10, 0, 0);
      expect(formatFollowUpLabel(fiveDaysOut, fixedNow)).toBe("In 5 days");
    });
  });
});
