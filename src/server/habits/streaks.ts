/**
 * Pure Deterministic Habit & Streak Calculation Engine
 *
 * Rules:
 * - Pure functions with zero database, zero API, zero React dependencies.
 * - No reliance on system clock; all calculations take an explicit referenceDate.
 * - Streaks are evaluated on scheduled occurrences, not raw calendar dates.
 * - Target-value semantics: an occurrence is completed only when value >= targetValue.
 * - Non-scheduled / rest days do not penalize or break streaks.
 * - An active scheduled day that is incomplete does NOT immediately reset the streak.
 * - Weekly habits evaluate explicit Monday–Sunday calendar weeks against frequencyTarget.
 * - Completion rates are strictly bounded: 0 <= rate <= 100.
 */

export type HabitFrequency =
  | "daily"
  | "weekdays"
  | "weekly"
  | "specific_days"
  | "custom";

export interface HabitStreakConfig {
  id?: string;
  frequency: HabitFrequency;
  frequencyTarget: number;
  frequencyDays?: number[] | null;
  intervalDays?: number | null;
  targetValue: number;
  longestStreak?: number;
  createdAt?: string | Date | null;
}

export interface HabitEntryRecord {
  date: string | Date;
  value: number;
  targetValue?: number | null;
}

export interface StreakStats {
  currentStreak: number;
  longestStreak: number;
  completionRate30d: number;
  completionRateAllTime: number;
  isCompletedToday: boolean;
  totalCompletions: number;
}

export interface StreakDayInfo {
  date: string;
  isScheduled: boolean;
  isCompleted: boolean;
  value: number;
  targetValue: number;
  status: "completed" | "missed" | "rest" | "pending";
}

/**
 * Normalizes a string or Date object into a YYYY-MM-DD calendar date string.
 * Uses UTC methods to guarantee zero daylight-savings or local timezone drift.
 */
export function normalizeDate(date: string | Date): string {
  if (typeof date === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date;
    }
    if (/^\d{4}-\d{2}-\d{2}T/.test(date)) {
      return date.slice(0, 10);
    }
    const parsed = new Date(date);
    return formatUtc(parsed);
  }
  return formatUtc(date);
}

export function formatUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseUtcDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(dateStr: string, days: number): string {
  const dt = parseUtcDate(dateStr);
  dt.setUTCDate(dt.getUTCDate() + days);
  return formatUtc(dt);
}

export function daysDifference(startStr: string, endStr: string): number {
  const s = parseUtcDate(startStr).getTime();
  const e = parseUtcDate(endStr).getTime();
  return Math.round((e - s) / 86400000);
}

export function getDayOfWeek(dateStr: string): number {
  // 0 = Sunday, 1 = Monday, 2 = Tuesday, ..., 6 = Saturday
  return parseUtcDate(dateStr).getUTCDay();
}

export function getMondayOfWeek(dateStr: string): string {
  const dow = getDayOfWeek(dateStr);
  const diff = dow === 0 ? 6 : dow - 1;
  return addDays(dateStr, -diff);
}

export function getSundayOfWeek(dateStr: string): string {
  const monday = getMondayOfWeek(dateStr);
  return addDays(monday, 6);
}

/**
 * Determines whether a given date is a scheduled occurrence for the habit.
 */
export function isScheduledDay(
  habit: HabitStreakConfig,
  date: string | Date
): boolean {
  const dateStr = normalizeDate(date);
  const dow = getDayOfWeek(dateStr);

  switch (habit.frequency) {
    case "daily":
      return true;

    case "weekdays":
      // Monday (1) through Friday (5)
      return dow >= 1 && dow <= 5;

    case "specific_days": {
      if (!habit.frequencyDays || habit.frequencyDays.length === 0) {
        return false;
      }
      // Normalize day values (support 0 or 7 for Sunday)
      const targetDays = new Set(
        habit.frequencyDays.map((d) => (d === 7 ? 0 : d))
      );
      return targetDays.has(dow);
    }

    case "weekly":
      // Any calendar day may host a completion towards the weekly target
      return true;

    case "custom": {
      const interval = Math.max(1, habit.intervalDays || 1);
      const anchorDateStr = habit.createdAt
        ? normalizeDate(habit.createdAt)
        : null;
      if (!anchorDateStr) {
        return true;
      }
      const diff = Math.abs(daysDifference(anchorDateStr, dateStr));
      return diff % interval === 0;
    }

    default:
      return true;
  }
}

