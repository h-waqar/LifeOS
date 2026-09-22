import type { FollowUpStatus, PersonDTO } from "@/types";

/**
 * Calculates the follow-up status for a given target date relative to a reference date.
 * - "none": No follow-up date set
 * - "overdue": Target date is before start of today
 * - "today": Target date falls within today (00:00:00 - 23:59:59)
 * - "upcoming": Target date is after today
 */
export function calculateFollowUpStatus(
  nextFollowUpDate: Date | string | null | undefined,
  referenceDate: Date = new Date()
): FollowUpStatus {
  if (!nextFollowUpDate) {
    return "none";
  }

  const target =
    typeof nextFollowUpDate === "string"
      ? new Date(nextFollowUpDate)
      : nextFollowUpDate;

  if (isNaN(target.getTime())) {
    return "none";
  }

  const startOfToday = new Date(referenceDate);
  startOfToday.setHours(0, 0, 0, 0);

  const endOfToday = new Date(referenceDate);
  endOfToday.setHours(23, 59, 59, 999);

  if (target.getTime() < startOfToday.getTime()) {
    return "overdue";
  }

  if (target.getTime() <= endOfToday.getTime()) {
    return "today";
  }

  return "upcoming";
}

/**
 * Checks whether a follow-up is due within a given number of days (or already overdue / due today).
 */
export function isFollowUpDueWithinDays(
  nextFollowUpDate: Date | string | null | undefined,
  days: number = 7,
  referenceDate: Date = new Date()
): boolean {
  if (!nextFollowUpDate) return false;

  const target =
    typeof nextFollowUpDate === "string"
      ? new Date(nextFollowUpDate)
      : nextFollowUpDate;

  if (isNaN(target.getTime())) return false;

  const horizon = new Date(referenceDate);
  horizon.setDate(horizon.getDate() + days);
  horizon.setHours(23, 59, 59, 999);

  return target.getTime() <= horizon.getTime();
}

/**
 * Categorizes a list of people into follow-up reminder buckets.
 */
export function categorizeFollowUpReminders(
  people: PersonDTO[],
  referenceDate: Date = new Date()
): {
  overdue: PersonDTO[];
  today: PersonDTO[];
  upcoming: PersonDTO[];
  totalReminders: number;
} {
  const overdue: PersonDTO[] = [];
  const today: PersonDTO[] = [];
  const upcoming: PersonDTO[] = [];

  for (const person of people) {
    if (person.isArchived || !person.nextFollowUpDate) continue;

    const status = calculateFollowUpStatus(
      person.nextFollowUpDate,
      referenceDate
    );
    if (status === "overdue") {
      overdue.push(person);
    } else if (status === "today") {
      today.push(person);
    } else if (status === "upcoming") {
      // Include upcoming within 14 days
      if (isFollowUpDueWithinDays(person.nextFollowUpDate, 14, referenceDate)) {
        upcoming.push(person);
      }
    }
  }

  // Sort overdue by oldest first (most urgent)
  overdue.sort((a, b) => {
    const timeA = new Date(a.nextFollowUpDate!).getTime();
    const timeB = new Date(b.nextFollowUpDate!).getTime();
    return timeA - timeB;
  });

  // Sort today by time
  today.sort((a, b) => {
    const timeA = new Date(a.nextFollowUpDate!).getTime();
    const timeB = new Date(b.nextFollowUpDate!).getTime();
    return timeA - timeB;
  });

  // Sort upcoming by soonest first
  upcoming.sort((a, b) => {
    const timeA = new Date(a.nextFollowUpDate!).getTime();
    const timeB = new Date(b.nextFollowUpDate!).getTime();
    return timeA - timeB;
  });

  return {
    overdue,
    today,
    upcoming,
    totalReminders: overdue.length + today.length + upcoming.length,
  };
}

/**
 * Returns human-readable relative label for follow-up date.
 */
export function formatFollowUpLabel(
  nextFollowUpDate: Date | string | null | undefined,
  referenceDate: Date = new Date()
): string {
  if (!nextFollowUpDate) return "No follow-up";

  const target =
    typeof nextFollowUpDate === "string"
      ? new Date(nextFollowUpDate)
      : nextFollowUpDate;

  if (isNaN(target.getTime())) return "No follow-up";

  const startOfToday = new Date(referenceDate);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfTarget = new Date(target);
  startOfTarget.setHours(0, 0, 0, 0);

  const diffMs = startOfTarget.getTime() - startOfToday.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const absDays = Math.abs(diffDays);
    return absDays === 1 ? "Overdue by 1 day" : `Overdue by ${absDays} days`;
  }
  if (diffDays === 0) {
    return "Due today";
  }
  if (diffDays === 1) {
    return "Due tomorrow";
  }
  return `In ${diffDays} days`;
}
