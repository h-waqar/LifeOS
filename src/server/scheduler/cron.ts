import { isValidTimezone } from "@/server/notifications/quiet-hours";
import type {
  ScheduleConfig,
  ScheduleEvaluationResult,
} from "./types";

export interface TimezoneDateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  dayOfWeek: number; // 0-6 (0 = Sunday)
  dateStr: string; // "YYYY-MM-DD"
  timeStr: string; // "HH:mm"
}

/**
 * Extracts date parts in the given target timezone.
 * Gracefully falls back to UTC if the timezone is invalid.
 */
export function getDatePartsInTimezone(
  date: Date,
  timezone: string = "UTC"
): TimezoneDateParts {
  const safeTz = isValidTimezone(timezone) ? timezone : "UTC";
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTz,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value;

  const year = parseInt(getPart("year") || "1970", 10);
  const month = parseInt(getPart("month") || "1", 10);
  const day = parseInt(getPart("day") || "1", 10);
  const hour = parseInt(getPart("hour") || "0", 10);
  const minute = parseInt(getPart("minute") || "0", 10);

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekdayStr = getPart("weekday") || "Sun";
  const dayOfWeek = weekdayMap[weekdayStr] ?? 0;

  const pad = (n: number) => n.toString().padStart(2, "0");
  const dateStr = `${year}-${pad(month)}-${pad(day)}`;
  const timeStr = `${pad(hour)}:${pad(minute)}`;

  return {
    year,
    month,
    day,
    hour,
    minute,
    dayOfWeek,
    dateStr,
    timeStr,
  };
}

/**
 * Evaluates whether a numeric value matches a single cron field pattern.
 */
export function matchesCronField(
  pattern: string,
  val: number,
  min: number,
  max: number,
  isDayOfWeek = false
): boolean {
  const trimmed = pattern.trim();
  if (trimmed === "*") {
    return true;
  }

  // Handle list: 1,2,5
  if (trimmed.includes(",")) {
    return trimmed
      .split(",")
      .some((sub) => matchesCronField(sub.trim(), val, min, max, isDayOfWeek));
  }

  // Handle step: */15, 1-30/5
  if (trimmed.includes("/")) {
    const [rangePart, stepPart] = trimmed.split("/");
    const step = parseInt(stepPart, 10);
    if (isNaN(step) || step <= 0) {
      throw new Error(`Invalid step in cron field: ${trimmed}`);
    }

    let start = min;
    let end = max;
    if (rangePart && rangePart !== "*") {
      if (rangePart.includes("-")) {
        const [rStart, rEnd] = rangePart.split("-");
        start = parseInt(rStart, 10);
        end = parseInt(rEnd, 10);
      } else {
        start = parseInt(rangePart, 10);
      }
    }

    if (val < start || val > end) {
      return false;
    }
    return (val - start) % step === 0;
  }

  // Handle range: 1-5
  if (trimmed.includes("-")) {
    const [startStr, endStr] = trimmed.split("-");
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);
    if (isNaN(start) || isNaN(end) || start > end || start < min || end > max) {
      throw new Error(`Invalid range in cron field: ${trimmed}`);
    }
    return val >= start && val <= end;
  }

  // Exact number
  const parsed = parseInt(trimmed, 10);
  if (isNaN(parsed) || parsed < min || parsed > max) {
    throw new Error(`Cron field value ${trimmed} out of range [${min}, ${max}]`);
  }

  if (isDayOfWeek) {
    // 0 and 7 both represent Sunday
    const normalizedTarget = parsed === 7 ? 0 : parsed;
    const normalizedVal = val === 7 ? 0 : val;
    return normalizedTarget === normalizedVal;
  }

  return parsed === val;
}

/**
 * Validates a standard 5-part cron expression.
 */