/**
 * Returns a set of unique calendar dates (YYYY-MM-DD) that meet or exceed target_value.
 */
function getCompletedDateMap(
  habit: HabitStreakConfig,
  entries: HabitEntryRecord[]
): Map<string, number> {
  const completed = new Map<string, number>();
  const defaultTarget = habit.targetValue > 0 ? habit.targetValue : 1;

  for (const entry of entries) {
    const d = normalizeDate(entry.date);
    const target =
      entry.targetValue !== undefined &&
      entry.targetValue !== null &&
      entry.targetValue > 0
        ? entry.targetValue
        : defaultTarget;

    const existingVal = completed.get(d) ?? 0;
    const maxVal = Math.max(existingVal, entry.value);

    if (maxVal >= target) {
      completed.set(d, maxVal);
    }
  }

  return completed;
}

/**
 * Calculates the completion rate percentage within a given date window [startDate, endDate].
 * Strictly bounded between 0 and 100.
 */
export function calculateCompletionRate(
  habit: HabitStreakConfig,
  entries: HabitEntryRecord[],
  startDate: string | Date,
  endDate: string | Date
): number {
  const startStr = normalizeDate(startDate);
  const endStr = normalizeDate(endDate);

  if (startStr > endStr) {
    return 0;
  }

  const completedMap = getCompletedDateMap(habit, entries);

  if (habit.frequency === "weekly") {
    const target = Math.max(1, habit.frequencyTarget || 1);
    let curMon = getMondayOfWeek(startStr);
    const endMon = getMondayOfWeek(endStr);
    let totalWeeks = 0;
    let successfulWeeks = 0;

    while (curMon <= endMon) {
      const curSun = addDays(curMon, 6);
      totalWeeks++;

      let completionsInWeek = 0;
      let d = curMon;
      while (d <= curSun) {
        if (completedMap.has(d)) {
          completionsInWeek++;
        }
        d = addDays(d, 1);
      }

      if (completionsInWeek >= target) {
        successfulWeeks++;
      }

      curMon = addDays(curMon, 7);
    }

    if (totalWeeks === 0) return 0;
    const rate = Math.round((successfulWeeks / totalWeeks) * 100);
    return Math.min(100, Math.max(0, rate));
  } else {
    let totalScheduledDays = 0;
    let completedScheduledDays = 0;
    let cur = startStr;

    while (cur <= endStr) {
      if (isScheduledDay(habit, cur)) {
        totalScheduledDays++;
        if (completedMap.has(cur)) {
          completedScheduledDays++;
        }
      }
      cur = addDays(cur, 1);
    }

    if (totalScheduledDays === 0) return 0;
    const rate = Math.round((completedScheduledDays / totalScheduledDays) * 100);
    return Math.min(100, Math.max(0, rate));
  }
}

/**
 * Calculates deterministic streak statistics (current streak, longest streak,
 * 30-day and all-time completion rate) relative to an explicit reference date.
 */
