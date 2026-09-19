import { describe, it, expect } from "vitest";
import {
  createHabitSchema,
  updateHabitSchema,
  logHabitEntrySchema,
} from "@/server/habits/validation";

describe("Phase 2 Plan 02-03: Habit & Habit Entry Validation Schemas", () => {
  describe("1. Habit Creation Schema Validation (createHabitSchema)", () => {
    it("accepts valid habit with default parameters", () => {
      const parsed = createHabitSchema.parse({
        title: "Morning Meditation",
      });
      expect(parsed.title).toBe("Morning Meditation");
      expect(parsed.frequency).toBe("daily");
      expect(parsed.frequencyTarget).toBe(1);
      expect(parsed.intervalDays).toBe(1);
      expect(parsed.targetValue).toBe(1);
      expect(parsed.timeOfDay).toBe("anytime");
      expect(parsed.status).toBe("active");
    });

    it("accepts valid habit with full multi-frequency and identity linkage fields", () => {
      const parsed = createHabitSchema.parse({
        title: "Long Run",
        description: "Outdoor trail or road running",
        frequency: "specific_days",
        frequencyTarget: 3,
        frequencyDays: [1, 3, 5],
        intervalDays: 1,
        targetValue: 10,
        unit: "km",
        timeOfDay: "morning",
        reminderTime: "06:30",
        goalId: "goal-marathon-123",
        identityStatement: "I am an endurance athlete who never skips training.",
        status: "active",
      });
      expect(parsed.title).toBe("Long Run");
      expect(parsed.frequency).toBe("specific_days");
      expect(parsed.frequencyDays).toEqual([1, 3, 5]);
      expect(parsed.targetValue).toBe(10);
      expect(parsed.unit).toBe("km");
      expect(parsed.reminderTime).toBe("06:30");
      expect(parsed.goalId).toBe("goal-marathon-123");
      expect(parsed.identityStatement).toBe(
        "I am an endurance athlete who never skips training."
      );
    });

    it("rejects empty or whitespace title", () => {
      expect(() => createHabitSchema.parse({ title: "" })).toThrow();
      expect(() => createHabitSchema.parse({ title: "   " })).toThrow();
    });

    it("rejects title exceeding 255 characters", () => {
      expect(() =>
        createHabitSchema.parse({ title: "a".repeat(256) })
      ).toThrow();
    });

    it("rejects description exceeding 4000 characters", () => {
      expect(() =>
        createHabitSchema.parse({
          title: "Meditate",
          description: "a".repeat(4001),
        })
      ).toThrow();
    });

    it("rejects identity statement exceeding 500 characters", () => {
      expect(() =>
        createHabitSchema.parse({
          title: "Meditate",
          identityStatement: "a".repeat(501),
        })
      ).toThrow();
    });

    it("rejects invalid frequency enum", () => {
      expect(() =>
        createHabitSchema.parse({
          title: "Meditate",
          frequency: "biweekly" as any,
        })
      ).toThrow();
    });

    it("rejects invalid timeOfDay enum", () => {
      expect(() =>
        createHabitSchema.parse({
          title: "Meditate",
          timeOfDay: "midnight" as any,
        })
      ).toThrow();
    });

    it("rejects non-positive targetValue (<= 0)", () => {
      expect(() =>
        createHabitSchema.parse({
          title: "Read",
          targetValue: 0,
        })
      ).toThrow();

      expect(() =>
        createHabitSchema.parse({
          title: "Read",
          targetValue: -5,
        })
      ).toThrow();
    });

    it("rejects invalid reminderTime format", () => {
      expect(() =>
        createHabitSchema.parse({
          title: "Read",
          reminderTime: "25:00",
        })
      ).toThrow();

      expect(() =>
        createHabitSchema.parse({
          title: "Read",
          reminderTime: "9am",
        })
      ).toThrow();
    });

    it("rejects client-specified userId or id (mass assignment protection)", () => {
      expect(() =>
        createHabitSchema.parse({
          title: "Habit",
          userId: "hacked-user",
        } as any)
      ).toThrow();

      expect(() =>
        createHabitSchema.parse({
          title: "Habit",
          id: "custom-id",
        } as any)
      ).toThrow();
    });
  });

  describe("2. Habit Update Schema Validation (updateHabitSchema)", () => {
    it("accepts partial updates", () => {
      const parsed = updateHabitSchema.parse({
        targetValue: 30,
        unit: "minutes",
        status: "paused",
      });
      expect(parsed.targetValue).toBe(30);
      expect(parsed.unit).toBe("minutes");
      expect(parsed.status).toBe("paused");
    });

    it("rejects unrecognized properties (strict mode)", () => {
      expect(() =>
        updateHabitSchema.parse({
          title: "Updated",
          unknownField: "malicious_input",
        } as any)
      ).toThrow();
    });

    it("rejects client-specified userId or id on update", () => {
      expect(() =>
        updateHabitSchema.parse({
          userId: "other-user",
        } as any)
      ).toThrow();
    });
  });

  describe("3. Habit Entry Logging Schema Validation (logHabitEntrySchema)", () => {
    it("accepts valid check-in entry", () => {
      const parsed = logHabitEntrySchema.parse({
        date: "2026-09-15",
        value: 1,
        notes: "Completed after morning coffee",
      });
      expect(parsed.date).toBe("2026-09-15");
      expect(parsed.value).toBe(1);
      expect(parsed.notes).toBe("Completed after morning coffee");
    });

    it("rejects invalid date format", () => {
      expect(() =>
        logHabitEntrySchema.parse({
          date: "15-09-2026",
        })
      ).toThrow();

      expect(() =>
        logHabitEntrySchema.parse({
          date: "2026/09/15",
        })
      ).toThrow();
    });

    it("rejects negative value", () => {
      expect(() =>
        logHabitEntrySchema.parse({
          date: "2026-09-15",
          value: -1,
        })
      ).toThrow();
    });

    it("rejects notes exceeding 1000 characters", () => {
      expect(() =>
        logHabitEntrySchema.parse({
          date: "2026-09-15",
          notes: "a".repeat(1001),
        })
      ).toThrow();
    });

    it("rejects client-supplied userId, id, or habitId", () => {
      expect(() =>
        logHabitEntrySchema.parse({
          date: "2026-09-15",
          userId: "hacked-user",
        } as any)
      ).toThrow();

      expect(() =>
        logHabitEntrySchema.parse({
          date: "2026-09-15",
          habitId: "hacked-habit",
        } as any)
      ).toThrow();
    });
  });
});