export function isValidCron(cronExpr: string): boolean {
  if (!cronExpr || typeof cronExpr !== "string") return false;
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [min, hour, dom, mon, dow] = parts;

  try {
    // Test sample boundaries
    matchesCronField(min, 0, 0, 59);
    matchesCronField(hour, 0, 0, 23);
    matchesCronField(dom, 1, 1, 31);
    matchesCronField(mon, 1, 1, 12);
    matchesCronField(dow, 0, 0, 7, true);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks whether a given Date matches a 5-part cron expression in the specified timezone.
 */
export function matchesCron(
  cronExpr: string,
  date: Date,
  timezone: string = "UTC"
): boolean {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(
      `Invalid cron expression "${cronExpr}": expected 5 fields (minute hour day-of-month month day-of-week).`
    );
  }

  const [minPattern, hourPattern, domPattern, monPattern, dowPattern] = parts;
  const { minute, hour, day, month, dayOfWeek } = getDatePartsInTimezone(
    date,
    timezone
  );

  const minMatch = matchesCronField(minPattern, minute, 0, 59);
  const hourMatch = matchesCronField(hourPattern, hour, 0, 23);
  const monMatch = matchesCronField(monPattern, month, 1, 12);

  if (!minMatch || !hourMatch || !monMatch) {
    return false;
  }

  // POSIX / Vixie standard: if both day-of-month and day-of-week are restricted, match if EITHER matches.
  const domRestricted = domPattern.trim() !== "*";
  const dowRestricted = dowPattern.trim() !== "*";

  if (domRestricted && dowRestricted) {
    const domMatch = matchesCronField(domPattern, day, 1, 31);
    const dowMatch = matchesCronField(dowPattern, dayOfWeek, 0, 7, true);
    return domMatch || dowMatch;
  }

  if (domRestricted) {
    return matchesCronField(domPattern, day, 1, 31);
  }

  if (dowRestricted) {
    return matchesCronField(dowPattern, dayOfWeek, 0, 7, true);
  }

  return true;
}

/**
 * Calculates the next occurrence matching the cron expression starting from fromDate.
 */
export function getNextCronOccurrence(
  cronExpr: string,
  fromDate: Date = new Date(),
  timezone: string = "UTC",
  maxLookaheadDays: number = 366
): Date | null {
  if (!isValidCron(cronExpr)) {
    throw new Error(`Invalid cron expression: ${cronExpr}`);
  }

  // Start from the next whole minute
  const startMs = Math.floor(fromDate.getTime() / 60000) * 60000 + 60000;
  const maxEndMs = startMs + maxLookaheadDays * 24 * 60 * 60 * 1000;

  let currentMs = startMs;
  while (currentMs <= maxEndMs) {
    const candidate = new Date(currentMs);
    if (matchesCron(cronExpr, candidate, timezone)) {
      return candidate;
    }
    currentMs += 60000; // Increment 1 minute
  }

  return null;
}

/**
 * Determines whether a schedule configuration is currently due for execution.
 * Handles catch-up, delayed ticks, execution windows, and timezone adjustments.
 */
export function isScheduleDue(
  config: ScheduleConfig,
  lastRunAt: Date | null,
  referenceDate: Date = new Date(),
  timezone: string = "UTC"
): ScheduleEvaluationResult {
  const safeTz = config.timezone || timezone || "UTC";

  // 1. One-time schedule ("once")
  if (config.type === "once" || config.runAt) {
    if (!config.runAt) {
      return { due: false, slotKey: "", scheduledFor: referenceDate, reason: "Missing runAt" };
    }
    const targetDate = new Date(config.runAt);
    if (isNaN(targetDate.getTime())) {
      return { due: false, slotKey: "", scheduledFor: referenceDate, reason: "Invalid runAt date" };
    }
    if (lastRunAt !== null) {
      return {
        due: false,
        slotKey: "once",
        scheduledFor: targetDate,
        reason: "One-time schedule already executed",
      };
    }
    if (referenceDate.getTime() >= targetDate.getTime()) {
      return {
        due: true,
        slotKey: "once",
        scheduledFor: targetDate,
      };
    }
    return {
      due: false,
      slotKey: "once",
      scheduledFor: targetDate,
      reason: "Scheduled time is in the future",
    };
  }

  // 2. Interval schedule
  if (config.type === "interval" || (config.intervalMinutes && !config.cron && !config.time)) {
    const intervalMinutes = config.intervalMinutes ?? 60;
    const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;

    if (!lastRunAt) {
      const slotKey = Math.floor(referenceDate.getTime() / intervalMs).toString();
      return {
        due: true,
        slotKey,
        scheduledFor: referenceDate,
      };
    }

    const elapsedMs = referenceDate.getTime() - lastRunAt.getTime();
    if (elapsedMs >= intervalMs) {
      const slotKey = Math.floor(referenceDate.getTime() / intervalMs).toString();
      return {
        due: true,
        slotKey,
        scheduledFor: new Date(lastRunAt.getTime() + intervalMs),
      };
    }

    return {
      due: false,
      slotKey: Math.floor(referenceDate.getTime() / intervalMs).toString(),
      scheduledFor: new Date(lastRunAt.getTime() + intervalMs),
      reason: `Interval of ${intervalMinutes}m not yet elapsed (${Math.round(elapsedMs / 1000)}s elapsed)`,
    };
  }

  // 3. Daily schedule (time "HH:mm")
  if (config.type === "daily" || (config.time && !config.cron)) {
    const targetTime = config.time || "08:00";
    const currentParts = getDatePartsInTimezone(referenceDate, safeTz);

    const [tHourStr, tMinStr] = targetTime.split(":");
    const targetHour = parseInt(tHourStr, 10);
    const targetMinute = parseInt(tMinStr, 10);
    const targetTotalMinutes = targetHour * 60 + targetMinute;
    const currentTotalMinutes = currentParts.hour * 60 + currentParts.minute;

    const dateSlotKey = currentParts.dateStr;

    // Check if target time reached today
    if (currentTotalMinutes < targetTotalMinutes) {
      return {
        due: false,
        slotKey: dateSlotKey,
        scheduledFor: referenceDate,
        reason: `Target time ${targetTime} not reached yet for today (current: ${currentParts.timeStr})`,
      };
    }

    // Target time reached or passed today. Check if already executed today
    if (lastRunAt) {
      const lastParts = getDatePartsInTimezone(lastRunAt, safeTz);
      if (lastParts.dateStr === currentParts.dateStr) {
        return {
          due: false,
          slotKey: dateSlotKey,
          scheduledFor: referenceDate,
          reason: `Daily job already executed today (${dateSlotKey})`,
        };
      }
    }

    return {
      due: true,
      slotKey: dateSlotKey,
      scheduledFor: referenceDate,
    };
  }

  // 4. Cron expression schedule
  if (config.cron) {
    if (!isValidCron(config.cron)) {
      return {
        due: false,
        slotKey: "",
        scheduledFor: referenceDate,
        reason: `Invalid cron expression: "${config.cron}"`,
      };
    }

    const currentParts = getDatePartsInTimezone(referenceDate, safeTz);
    const currentMinuteSlot = `${currentParts.dateStr}T${currentParts.timeStr}`;

    // If already ran in this minute slot, not due
    if (lastRunAt) {
      const lastParts = getDatePartsInTimezone(lastRunAt, safeTz);
      const lastMinuteSlot = `${lastParts.dateStr}T${lastParts.timeStr}`;
      if (lastMinuteSlot === currentMinuteSlot) {
        return {
          due: false,
          slotKey: currentMinuteSlot,
          scheduledFor: referenceDate,
          reason: `Cron already executed in current minute slot (${currentMinuteSlot})`,
        };
      }
    }

    // Check if current minute matches
    if (matchesCron(config.cron, referenceDate, safeTz)) {
      return {
        due: true,
        slotKey: currentMinuteSlot,
        scheduledFor: referenceDate,
      };
    }

    // Delayed tick / catch-up window: check recent minutes within a 15-minute execution window
    // to handle delayed scheduler ticks or short downtime
    const windowMinutes = 15;
    const nowMs = referenceDate.getTime();
    const lastRunMs = lastRunAt ? lastRunAt.getTime() : nowMs - windowMinutes * 60 * 1000;
    const lookbackStartMs = Math.max(lastRunMs + 60000, nowMs - windowMinutes * 60 * 1000);

    for (let checkMs = nowMs - 60000; checkMs >= lookbackStartMs; checkMs -= 60000) {
      const candidateDate = new Date(checkMs);
      if (matchesCron(config.cron, candidateDate, safeTz)) {
        const candidateParts = getDatePartsInTimezone(candidateDate, safeTz);
        const slotKey = `${candidateParts.dateStr}T${candidateParts.timeStr}`;
        return {
          due: true,
          slotKey,
          scheduledFor: candidateDate,
        };
      }
    }

    return {
      due: false,
      slotKey: currentMinuteSlot,
      scheduledFor: referenceDate,
      reason: "Current time does not match cron schedule",
    };
  }

  return {
    due: false,
    slotKey: "",
    scheduledFor: referenceDate,
    reason: "No valid schedule specification found in config",
  };
}

/**
 * Idempotency Key Generators
 */
export function generateDailyIdempotencyKey(
  jobName: string,
  userId: string,
  dateStr: string
): string {
  return `${jobName}:${userId}:${dateStr}`;
}

export function generateHourlyIdempotencyKey(
  jobName: string,
  userId: string,
  dateStr: string,
  hourStr: string
): string {
  return `${jobName}:${userId}:${dateStr}:${hourStr}`;
}

export function generateEntityIdempotencyKey(
  jobName: string,
  userId: string,
  entityId: string,
  dateStr: string
): string {
  return `${jobName}:${userId}:${entityId}:${dateStr}`;
}

export function generateScheduledAutomationKey(
  userId: string,
  automationId: string,
  slotKey: string
): string {
  return `scheduled_automation:${userId}:${automationId}:${slotKey}`;
}
