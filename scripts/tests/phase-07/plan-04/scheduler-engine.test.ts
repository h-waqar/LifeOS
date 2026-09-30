// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isValidCron,
  matchesCron,
  matchesCronField,
  getNextCronOccurrence,
  getDatePartsInTimezone,
  isScheduleDue,
  generateDailyIdempotencyKey,
  generateHourlyIdempotencyKey,
  generateEntityIdempotencyKey,
  generateScheduledAutomationKey,
} from "@/server/scheduler/cron";
import { SchedulerEngine } from "@/server/scheduler/engine";
import {
  startSchedulerWorker,
  stopSchedulerWorker,
  isSchedulerWorkerRunning,
  triggerTick,
} from "@/server/scheduler/worker";
import {
  scheduleConfigSchema,
  type PeriodicSweeper,
  type SchedulerJobResult,
} from "@/server/scheduler/types";

describe("Plan 07-04: Background Scheduler & Cron Engine (Unit Tests)", () => {
  describe("1. Idempotency Key Generation", () => {
    it("generates correct daily idempotency keys", () => {
      const key = generateDailyIdempotencyKey("morning_plan", "user_123", "2026-09-24");
      expect(key).toBe("morning_plan:user_123:2026-09-24");
    });

    it("generates correct hourly idempotency keys", () => {
      const key = generateHourlyIdempotencyKey("hourly_sync", "user_123", "2026-09-24", "08");
      expect(key).toBe("hourly_sync:user_123:2026-09-24:08");
    });

    it("generates correct entity-specific idempotency keys", () => {
      const key = generateEntityIdempotencyKey("overdue_tasks", "user_123", "task_abc", "2026-09-24");
      expect(key).toBe("overdue_tasks:user_123:task_abc:2026-09-24");
    });

    it("generates correct scheduled automation idempotency keys", () => {
      const key = generateScheduledAutomationKey("user_123", "rule_xyz", "2026-09-24T08:00");
      expect(key).toBe("scheduled_automation:user_123:rule_xyz:2026-09-24T08:00");
    });
  });

  describe("2. Cron Field Pattern Matching & Validation", () => {
    it("matches asterisk (*) for any numeric value in range", () => {
      expect(matchesCronField("*", 0, 0, 59)).toBe(true);
      expect(matchesCronField("*", 30, 0, 59)).toBe(true);
      expect(matchesCronField("*", 59, 0, 59)).toBe(true);
    });

    it("matches exact numbers", () => {
      expect(matchesCronField("15", 15, 0, 59)).toBe(true);
      expect(matchesCronField("15", 14, 0, 59)).toBe(false);
    });

    it("matches comma-separated lists", () => {
      expect(matchesCronField("0,15,30,45", 15, 0, 59)).toBe(true);
      expect(matchesCronField("0,15,30,45", 30, 0, 59)).toBe(true);
      expect(matchesCronField("0,15,30,45", 20, 0, 59)).toBe(false);
    });

    it("matches ranges (start-end)", () => {
      expect(matchesCronField("1-5", 3, 0, 7)).toBe(true);
      expect(matchesCronField("1-5", 1, 0, 7)).toBe(true);
      expect(matchesCronField("1-5", 5, 0, 7)).toBe(true);
      expect(matchesCronField("1-5", 6, 0, 7)).toBe(false);
    });

    it("matches step expressions (*/step and start-end/step)", () => {
      expect(matchesCronField("*/15", 0, 0, 59)).toBe(true);
      expect(matchesCronField("*/15", 15, 0, 59)).toBe(true);
      expect(matchesCronField("*/15", 45, 0, 59)).toBe(true);
      expect(matchesCronField("*/15", 10, 0, 59)).toBe(false);

      expect(matchesCronField("10-30/10", 10, 0, 59)).toBe(true);
      expect(matchesCronField("10-30/10", 20, 0, 59)).toBe(true);
      expect(matchesCronField("10-30/10", 30, 0, 59)).toBe(true);
      expect(matchesCronField("10-30/10", 40, 0, 59)).toBe(false);
    });

    it("normalizes day of week where both 0 and 7 represent Sunday", () => {
      expect(matchesCronField("0", 0, 0, 7, true)).toBe(true);
      expect(matchesCronField("7", 0, 0, 7, true)).toBe(true);
      expect(matchesCronField("0", 7, 0, 7, true)).toBe(true);
      expect(matchesCronField("7", 7, 0, 7, true)).toBe(true);
      expect(matchesCronField("1", 0, 0, 7, true)).toBe(false);
    });

    it("validates valid 5-part cron expressions", () => {
      expect(isValidCron("* * * * *")).toBe(true);
      expect(isValidCron("0 8 * * *")).toBe(true);
      expect(isValidCron("*/15 9-17 * * 1-5")).toBe(true);
      expect(isValidCron("30 23 1,15 * 0")).toBe(true);
    });

    it("rejects invalid cron expressions", () => {
      expect(isValidCron("")).toBe(false);
      expect(isValidCron("* * * *")).toBe(false); // 4 fields
      expect(isValidCron("* * * * * *")).toBe(false); // 6 fields
      expect(isValidCron("60 * * * *")).toBe(false); // minute out of range
      expect(isValidCron("* 25 * * *")).toBe(false); // hour out of range
      expect(isValidCron("* * 32 * *")).toBe(false); // dom out of range
      expect(isValidCron("* * * 13 *")).toBe(false); // month out of range
      expect(isValidCron("foo bar baz qux quux")).toBe(false); // non-numeric
    });
  });

  describe("3. Timezone Date Extraction & Conversions", () => {
    it("extracts date parts accurately in UTC", () => {
      const date = new Date("2026-09-24T08:30:00.000Z");
      const parts = getDatePartsInTimezone(date, "UTC");

      expect(parts.year).toBe(2026);
      expect(parts.month).toBe(9);
      expect(parts.day).toBe(24);
      expect(parts.hour).toBe(8);
      expect(parts.minute).toBe(30);
      expect(parts.dateStr).toBe("2026-09-24");
      expect(parts.timeStr).toBe("08:30");
      expect(parts.dayOfWeek).toBe(4); // Thursday
    });

    it("extracts date parts accurately across non-UTC timezones", () => {
      // 08:30 UTC is 04:30 EDT in New York (UTC-4)
      const date = new Date("2026-09-24T08:30:00.000Z");
      const nyParts = getDatePartsInTimezone(date, "America/New_York");

      expect(nyParts.hour).toBe(4);
      expect(nyParts.minute).toBe(30);
      expect(nyParts.dateStr).toBe("2026-09-24");

      // 08:30 UTC is 17:30 JST in Tokyo (UTC+9)
      const tokyoParts = getDatePartsInTimezone(date, "Asia/Tokyo");
      expect(tokyoParts.hour).toBe(17);
      expect(tokyoParts.minute).toBe(30);
      expect(tokyoParts.dateStr).toBe("2026-09-24");
    });

    it("handles day boundary transitions across timezones", () => {
      // 2026-09-24T02:00:00Z in New York (EDT, UTC-4) is 2026-09-23T22:00:00
      const date = new Date("2026-09-24T02:00:00.000Z");
      const nyParts = getDatePartsInTimezone(date, "America/New_York");

      expect(nyParts.dateStr).toBe("2026-09-23");
      expect(nyParts.hour).toBe(22);
      expect(nyParts.dayOfWeek).toBe(3); // Wednesday
    });

    it("falls back gracefully to UTC on invalid timezone string", () => {
      const date = new Date("2026-09-24T12:00:00.000Z");
      const parts = getDatePartsInTimezone(date, "Invalid/Timezone_123");

      expect(parts.hour).toBe(12);
      expect(parts.dateStr).toBe("2026-09-24");
    });
  });

  describe("4. Cron Matching & Next Occurrence", () => {
    it("matches exact cron pattern in target timezone", () => {
      // 08:00 AM UTC
      const date = new Date("2026-09-24T08:00:00.000Z");
      expect(matchesCron("0 8 * * *", date, "UTC")).toBe(true);
      expect(matchesCron("1 8 * * *", date, "UTC")).toBe(false);
      expect(matchesCron("0 9 * * *", date, "UTC")).toBe(false);

      // In New York (EDT, UTC-4), 08:00 UTC is 04:00 NY time
      expect(matchesCron("0 4 * * *", date, "America/New_York")).toBe(true);
      expect(matchesCron("0 8 * * *", date, "America/New_York")).toBe(false);
    });

    it("calculates next occurrence for cron expression", () => {
      const baseDate = new Date("2026-09-24T07:45:00.000Z");
      const nextRun = getNextCronOccurrence("0 8 * * *", baseDate, "UTC");

      expect(nextRun).not.toBeNull();
      expect(nextRun!.toISOString()).toBe("2026-09-24T08:00:00.000Z");
    });

    it("calculates next occurrence spanning into the next day", () => {
      const baseDate = new Date("2026-09-24T09:00:00.000Z");
      const nextRun = getNextCronOccurrence("0 8 * * *", baseDate, "UTC");

      expect(nextRun).not.toBeNull();
      expect(nextRun!.toISOString()).toBe("2026-09-25T08:00:00.000Z");
    });
  });

  describe("5. Schedule Due Evaluation (isScheduleDue)", () => {
    describe("One-time schedules (type: 'once')", () => {
      it("returns due: true when referenceDate >= runAt and not yet executed", () => {
        const runAt = "2026-09-24T10:00:00.000Z";
        const result = isScheduleDue(
          { type: "once", runAt },
          null,
          new Date("2026-09-24T10:05:00.000Z")
        );
        expect(result.due).toBe(true);
        expect(result.slotKey).toBe("once");
      });

      it("returns due: false when scheduled time is in the future", () => {
        const runAt = "2026-09-24T12:00:00.000Z";
        const result = isScheduleDue(
          { type: "once", runAt },
          null,
          new Date("2026-09-24T10:00:00.000Z")
        );
        expect(result.due).toBe(false);
        expect(result.reason).toContain("future");
      });

      it("returns due: false if already executed once (lastRunAt !== null)", () => {
        const runAt = "2026-09-24T10:00:00.000Z";
        const result = isScheduleDue(
          { type: "once", runAt },
          new Date("2026-09-24T10:00:05.000Z"),
          new Date("2026-09-24T10:30:00.000Z")
        );
        expect(result.due).toBe(false);
        expect(result.reason).toContain("already executed");
      });
    });

    describe("Daily schedules (time: 'HH:mm')", () => {
      it("returns due: false when current local time is before scheduled time", () => {
        const result = isScheduleDue(
          { type: "daily", time: "08:00" },
          null,
          new Date("2026-09-24T07:45:00.000Z"),
          "UTC"
        );
        expect(result.due).toBe(false);
        expect(result.reason).toContain("not reached yet");
      });

      it("returns due: true when current local time is at or after scheduled time and not run today", () => {
        const result = isScheduleDue(
          { type: "daily", time: "08:00" },
          null,
          new Date("2026-09-24T08:15:00.000Z"),
          "UTC"
        );
        expect(result.due).toBe(true);
        expect(result.slotKey).toBe("2026-09-24");
      });

      it("returns due: false if already executed today", () => {
        const lastRun = new Date("2026-09-24T08:01:00.000Z");
        const result = isScheduleDue(
          { type: "daily", time: "08:00" },
          lastRun,
          new Date("2026-09-24T08:30:00.000Z"),
          "UTC"
        );
        expect(result.due).toBe(false);
        expect(result.reason).toContain("already executed today");
      });

      it("returns due: true on the next calendar day even if run yesterday", () => {
        const lastRunYesterday = new Date("2026-09-23T08:01:00.000Z");
        const result = isScheduleDue(
          { type: "daily", time: "08:00" },
          lastRunYesterday,
          new Date("2026-09-24T08:30:00.000Z"),
          "UTC"
        );
        expect(result.due).toBe(true);
        expect(result.slotKey).toBe("2026-09-24");
      });
    });

    describe("Interval schedules (intervalMinutes)", () => {
      it("returns due: true for first run when lastRunAt is null", () => {
        const result = isScheduleDue(
          { type: "interval", intervalMinutes: 30 },
          null,
          new Date("2026-09-24T08:00:00.000Z")
        );
        expect(result.due).toBe(true);
      });

      it("returns due: true when interval has elapsed", () => {
        const lastRun = new Date("2026-09-24T08:00:00.000Z");
        const now = new Date("2026-09-24T08:31:00.000Z"); // 31m elapsed
        const result = isScheduleDue(
          { type: "interval", intervalMinutes: 30 },
          lastRun,
          now
        );
        expect(result.due).toBe(true);
      });

      it("returns due: false when interval has not yet elapsed", () => {
        const lastRun = new Date("2026-09-24T08:00:00.000Z");
        const now = new Date("2026-09-24T08:15:00.000Z"); // only 15m elapsed
        const result = isScheduleDue(
          { type: "interval", intervalMinutes: 30 },
          lastRun,
          now
        );
        expect(result.due).toBe(false);
        expect(result.reason).toContain("not yet elapsed");
      });
    });

    describe("Cron schedules (cron: string)", () => {
      it("returns due: true when exact minute matches cron", () => {
        const now = new Date("2026-09-24T08:00:00.000Z");
        const result = isScheduleDue(
          { cron: "0 8 * * *" },
          null,
          now,
          "UTC"
        );
        expect(result.due).toBe(true);
        expect(result.slotKey).toBe("2026-09-24T08:00");
      });

      it("catches up delayed tick within 15-minute execution window", () => {
        // Cron was at 08:00, current delayed tick is at 08:05
        const now = new Date("2026-09-24T08:05:00.000Z");
        const result = isScheduleDue(
          { cron: "0 8 * * *" },
          null,
          now,
          "UTC"
        );
        expect(result.due).toBe(true);
        expect(result.slotKey).toBe("2026-09-24T08:00");
      });

      it("returns due: false if already executed in current minute slot", () => {
        const now = new Date("2026-09-24T08:00:45.000Z");
        const lastRun = new Date("2026-09-24T08:00:10.000Z"); // ran 35s ago in same minute slot
        const result = isScheduleDue(
          { cron: "0 8 * * *" },
          lastRun,
          now,
          "UTC"
        );
        expect(result.due).toBe(false);
        expect(result.reason).toContain("already executed");
      });
    });
  });

  describe("6. Scheduler Engine Registration & Error Containment", () => {
    let engine: SchedulerEngine;

    beforeEach(() => {
      engine = new SchedulerEngine();
    });

    it("registers default periodic sweepers on initialization", () => {
      const sweepers = engine.getSweepers();
      const names = sweepers.map((s) => s.name);
      expect(names).toContain("overdue_tasks");
      expect(names).toContain("planning_prompts");
      expect(names).toContain("stagnant_goals");
    });

    it("allows registering and unregistering custom sweepers", () => {
      const customSweeper: PeriodicSweeper = {
        name: "custom_cleanup",
        run: async () => ({
          jobName: "custom_cleanup",
          userId: "test",
          executed: true,
          durationMs: 5,
        }),
      };

      engine.registerSweeper(customSweeper);
      expect(engine.getSweepers().some((s) => s.name === "custom_cleanup")).toBe(true);

      const removed = engine.unregisterSweeper("custom_cleanup");
      expect(removed).toBe(true);
      expect(engine.getSweepers().some((s) => s.name === "custom_cleanup")).toBe(false);
    });

    it("isolates errors when an individual sweeper throws", async () => {
      const explodingSweeper: PeriodicSweeper = {
        name: "exploding_job",
        run: async () => {
          throw new Error("Simulated sweeper database explosion");
        },
      };

      engine.registerSweeper(explodingSweeper);

      const summary = await engine.runSweepers("user_test", {
        referenceDate: new Date("2026-09-24T14:00:00Z"),
      });

      expect(summary.totalJobs).toBeGreaterThan(1);
      expect(summary.failedCount).toBeGreaterThanOrEqual(1);

      const failedJob = summary.results.find((r) => r.jobName === "exploding_job");
      expect(failedJob).toBeDefined();
      expect(failedJob!.executed).toBe(false);
      expect(failedJob!.error).toContain("Simulated sweeper database explosion");
    });
  });

  describe("7. Background Worker Daemon Lifecycle", () => {
    afterEach(() => {
      stopSchedulerWorker();
    });

    it("starts and stops the background worker daemon", () => {
      expect(isSchedulerWorkerRunning()).toBe(false);

      startSchedulerWorker({ intervalMs: 10_000 });
      expect(isSchedulerWorkerRunning()).toBe(true);

      stopSchedulerWorker();
      expect(isSchedulerWorkerRunning()).toBe(false);
    });

    it("prevents duplicate worker timer loops on multiple start calls", () => {
      startSchedulerWorker({ intervalMs: 10_000 });
      expect(isSchedulerWorkerRunning()).toBe(true);

      // Second start call should log warning and maintain single running instance
      startSchedulerWorker({ intervalMs: 5_000 });
      expect(isSchedulerWorkerRunning()).toBe(true);

      stopSchedulerWorker();
      expect(isSchedulerWorkerRunning()).toBe(false);
    });
  });

  describe("8. Schedule Config Schema Validation", () => {
    it("accepts valid cron configurations", () => {
      const parsed = scheduleConfigSchema.parse({
        type: "cron",
        cron: "0 8 * * *",
        timezone: "America/New_York",
      });
      expect(parsed.cron).toBe("0 8 * * *");
      expect(parsed.timezone).toBe("America/New_York");
    });

    it("accepts valid daily configurations", () => {
      const parsed = scheduleConfigSchema.parse({
        type: "daily",
        time: "08:30",
      });
      expect(parsed.time).toBe("08:30");
    });

    it("accepts valid interval configurations", () => {
      const parsed = scheduleConfigSchema.parse({
        type: "interval",
        intervalMinutes: 15,
      });
      expect(parsed.intervalMinutes).toBe(15);
    });

    it("accepts valid one-time runAt configurations", () => {
      const parsed = scheduleConfigSchema.parse({
        type: "once",
        runAt: "2026-09-24T10:00:00Z",
      });
      expect(parsed.runAt).toBe("2026-09-24T10:00:00Z");
    });

    it("rejects empty schedule configuration", () => {
      expect(() => scheduleConfigSchema.parse({})).toThrow();
    });

    it("rejects invalid time format for daily schedules", () => {
      expect(() =>
        scheduleConfigSchema.parse({
          type: "daily",
          time: "25:70",
        })
      ).toThrow();
    });
  });
});