export function calculateStreakStats(
  habit: HabitStreakConfig,
  entries: HabitEntryRecord[],
  referenceDate: string | Date
): StreakStats {
  const refStr = normalizeDate(referenceDate);
  const completedMap = getCompletedDateMap(habit, entries);
  const completedDates = Array.from(completedMap.keys()).sort();

  const isCompletedToday = completedMap.has(refStr);
  const totalCompletions = completedMap.size;

  let currentStreak = 0;
  let longestStreak = 0;

  if (habit.frequency === "weekly") {
    const target = Math.max(1, habit.frequencyTarget || 1);
    const currentWeekMon = getMondayOfWeek(refStr);
    const currentWeekSun = addDays(currentWeekMon, 6);

    // 1. Evaluate current week completions up to reference date
    let currentWeekCompletions = 0;
    let d = currentWeekMon;
    while (d <= currentWeekSun) {
      if (d <= refStr && completedMap.has(d)) {
        currentWeekCompletions++;
      }
      d = addDays(d, 1);
    }

    const currentWeekQualifies = currentWeekCompletions >= target;
    const isCurrentWeekActive = refStr <= currentWeekSun;

    if (currentWeekQualifies) {
      currentStreak = 1;
      let prevMon = addDays(currentWeekMon, -7);
      while (true) {
        const prevSun = addDays(prevMon, 6);
        let weekCompletions = 0;
        let wd = prevMon;
        while (wd <= prevSun) {
          if (completedMap.has(wd)) {
            weekCompletions++;
          }
          wd = addDays(wd, 1);
        }

        if (weekCompletions >= target) {
          currentStreak++;
          prevMon = addDays(prevMon, -7);
        } else {
          break;
        }
      }
    } else if (isCurrentWeekActive) {
      // Incomplete active week: grace period allows streak from previous completed weeks to persist
      let prevMon = addDays(currentWeekMon, -7);
      while (true) {
        const prevSun = addDays(prevMon, 6);
        let weekCompletions = 0;
        let wd = prevMon;
        while (wd <= prevSun) {
          if (completedMap.has(wd)) {
            weekCompletions++;
          }
          wd = addDays(wd, 1);
        }

        if (weekCompletions >= target) {
          currentStreak++;
          prevMon = addDays(prevMon, -7);
        } else {
          break;
        }
      }
    } else {
      // Current week passed without reaching target
      currentStreak = 0;
    }

    // Longest streak across all recorded weeks in history
    if (completedDates.length === 0) {
      longestStreak = currentStreak;
    } else {
      const earliestMon = getMondayOfWeek(completedDates[0]);
      let maxWeeklyStreak = 0;
      let runningWeeklyStreak = 0;
      let checkMon = earliestMon;

      while (checkMon <= currentWeekMon) {
        const checkSun = addDays(checkMon, 6);
        let weekCount = 0;
        let wd = checkMon;
        while (wd <= checkSun) {
          if (completedMap.has(wd)) {
            weekCount++;
          }
          wd = addDays(wd, 1);
        }

        if (weekCount >= target) {
          runningWeeklyStreak++;
          if (runningWeeklyStreak > maxWeeklyStreak) {
            maxWeeklyStreak = runningWeeklyStreak;
          }
        } else if (checkMon === currentWeekMon && isCurrentWeekActive) {
          // Do not reset running streak if current week is active
        } else {
          runningWeeklyStreak = 0;
        }

        checkMon = addDays(checkMon, 7);
      }

      longestStreak = Math.max(maxWeeklyStreak, currentStreak);
    }
  } else {
    // Scheduled-day habits: daily, weekdays, specific_days, custom
    const isRefScheduled = isScheduledDay(habit, refStr);

    if (isRefScheduled && isCompletedToday) {
      currentStreak = 1;
      let checkDate = addDays(refStr, -1);
      while (true) {
        while (!isScheduledDay(habit, checkDate)) {
          checkDate = addDays(checkDate, -1);
        }
        if (completedMap.has(checkDate)) {
          currentStreak++;
          checkDate = addDays(checkDate, -1);
        } else {
          break;
        }
      }
    } else {
      // Either active scheduled day incomplete (grace period),
      // or non-scheduled day (rest day).
      // Look back to the most recent scheduled day before refStr.
      let checkDate = addDays(refStr, -1);
      while (!isScheduledDay(habit, checkDate)) {
        checkDate = addDays(checkDate, -1);
      }

      if (completedMap.has(checkDate)) {
        currentStreak = 1;
        checkDate = addDays(checkDate, -1);
        while (true) {
          while (!isScheduledDay(habit, checkDate)) {
            checkDate = addDays(checkDate, -1);
          }
          if (completedMap.has(checkDate)) {
            currentStreak++;
            checkDate = addDays(checkDate, -1);
          } else {
            break;
          }
        }
      } else {
        currentStreak = 0;
      }
    }

    // Compute longest consecutive scheduled occurrence streak in history
    if (completedDates.length === 0) {
      longestStreak = currentStreak;
    } else {
      let maxConsecutive = 0;
      let running = 0;
      let prevDate: string | null = null;

      for (const d of completedDates) {
        if (!isScheduledDay(habit, d)) {
          // Ignore completions on non-scheduled days
          continue;
        }

        if (prevDate === null) {
          running = 1;
        } else {
          let hasMissedScheduled = false;
          let walk = addDays(prevDate, 1);
          while (walk < d) {
            if (isScheduledDay(habit, walk)) {
              hasMissedScheduled = true;
              break;
            }
            walk = addDays(walk, 1);
          }

          if (hasMissedScheduled) {
            running = 1;
          } else {
            running++;
          }
        }

        if (running > maxConsecutive) {
          maxConsecutive = running;
        }
        prevDate = d;
      }

      longestStreak = Math.max(maxConsecutive, currentStreak);
    }
  }

  // Rolling 30-day window: [referenceDate - 29 days, referenceDate]
  const start30d = addDays(refStr, -29);
  const completionRate30d = calculateCompletionRate(
    habit,
    entries,
    start30d,
    refStr
  );

  // All-time window: from earliest completed entry (or habit creation) up to referenceDate
  let earliestDate = refStr;
  if (completedDates.length > 0 && completedDates[0] < earliestDate) {
    earliestDate = completedDates[0];
  }
  if (habit.createdAt) {
    const createdStr = normalizeDate(habit.createdAt);
    if (createdStr < earliestDate) {
      earliestDate = createdStr;
    }
  }
  const completionRateAllTime = calculateCompletionRate(
    habit,
    entries,
    earliestDate,
    refStr
  );

  return {
    currentStreak,
    longestStreak,
    completionRate30d,
    completionRateAllTime,
    isCompletedToday,
    totalCompletions,
  };
}

