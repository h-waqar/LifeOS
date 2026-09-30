import { listTasks } from "@/server/tasks/service";
import { listTimeBlocks } from "@/server/calendar/service";
import { listHabits } from "@/server/habits/service";
import {
  type DailyPlanningSuggestions,
  type RecommendedTask,
  type RecommendedTimeBlock,
  type PlanningWarning,
} from "./types";

/**
 * Generates proactive morning daily planning recommendations.
 * Combines overdue task analysis, calendar availability budgeting,
 * and habit cadence to propose the realistic Top 3 Focus Tasks.
 */
export async function generateDailySuggestions(
  userId: string,
  targetDateInput?: string | Date
): Promise<DailyPlanningSuggestions> {
  const dateObj = targetDateInput
    ? typeof targetDateInput === "string"
      ? new Date(targetDateInput)
      : targetDateInput
    : new Date();

  const dateString = dateObj.toISOString().slice(0, 10);

  // 1. Fetch live domain context in parallel
  const [overdueTasks, scheduledTasks, todoTasks, timeBlocks, habits] =
    await Promise.all([
      listTasks(userId, { overdue: true }).catch(() => []),
      listTasks(userId, { scheduledDate: dateString }).catch(() => []),
      listTasks(userId, { status: "todo" }).catch(() => []),
      listTimeBlocks(userId, {
        startDate: dateString,
        endDate: dateString,
      }).catch(() => []),
      listHabits(userId, { status: "active" }).catch(() => []),
    ]);

  // 2. Compute calendar busy minutes (assuming 9:00 AM - 5:00 PM work window = 480 mins)
  let totalBusyMinutes = 0;
  for (const block of timeBlocks) {
    if (block.status !== "cancelled") {
      const start = new Date(block.startTime).getTime();
      const end = new Date(block.endTime).getTime();
      const duration = Math.max(0, Math.round((end - start) / (1000 * 60)));
      totalBusyMinutes += duration;
    }
  }

  const WORK_DAY_CAPACITY_MINS = 480; // 8 hours
  const totalFreeMinutes = Math.max(0, WORK_DAY_CAPACITY_MINS - totalBusyMinutes);

  // 3. Pool and deduplicate candidate tasks
  const candidateMap = new Map<string, any>();

  // Overdue tasks have highest urgency
  for (const t of overdueTasks) {
    candidateMap.set(t.id, {
      task: t,
      reason: t.dueDate
        ? `Overdue since ${t.dueDate.slice(0, 10)}`
        : "Overdue task",
      urgencyBonus: 100,
    });
  }

  // Scheduled tasks for today
  for (const t of scheduledTasks) {
    if (!candidateMap.has(t.id)) {
      candidateMap.set(t.id, {
        task: t,
        reason: "Scheduled for today",
        urgencyBonus: 50,
      });
    }
  }

  // Open todo tasks
  for (const t of todoTasks) {
    if (!candidateMap.has(t.id)) {
      const priorityBonus =
        t.priority === "critical"
          ? 40
          : t.priority === "high"
          ? 30
          : t.priority === "medium"
          ? 10
          : 0;
      candidateMap.set(t.id, {
        task: t,
        reason:
          t.priority === "critical" || t.priority === "high"
            ? `${t.priority.toUpperCase()} priority deliverable`
            : "High impact pending task",
        urgencyBonus: priorityBonus,
      });
    }
  }

  // Sort candidates by priorityScore + urgencyBonus
  const sortedCandidates = Array.from(candidateMap.values()).sort((a, b) => {
    const scoreA = (a.task.priorityScore ?? 0) + a.urgencyBonus;
    const scoreB = (b.task.priorityScore ?? 0) + b.urgencyBonus;
    return scoreB - scoreA;
  });

  // 4. Select top 3 focus tasks fitting into available capacity
  const focusTasks: RecommendedTask[] = [];
  let allocatedMinutes = 0;

  for (const item of sortedCandidates) {
    if (focusTasks.length >= 3) break;

    const estimatedDuration = item.task.estimatedDurationMinutes ?? 45;
    focusTasks.push({
      id: item.task.id,
      title: item.task.title,
      priority: item.task.priority ?? "medium",
      reason: item.reason,
      priorityScore: item.task.priorityScore ?? 50,
      estimatedDurationMinutes: estimatedDuration,
      dueDate: item.task.dueDate,
      projectName: item.task.projectName,
    });

    allocatedMinutes += estimatedDuration;
  }

  // 5. Generate time block recommendations for open slots
  const timeblockRecommendations: RecommendedTimeBlock[] = [];
  let currentHour = 9;

  for (const task of focusTasks) {
    if (currentHour >= 17) break;

    const startIso = `${dateString}T${String(currentHour).padStart(2, "0")}:00:00.000Z`;
    const endHour = currentHour + 1;
    const endIso = `${dateString}T${String(endHour).padStart(2, "0")}:00:00.000Z`;

    // Verify if slot conflicts with existing time blocks
    const slotConflict = timeBlocks.some((b) => {
      const bStart = new Date(b.startTime).getTime();
      const bEnd = new Date(b.endTime).getTime();
      const sStart = new Date(startIso).getTime();
      const sEnd = new Date(endIso).getTime();
      return Math.max(bStart, sStart) < Math.min(bEnd, sEnd);
    });

    if (!slotConflict) {
      timeblockRecommendations.push({
        title: `Deep Work: ${task.title}`,
        startTime: startIso,
        endTime: endIso,
        taskId: task.id,
        commitmentLevel: "soft",
        reason: `Focus block allocated for ${task.title}`,
      });
      currentHour += 2; // Add buffer
    } else {
      currentHour += 1;
    }
  }

  // 6. Generate warnings
  const warnings: PlanningWarning[] = [];
  if (overdueTasks.length > 0) {
    warnings.push({
      type: "overdue",
      message: `You have ${overdueTasks.length} overdue task(s) requiring immediate resolution.`,
    });
  }

  if (allocatedMinutes > totalFreeMinutes && totalFreeMinutes > 0) {
    warnings.push({
      type: "overload",
      message: `Focus tasks require ~${allocatedMinutes} mins, exceeding available free time of ${totalFreeMinutes} mins.`,
    });
  }

  // 7. Executive summary
  const freeHours = (totalFreeMinutes / 60).toFixed(1);
  const activeHabitsCount = habits.length;
  const summary = `You have ${freeHours} hours of free focus time today. We recommend tackling ${focusTasks.length} key priority items and staying consistent on ${activeHabitsCount} active habit(s).`;

  return {
    date: dateString,
    focusTasks,
    timeblockRecommendations,
    warnings,
    summary,
    totalFreeMinutes,
    overdueCount: overdueTasks.length,
  };
}
