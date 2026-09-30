import { getDailyPlan } from "@/server/daily-plan/service";
import { listTasks } from "@/server/tasks/service";
import { listTimeBlocks } from "@/server/calendar/service";
import { sanitizeForPrompt } from "./sanitizer";

export interface OperationalSnapshot {
  date: string;
  dailyPlan: {
    hasPlan: boolean;
    status: string;
    focusTaskCount: number;
    notes?: string | null;
  };
  overdueTasks: Array<{
    id: string;
    title: string;
    priority: string;
    dueDate: string | null;
    priorityScore: number;
  }>;
  scheduledBlocks: Array<{
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    status: string;
  }>;
  formattedXml: string;
}

/**
 * Aggregates live operational state (daily plan, overdue tasks, today's schedule)
 * into a compact, budget-controlled XML snippet (~800 tokens).
 */
export async function getOperationalSnapshot(
  userId: string,
  referenceDate: Date = new Date()
): Promise<OperationalSnapshot> {
  const dateString = referenceDate.toISOString().slice(0, 10);
  const dayStart = new Date(`${dateString}T00:00:00.000Z`);
  const dayEnd = new Date(`${dateString}T23:59:59.999Z`);

  let dailyPlanData = {
    hasPlan: false,
    status: "none",
    focusTaskCount: 0,
    notes: null as string | null,
  };

  try {
    const planContext = await getDailyPlan(userId, dateString);
    if (planContext?.plan) {
      dailyPlanData = {
        hasPlan: true,
        status: planContext.plan.status,
        focusTaskCount: planContext.plan.priorityTaskIds.length,
        notes: planContext.plan.morningNotes,
      };
    }
  } catch {
    // If daily plan table is empty or error occurs, fall back gracefully
  }

  let overdueTasksList: Array<{
    id: string;
    title: string;
    priority: string;
    dueDate: string | null;
    priorityScore: number;
  }> = [];

  try {
    const pendingTasks = await listTasks(userId, {
      status: "pending",
    });

    const nowIso = referenceDate.toISOString();
    const overdueOrCritical = pendingTasks
      .filter((t) => t.dueDate && t.dueDate < nowIso)
      .sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0))
      .slice(0, 3);

    overdueTasksList = overdueOrCritical.map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      dueDate: t.dueDate,
      priorityScore: t.priorityScore ?? 0,
    }));
  } catch {
    // Fall back gracefully
  }

  let scheduledBlocksList: Array<{
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    status: string;
  }> = [];

  try {
    const blocks = await listTimeBlocks(userId, {
      startDate: dayStart.toISOString(),
      endDate: dayEnd.toISOString(),
    });

    scheduledBlocksList = blocks.slice(0, 5).map((b) => ({
      id: b.id,
      title: b.title,
      startTime: b.startTime,
      endTime: b.endTime,
      status: b.status,
    }));
  } catch {
    // Fall back gracefully
  }

  // Format XML
  const lines: string[] = ['<user_state working_hours="09:00-18:00">'];

  lines.push(
    `  <daily_plan status="${dailyPlanData.status}" has_plan="${dailyPlanData.hasPlan}" focus_items="${dailyPlanData.focusTaskCount}" />`
  );

  lines.push(`  <overdue_tasks count="${overdueTasksList.length}">`);
  for (const t of overdueTasksList) {
    const safeTitle = sanitizeForPrompt(t.title);
    lines.push(
      `    <task id="${t.id}" title="${safeTitle}" priority="${t.priority}" due="${t.dueDate || ""}" priority_score="${t.priorityScore}" />`
    );
  }
  lines.push("  </overdue_tasks>");

  lines.push(`  <today_schedule count="${scheduledBlocksList.length}">`);
  for (const b of scheduledBlocksList) {
    const safeTitle = sanitizeForPrompt(b.title);
    const startHour = b.startTime.slice(11, 16);
    const endHour = b.endTime.slice(11, 16);
    lines.push(
      `    <block id="${b.id}" title="${safeTitle}" start="${startHour}" end="${endHour}" status="${b.status}" />`
    );
  }
  lines.push("  </today_schedule>");

  lines.push("</user_state>");

  return {
    date: dateString,
    dailyPlan: dailyPlanData,
    overdueTasks: overdueTasksList,
    scheduledBlocks: scheduledBlocksList,
    formattedXml: lines.join("\n"),
  };
}