/**
 * Returns an array of calendar day summaries for the last `daysCount` days ending on `referenceDate`.
 * Used for dot strips, completion matrices, and streak history visualizations.
 */
export function getStreakCalendar(
  habit: HabitStreakConfig,
  entries: HabitEntryRecord[],
  daysCount: number = 7,
  referenceDate: string | Date = new Date()
): StreakDayInfo[] {
  const refStr = normalizeDate(referenceDate);
  const count = Math.max(1, daysCount);
  const startStr = addDays(refStr, -(count - 1));

  const entryByDate = new Map<string, HabitEntryRecord>();
  for (const entry of entries) {
    const d = normalizeDate(entry.date);
    const existing = entryByDate.get(d);
    if (!existing || entry.value > existing.value) {
      entryByDate.set(d, entry);
    }
  }

  const result: StreakDayInfo[] = [];
  let cur = startStr;
  const defaultTarget = habit.targetValue > 0 ? habit.targetValue : 1;

  while (cur <= refStr) {
    const entry = entryByDate.get(cur);
    const val = entry ? entry.value : 0;
    const dayTarget =
      entry?.targetValue !== undefined &&
      entry?.targetValue !== null &&
      entry?.targetValue > 0
        ? entry.targetValue
        : defaultTarget;
    const scheduled = isScheduledDay(habit, cur);
    const completed = val >= dayTarget;

    let status: "completed" | "missed" | "rest" | "pending";
    if (completed) {
      status = "completed";
    } else if (!scheduled) {
      status = "rest";
    } else if (cur === refStr) {
      status = "pending";
    } else {
      status = "missed";
    }

    result.push({
      date: cur,
      isScheduled: scheduled,
      isCompleted: completed,
      value: val,
      targetValue: dayTarget,
      status,
    });

    cur = addDays(cur, 1);
  }

  return result;
}
