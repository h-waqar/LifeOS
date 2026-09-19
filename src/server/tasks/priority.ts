// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Priority calculation cannot be executed in the browser."
  );
}

export type PrioritySeverity = "critical" | "high" | "medium" | "low";
export type TaskExecutionStatus =
  | "inbox"
  | "todo"
  | "in_progress"
  | "blocked"
  | "completed"
  | "cancelled";

export interface TaskPriorityInput {
  id?: string;
  priority?: PrioritySeverity | null;
  dueDate?: Date | string | null;
  scheduledDate?: Date | string | null;
  projectId?: string | null;
  goalId?: string | null;
  estimatedDuration?: number | null; // in minutes
  status?: TaskExecutionStatus | null;
  hasUncompletedDependencies?: boolean | null;
  createdAt?: Date | string | null;
}

/**
 * Calculates deterministic priority score for a task based on:
 * BaseScore (Eisenhower) + DeadlineWeight + ScheduledWeight + ProjectWeight + GoalWeight + EffortWeight - BlockedPenalty
 * Output integer is clamped between 0 and 250.
 */
export function calculateTaskPriorityScore(
  task: TaskPriorityInput,
  referenceDate: Date = new Date()
): number {
  const status = task.status || "inbox";

  // Terminal state: completed or cancelled tasks have score 0
  if (status === "completed" || status === "cancelled") {
    return 0;
  }

  // 1. Base Priority Score
  let baseScore = 40; // default medium
  switch (task.priority) {
    case "critical":
      baseScore = 100;
      break;
    case "high":
      baseScore = 70;
      break;
    case "medium":
      baseScore = 40;
      break;
    case "low":
      baseScore = 10;
      break;
  }

  // 2. Deadline Weighting
  let deadlineScore = 0;
  if (task.dueDate) {
    const due = typeof task.dueDate === "string" ? new Date(task.dueDate) : task.dueDate;
    if (!isNaN(due.getTime())) {
      const diffMs = due.getTime() - referenceDate.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffMs < 0) {
        // Overdue: +50 base overdue boost + min(30, floor(daysOverdue) * 5)
        const daysOverdue = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60 * 24));
        deadlineScore = 50 + Math.min(30, daysOverdue * 5);
      } else if (diffHours <= 24) {
        // Due today
        deadlineScore = 40;
      } else if (diffHours <= 48) {
        // Due tomorrow
        deadlineScore = 25;
      } else if (diffHours <= 168) {
        // Due this week (<= 7 days)
        deadlineScore = 15;
      } else if (diffHours <= 336) {
        // Due next week (<= 14 days)
        deadlineScore = 5;
      } else {
        // Future (> 14 days)
        deadlineScore = 0;
      }
    }
  }

  // 3. Scheduled Date Proximity
  let scheduledScore = 0;
  if (task.scheduledDate) {
    const sched =
      typeof task.scheduledDate === "string"
        ? new Date(task.scheduledDate)
        : task.scheduledDate;
    if (!isNaN(sched.getTime())) {
      const refEnd = new Date(referenceDate);
      refEnd.setHours(23, 59, 59, 999);
      if (sched.getTime() <= refEnd.getTime()) {
        scheduledScore = 15;
      }
    }
  }

  // 4. Project Alignment
  const projectScore = task.projectId ? 10 : 0;

  // 5. Goal Alignment
  const goalScore = task.goalId ? 10 : 0;

  // 6. Effort Weight (Quick-Win Momentum Factor)
  let effortScore = 0;
  if (task.estimatedDuration !== null && task.estimatedDuration !== undefined) {
    if (task.estimatedDuration <= 15) {
      effortScore = 5;
    } else if (task.estimatedDuration > 60) {
      effortScore = -5;
    }
  }

  // 7. Blocked / Dependency Penalty
  let blockedPenalty = 0;
  if (status === "blocked" || task.hasUncompletedDependencies) {
    blockedPenalty = 50;
  }

  const rawScore =
    baseScore +
    deadlineScore +
    scheduledScore +
    projectScore +
    goalScore +
    effortScore -
    blockedPenalty;

  return Math.max(0, Math.min(250, Math.round(rawScore)));
}

/**
 * Deterministic comparator for ordering tasks by priority ranking:
 * 1. priorityScore DESC
 * 2. dueDate ASC (nulls last)
 * 3. priority severity DESC (critical > high > medium > low)
 * 4. createdAt ASC (FIFO)
 * 5. id ASC (lexicographical)
 */
export function compareTasksByPriority(
  a: TaskPriorityInput,
  b: TaskPriorityInput,
  referenceDate: Date = new Date()
): number {
  const scoreA = calculateTaskPriorityScore(a, referenceDate);
  const scoreB = calculateTaskPriorityScore(b, referenceDate);

  if (scoreA !== scoreB) {
    return scoreB - scoreA; // DESC
  }

  // Due date ASC (nulls last)
  const dueA = a.dueDate
    ? typeof a.dueDate === "string"
      ? new Date(a.dueDate).getTime()
      : a.dueDate.getTime()
    : null;
  const dueB = b.dueDate
    ? typeof b.dueDate === "string"
      ? new Date(b.dueDate).getTime()
      : b.dueDate.getTime()
    : null;

  if (dueA !== null && dueB !== null) {
    if (dueA !== dueB) return dueA - dueB;
  } else if (dueA !== null && dueB === null) {
    return -1;
  } else if (dueA === null && dueB !== null) {
    return 1;
  }

  // Priority severity DESC
  const severityMap: Record<PrioritySeverity, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };
  const sevA = a.priority ? severityMap[a.priority] || 2 : 2;
  const sevB = b.priority ? severityMap[b.priority] || 2 : 2;
  if (sevA !== sevB) {
    return sevB - sevA; // DESC
  }

  // CreatedAt ASC (FIFO)
  const createdA = a.createdAt
    ? typeof a.createdAt === "string"
      ? new Date(a.createdAt).getTime()
      : a.createdAt.getTime()
    : 0;
  const createdB = b.createdAt
    ? typeof b.createdAt === "string"
      ? new Date(b.createdAt).getTime()
      : b.createdAt.getTime()
    : 0;
  if (createdA !== createdB) {
    return createdA - createdB;
  }

  // id ASC
  return (a.id || "").localeCompare(b.id || "");
}
