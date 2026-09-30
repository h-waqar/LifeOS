import type {
  QuietHoursConfig,
  NotificationEligibilityResult,
  NotificationType,
} from "./types";

/**
 * Validates whether an IANA timezone identifier is valid.
 */
export function isValidTimezone(timezone: string): boolean {
  if (!timezone || typeof timezone !== "string") return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses "HH:mm" time string into numeric hour and minute.
 * Falls back to 00:00 on invalid formats.
 */
export function parseTimeString(timeStr: string): {
  hour: number;
  minute: number;
  totalMinutes: number;
} {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeStr?.trim() || "");
  if (!match) {
    return { hour: 0, minute: 0, totalMinutes: 0 };
  }
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  return { hour, minute, totalMinutes: hour * 60 + minute };
}

/**
 * Returns current hour and minute for a given reference date in a target timezone.
 * Falls back safely to UTC if an invalid timezone is provided.
 */
export function getTimeInTimezone(
  date: Date,
  timezone: string
): { hour: number; minute: number; totalMinutes: number; resolvedTimezone: string } {
  const safeTz = isValidTimezone(timezone) ? timezone : "UTC";

  // Use Intl.DateTimeFormat with hourCycle: "h23" to get 00-23
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const minuteStr = parts.find((p) => p.type === "minute")?.value ?? "0";
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);

  return {
    hour,
    minute,
    totalMinutes: hour * 60 + minute,
    resolvedTimezone: safeTz,
  };
}

/**
 * Pure calculation to determine whether Quiet Hours is currently active.
 *
 * Handles:
 * - Disabled quiet hours (returns false)
 * - Daytime windows (start < end, e.g. 13:00 to 15:00)
 * - Overnight windows spanning midnight (start > end, e.g. 22:00 to 08:00)
 * - Day boundary transitions (23:59 to 00:00)
 * - Timezone adjustments
 * - Zero-duration windows (start === end, returns false)
 */
export function isQuietHoursActive(
  config: QuietHoursConfig,
  referenceDate: Date = new Date()
): boolean {
  if (!config.quietHoursEnabled) {
    return false;
  }

  const start = parseTimeString(config.quietHoursStart);
  const end = parseTimeString(config.quietHoursEnd);

  // Equal start and end represents an empty quiet hours window
  if (start.totalMinutes === end.totalMinutes) {
    return false;
  }

  const current = getTimeInTimezone(referenceDate, config.timezone);

  if (start.totalMinutes < end.totalMinutes) {
    // Normal daytime window without midnight crossover (e.g. 13:00 - 17:00)
    // Active if current >= start and current < end
    return (
      current.totalMinutes >= start.totalMinutes &&
      current.totalMinutes < end.totalMinutes
    );
  }

  // Overnight window crossing midnight (e.g. 22:00 - 08:00)
  // Active if current >= start (late evening) OR current < end (early morning)
  return (
    current.totalMinutes >= start.totalMinutes ||
    current.totalMinutes < end.totalMinutes
  );
}

export interface NotificationEligibilityCandidate {
  type?: NotificationType;
  priority?: string;
  urgent?: boolean;
  bypassQuietHours?: boolean;
}

/**
 * Evaluates whether a notification is eligible for immediate active alert or should be silenced.
 *
 * Invariants:
 * - Outside quiet hours: Always eligible for immediate alert.
 * - During active quiet hours:
 *   - Error notifications, explicitly marked urgent notifications, or notifications with bypassQuietHours=true
 *     bypass quiet hours and are eligible for immediate alert.
 *   - Standard notifications (info, warning, success, reminder) are silenced during quiet hours
 *     and recorded with metadata.duringQuietHours = true, metadata.silenced = true.
 */
export function evaluateNotificationEligibility(
  candidate: NotificationEligibilityCandidate,
  config: QuietHoursConfig,
  referenceDate: Date = new Date()
): NotificationEligibilityResult {
  const inQuietHours = isQuietHoursActive(config, referenceDate);

  if (!inQuietHours) {
    return {
      inQuietHours: false,
      isEligibleForImmediateAlert: true,
      isSilenced: false,
    };
  }

  // Check if notification qualifies for quiet hours bypass
  const isUrgent =
    candidate.bypassQuietHours === true ||
    candidate.urgent === true ||
    candidate.type === "error" ||
    candidate.priority === "critical";

  if (isUrgent) {
    return {
      inQuietHours: true,
      isEligibleForImmediateAlert: true,
      isSilenced: false,
      reason: "urgent_bypass",
    };
  }

  return {
    inQuietHours: true,
    isEligibleForImmediateAlert: false,
    isSilenced: true,
    reason: "quiet_hours_active",
  };
}
