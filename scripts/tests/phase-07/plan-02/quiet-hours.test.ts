import { describe, it, expect } from "vitest";
import {
  parseTimeString,
  isValidTimezone,
  getTimeInTimezone,
  isQuietHoursActive,
  evaluateNotificationEligibility,
} from "@/server/notifications/quiet-hours";
import type { QuietHoursConfig } from "@/server/notifications/types";

describe("Plan 07-02: Quiet Hours Engine", () => {
  describe("parseTimeString", () => {
    it("parses valid 24-hour time strings correctly", () => {
      expect(parseTimeString("00:00")).toEqual({
        hour: 0,
        minute: 0,
        totalMinutes: 0,
      });
      expect(parseTimeString("09:30")).toEqual({
        hour: 9,
        minute: 30,
        totalMinutes: 570,
      });
      expect(parseTimeString("22:00")).toEqual({
        hour: 22,
        minute: 0,
        totalMinutes: 1320,
      });
      expect(parseTimeString("23:59")).toEqual({
        hour: 23,
        minute: 59,
        totalMinutes: 1439,
      });
    });

    it("falls back to 00:00 on malformed or empty time strings", () => {
      expect(parseTimeString("")).toEqual({ hour: 0, minute: 0, totalMinutes: 0 });
      expect(parseTimeString("invalid")).toEqual({
        hour: 0,
        minute: 0,
        totalMinutes: 0,
      });
      expect(parseTimeString("25:00")).toEqual({
        hour: 0,
        minute: 0,
        totalMinutes: 0,
      });
      expect(parseTimeString("12:60")).toEqual({
        hour: 0,
        minute: 0,
        totalMinutes: 0,
      });
    });
  });

  describe("isValidTimezone", () => {
    it("recognizes standard IANA timezones", () => {
      expect(isValidTimezone("UTC")).toBe(true);
      expect(isValidTimezone("America/New_York")).toBe(true);
      expect(isValidTimezone("Europe/London")).toBe(true);
      expect(isValidTimezone("Asia/Karachi")).toBe(true);
      expect(isValidTimezone("Asia/Tokyo")).toBe(true);
    });

    it("returns false for invalid timezone strings", () => {
      expect(isValidTimezone("Invalid/Zone")).toBe(false);
      expect(isValidTimezone("")).toBe(false);
      expect(isValidTimezone("NotATimezone")).toBe(false);
    });
  });

  describe("getTimeInTimezone", () => {
    it("extracts accurate hour and minute for a given UTC instant", () => {
      // 2026-09-23T12:30:00Z
      const date = new Date("2026-09-23T12:30:00Z");

      const utcTime = getTimeInTimezone(date, "UTC");
      expect(utcTime.hour).toBe(12);
      expect(utcTime.minute).toBe(30);
      expect(utcTime.totalMinutes).toBe(750);

      // Karachi is UTC+5 -> 17:30
      const karachiTime = getTimeInTimezone(date, "Asia/Karachi");
      expect(karachiTime.hour).toBe(17);
      expect(karachiTime.minute).toBe(30);
      expect(karachiTime.totalMinutes).toBe(1050);

      // Tokyo is UTC+9 -> 21:30
      const tokyoTime = getTimeInTimezone(date, "Asia/Tokyo");
      expect(tokyoTime.hour).toBe(21);
      expect(tokyoTime.minute).toBe(30);
      expect(tokyoTime.totalMinutes).toBe(1290);
    });

    it("falls back to UTC on invalid timezone without throwing", () => {
      const date = new Date("2026-09-23T14:45:00Z");
      const fallbackTime = getTimeInTimezone(date, "Invalid/Nonexistent");
      expect(fallbackTime.resolvedTimezone).toBe("UTC");
      expect(fallbackTime.hour).toBe(14);
      expect(fallbackTime.minute).toBe(45);
    });
  });

  describe("isQuietHoursActive", () => {
    describe("Disabled state", () => {
      it("always returns false when quietHoursEnabled is false", () => {
        const config: QuietHoursConfig = {
          quietHoursEnabled: false,
          quietHoursStart: "22:00",
          quietHoursEnd: "08:00",
          timezone: "UTC",
        };

        // Even at 03:00 UTC (deep inside window)
        const date = new Date("2026-09-23T03:00:00Z");
        expect(isQuietHoursActive(config, date)).toBe(false);
      });

      it("returns false when quietHoursStart === quietHoursEnd (zero length)", () => {
        const config: QuietHoursConfig = {
          quietHoursEnabled: true,
          quietHoursStart: "22:00",
          quietHoursEnd: "22:00",
          timezone: "UTC",
        };
        const date = new Date("2026-09-23T22:00:00Z");
        expect(isQuietHoursActive(config, date)).toBe(false);
      });
    });

    describe("Daytime window (start < end, e.g. 13:00 to 15:00)", () => {
      const config: QuietHoursConfig = {
        quietHoursEnabled: true,
        quietHoursStart: "13:00",
        quietHoursEnd: "15:00",
        timezone: "UTC",
      };

      it("is active inside daytime window", () => {
        expect(isQuietHoursActive(config, new Date("2026-09-23T13:00:00Z"))).toBe(true);
        expect(isQuietHoursActive(config, new Date("2026-09-23T14:00:00Z"))).toBe(true);
        expect(isQuietHoursActive(config, new Date("2026-09-23T14:59:00Z"))).toBe(true);
      });

      it("is inactive outside daytime window", () => {
        expect(isQuietHoursActive(config, new Date("2026-09-23T12:59:00Z"))).toBe(false);
        expect(isQuietHoursActive(config, new Date("2026-09-23T15:00:00Z"))).toBe(false);
        expect(isQuietHoursActive(config, new Date("2026-09-23T15:01:00Z"))).toBe(false);
        expect(isQuietHoursActive(config, new Date("2026-09-23T09:00:00Z"))).toBe(false);
      });
    });

    describe("Overnight window spanning midnight (start > end, e.g. 22:00 to 08:00)", () => {
      const config: QuietHoursConfig = {
        quietHoursEnabled: true,
        quietHoursStart: "22:00",
        quietHoursEnd: "08:00",
        timezone: "UTC",
      };

      it("is active on start boundary (22:00)", () => {
        expect(isQuietHoursActive(config, new Date("2026-09-23T22:00:00Z"))).toBe(true);
      });

      it("is active late evening before midnight (23:45)", () => {
        expect(isQuietHoursActive(config, new Date("2026-09-23T23:45:00Z"))).toBe(true);
      });

      it("is active at exact midnight crossover (00:00)", () => {
        expect(isQuietHoursActive(config, new Date("2026-09-23T00:00:00Z"))).toBe(true);
      });

      it("is active in early morning hours (03:30, 06:00, 07:59)", () => {
        expect(isQuietHoursActive(config, new Date("2026-09-23T03:30:00Z"))).toBe(true);
        expect(isQuietHoursActive(config, new Date("2026-09-23T06:00:00Z"))).toBe(true);
        expect(isQuietHoursActive(config, new Date("2026-09-23T07:59:59Z"))).toBe(true);
      });

      it("is inactive on end boundary (08:00)", () => {
        expect(isQuietHoursActive(config, new Date("2026-09-23T08:00:00Z"))).toBe(false);
      });

      it("is inactive during regular waking daytime (08:01 to 21:59)", () => {
        expect(isQuietHoursActive(config, new Date("2026-09-23T08:01:00Z"))).toBe(false);
        expect(isQuietHoursActive(config, new Date("2026-09-23T12:00:00Z"))).toBe(false);
        expect(isQuietHoursActive(config, new Date("2026-09-23T18:00:00Z"))).toBe(false);
        expect(isQuietHoursActive(config, new Date("2026-09-23T21:59:59Z"))).toBe(false);
      });
    });

    describe("Timezone handling", () => {
      it("evaluates quiet hours accurately according to user timezone", () => {
        // Karachi is UTC+5
        const karachiConfig: QuietHoursConfig = {
          quietHoursEnabled: true,
          quietHoursStart: "22:00",
          quietHoursEnd: "08:00",
          timezone: "Asia/Karachi",
        };

        // 17:00 UTC = 22:00 Karachi -> START of quiet hours
        expect(isQuietHoursActive(karachiConfig, new Date("2026-09-23T17:00:00Z"))).toBe(
          true
        );

        // 16:59 UTC = 21:59 Karachi -> OUTSIDE quiet hours
        expect(isQuietHoursActive(karachiConfig, new Date("2026-09-23T16:59:00Z"))).toBe(
          false
        );

        // 03:00 UTC = 08:00 Karachi -> END of quiet hours (outside)
        expect(isQuietHoursActive(karachiConfig, new Date("2026-09-23T03:00:00Z"))).toBe(
          false
        );

        // 02:59 UTC = 07:59 Karachi -> INSIDE quiet hours
        expect(isQuietHoursActive(karachiConfig, new Date("2026-09-23T02:59:00Z"))).toBe(
          true
        );
      });
    });
  });

  describe("evaluateNotificationEligibility", () => {
    const activeQuietConfig: QuietHoursConfig = {
      quietHoursEnabled: true,
      quietHoursStart: "22:00",
      quietHoursEnd: "08:00",
      timezone: "UTC",
    };
    const quietTime = new Date("2026-09-23T23:30:00Z");
    const activeTime = new Date("2026-09-23T14:00:00Z");

    it("marks normal notification eligible when outside quiet hours", () => {
      const res = evaluateNotificationEligibility(
        { type: "info" },
        activeQuietConfig,
        activeTime
      );
      expect(res.inQuietHours).toBe(false);
      expect(res.isEligibleForImmediateAlert).toBe(true);
      expect(res.isSilenced).toBe(false);
    });

    it("silences standard notifications (info, warning, success, reminder) during quiet hours", () => {
      const types = ["info", "warning", "success", "reminder"] as const;
      for (const type of types) {
        const res = evaluateNotificationEligibility(
          { type },
          activeQuietConfig,
          quietTime
        );
        expect(res.inQuietHours).toBe(true);
        expect(res.isEligibleForImmediateAlert).toBe(false);
        expect(res.isSilenced).toBe(true);
        expect(res.reason).toBe("quiet_hours_active");
      }
    });

    it("allows error notifications to bypass quiet hours", () => {
      const res = evaluateNotificationEligibility(
        { type: "error" },
        activeQuietConfig,
        quietTime
      );
      expect(res.inQuietHours).toBe(true);
      expect(res.isEligibleForImmediateAlert).toBe(true);
      expect(res.isSilenced).toBe(false);
      expect(res.reason).toBe("urgent_bypass");
    });

    it("allows explicit bypassQuietHours=true to bypass quiet hours", () => {
      const res = evaluateNotificationEligibility(
        { type: "info", bypassQuietHours: true },
        activeQuietConfig,
        quietTime
      );
      expect(res.inQuietHours).toBe(true);
      expect(res.isEligibleForImmediateAlert).toBe(true);
      expect(res.isSilenced).toBe(false);
      expect(res.reason).toBe("urgent_bypass");
    });

    it("allows explicit urgent=true to bypass quiet hours", () => {
      const res = evaluateNotificationEligibility(
        { type: "reminder", urgent: true },
        activeQuietConfig,
        quietTime
      );
      expect(res.inQuietHours).toBe(true);
      expect(res.isEligibleForImmediateAlert).toBe(true);
      expect(res.isSilenced).toBe(false);
      expect(res.reason).toBe("urgent_bypass");
    });

    it("allows critical priority to bypass quiet hours", () => {
      const res = evaluateNotificationEligibility(
        { type: "warning", priority: "critical" },
        activeQuietConfig,
        quietTime
      );
      expect(res.inQuietHours).toBe(true);
      expect(res.isEligibleForImmediateAlert).toBe(true);
      expect(res.isSilenced).toBe(false);
      expect(res.reason).toBe("urgent_bypass");
    });
  });
});
