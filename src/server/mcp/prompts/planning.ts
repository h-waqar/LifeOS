/**
 * MCP Standard Planning Prompt Templates
 *
 * Implements standard AI prompts:
 * 1. lifeos_morning_planning: Guides daily planning with live schedule, tasks, and habits.
 * 2. lifeos_evening_review: Guides evening reflection and task rollover.
 * 3. lifeos_task_breakdown: Decomposes high-level objectives into actionable atomic tasks.
 */

import { getDashboardOverview } from "@/server/dashboard/service";
import { getDailyPlan } from "@/server/daily-plan/service";
import { listTasks } from "@/server/tasks/service";
import { listTimeBlocks } from "@/server/calendar/service";
import { verifySessionActive } from "../auth";
import type { McpContext } from "../types";
import type { GetPromptResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Morning Planning Prompt Handler
 */
export async function handleMorningPlanningPrompt(
  context: McpContext,
  args?: { date?: string }
): Promise<GetPromptResult> {
  verifySessionActive(context);
  const userId = context.user.id;
  const targetDate = args?.date || new Date().toISOString().slice(0, 10);

  const [dashboard, dailyPlan, timeBlocks] = await Promise.all([
    getDashboardOverview(userId, targetDate).catch(() => null),
    getDailyPlan(userId, targetDate).catch(() => null),
    listTimeBlocks(userId, { startDate: targetDate, endDate: targetDate }).catch(() => []),
  ]);

  const scheduleSummary = (timeBlocks || [])
    .map((b) => `- ${new Date(b.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(b.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}: ${b.title || "Time Block"} [${b.status}]`)
    .join("\n") || "No calendar time blocks scheduled for today.";

  const topTasksSummary = (dashboard?.priorities.todayTasks || [])
    .slice(0, 5)
    .map((t) => `- [P${t.priority}] ${t.title}`)
    .join("\n") || "No pending priority tasks identified.";

  const habitsSummary = (dashboard?.habits.items || [])
    .map((h) => `- ${h.title} (${h.frequency})`)
    .join("\n") || "No daily habits configured.";

  const userPrompt = `You are Hamza's executive AI assistant conducting his morning planning session for ${targetDate}.

Context for ${targetDate}:
User: ${context.user.name} (${context.user.email})

## Scheduled Calendar Blocks
${scheduleSummary}

## Top Priority Tasks
${topTasksSummary}

## Daily Habit Intentions
${habitsSummary}

${dailyPlan?.plan?.morningNotes ? `## Morning Notes: ${dailyPlan.plan.morningNotes}` : ""}

Please guide Hamza through:
1. Reviewing calendar constraints and identifying available deep-work blocks.
2. Selecting 1-3 core needle-moving tasks from his priorities to commit to today.
3. Reviewing daily habit commitments and scheduling them realistically.
4. Setting a clear, positive daily intention. Keep your response encouraging, concise, and structured.`;

  return {
    description: `Morning planning prompt for ${targetDate}`,
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: userPrompt,
        },
      },
    ],
  };
}

/**
 * Evening Review Prompt Handler
 */
export async function handleEveningReviewPrompt(
  context: McpContext,
  args?: { date?: string }
): Promise<GetPromptResult> {
  verifySessionActive(context);
  const userId = context.user.id;
  const targetDate = args?.date || new Date().toISOString().slice(0, 10);

  const [allTasks, dailyPlan] = await Promise.all([
    listTasks(userId).catch(() => []),
    getDailyPlan(userId, targetDate).catch(() => null),
  ]);

  const completedToday = allTasks.filter(
    (t) => t.status === "completed" && t.updatedAt && new Date(t.updatedAt).toISOString().slice(0, 10) === targetDate
  );

  const pendingToday = allTasks.filter((t) => {
    if (t.status === "completed" || t.status === "cancelled") return false;
    const sched = t.scheduledDate ? new Date(t.scheduledDate).toISOString().slice(0, 10) : null;
    return sched === targetDate;
  });

  const completedSummary = completedToday.map((t) => `- [x] ${t.title}`).join("\n") || "None recorded today.";
  const pendingSummary = pendingToday.map((t) => `- [ ] ${t.title}`).join("\n") || "All scheduled tasks completed!";

  const userPrompt = `You are Hamza's executive AI assistant conducting his evening review session for ${targetDate}.

Context for ${targetDate}:
User: ${context.user.name} (${context.user.email})

## Tasks Completed Today (${completedToday.length})
${completedSummary}

## Tasks Still Pending (${pendingToday.length})
${pendingSummary}

${dailyPlan?.review?.positiveReflections ? `## Positive Reflections: ${dailyPlan.review.positiveReflections}` : ""}
${dailyPlan?.review?.notes ? `## Review Notes: ${dailyPlan.review.notes}` : ""}

Please guide Hamza through:
1. Celebrating what was accomplished today and logging the win of the day.
2. Reviewing incomplete tasks and deciding whether to reschedule them for tomorrow, backlog them, or drop them.
3. Conducting a brief reflection on energy, focus, and friction points.
4. Concluding the day with clarity so he can rest without open mental loops.`;

  return {
    description: `Evening review prompt for ${targetDate}`,
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: userPrompt,
        },
      },
    ],
  };
}

/**
 * Task Breakdown Prompt Handler
 */
export async function handleTaskBreakdownPrompt(
  context: McpContext,
  args: { title: string; goalId?: string; projectId?: string }
): Promise<GetPromptResult> {
  verifySessionActive(context);

  const userPrompt = `You are an expert project decomposition assistant helping ${context.user.name} decompose a high-level goal or task into atomic, executable steps.

Objective to decompose:
Title: "${args.title}"
${args.projectId ? `Project ID: ${args.projectId}` : ""}
${args.goalId ? `Goal ID: ${args.goalId}` : ""}

Please generate 3 to 7 concrete, sequenced subtasks following these criteria:
1. Atomic and actionable: each step starts with an imperative verb (e.g. "Draft", "Research", "Configure").
2. Estimated duration: provide a realistic time estimate in minutes (e.g. 15m, 30m, 60m).
3. Energy level: classify each as 'low', 'medium', or 'high' energy.
4. Clear order: sequence them so dependencies are completed before downstream work begins.
5. Format the output as a clean numbered list ready to be created as LifeOS tasks.`;

  return {
    description: `Task breakdown prompt for "${args.title}"`,
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: userPrompt,
        },
      },
    ],
  };
}
