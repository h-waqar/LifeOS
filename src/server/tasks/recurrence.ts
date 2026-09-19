import type { RecurrenceRule } from "@/server/db/schema";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Recurrence calculation cannot be executed in the browser."
  );
}

/**
 * Calculates the next occurrence date for a recurring task.
 * Returns null if the recurrence series is exhausted (past endDate or count reached).
 */
export function calculateNextOccurrence(
  fromDate: Date | string,
  rule: RecurrenceRule,
  currentCount: number = 1
): Date | null {
  if (!rule || !rule.frequency) {
    return null;
  }

  // Count limit check
  if (rule.count !== undefined && rule.count !== null && currentCount >= rule.count) {
    return null;
  }

  const base = typeof fromDate === "string" ? new Date(fromDate) : new Date(fromDate);
  if (isNaN(base.getTime())) {
    return null;
  }

  const interval = Math.max(1, rule.interval || 1);
  let nextDate = new Date(base);

  switch (rule.frequency) {
    case "daily": {
      nextDate.setDate(nextDate.getDate() + interval);
      break;
    }

    case "weekly": {
      if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
        // Sort distinct days 0..6 (0 = Sunday)
        const days = Array.from(new Set(rule.daysOfWeek))
          .filter((d) => d >= 0 && d <= 6)
          .sort((a, b) => a - b);

        if (days.length === 0) {
          nextDate.setDate(nextDate.getDate() + interval * 7);
          break;
        }

        const currentDay = base.getDay();
        const nextDayInWeek = days.find((d) => d > currentDay);

        if (nextDayInWeek !== undefined) {
          // Found a day later in the same week
          const diff = nextDayInWeek - currentDay;
          nextDate.setDate(nextDate.getDate() + diff);
        } else {
          // Wrap to first day of next interval week
          const firstDay = days[0];
          const daysUntilEndOfWeek = 7 - currentDay;
          const daysFromStartOfWeek = firstDay;
          const totalDays = daysUntilEndOfWeek + (interval - 1) * 7 + daysFromStartOfWeek;
          nextDate.setDate(nextDate.getDate() + totalDays);
        }
      } else {
        nextDate.setDate(nextDate.getDate() + interval * 7);
      }
      break;
    }

    case "monthly": {
      const targetDay = base.getDate();
      const targetMonth = base.getMonth() + interval;
      const year = base.getFullYear();

      // Set to 1st of target month first to avoid automatic month overflow
      nextDate = new Date(base);
      nextDate.setDate(1);
      nextDate.setMonth(targetMonth);

      // Find max days in the target month
      const daysInTargetMonth = new Date(
        nextDate.getFullYear(),
        nextDate.getMonth() + 1,
        0
      ).getDate();

      // Clamp to month end if targetDay exceeds month days (e.g. Jan 31 -> Feb 28)
      nextDate.setDate(Math.min(targetDay, daysInTargetMonth));
      break;
    }

    case "custom": {
      // Custom frequency defaults to interval in days
      nextDate.setDate(nextDate.getDate() + interval);
      break;
    }

    default:
      return null;
  }

  // End date limit check
  if (rule.endDate) {
    const end = new Date(rule.endDate);
    if (!isNaN(end.getTime()) && nextDate.getTime() > end.getTime()) {
      return null;
    }
  }

  return nextDate;
}
