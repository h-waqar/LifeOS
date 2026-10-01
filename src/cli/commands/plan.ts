/**
 * CLI Daily Planning Commands: plan morning, plan evening
 *
 * Strictly delegates to canonical daily planning service (@/server/daily-plan/service)
 * and canonical Zod validation schemas (saveMorningPlanSchema, completeEveningReviewSchema, executeRolloverSchema).
 */

import {
  getDailyPlan,
  saveMorningPlan,
  completeEveningReview,
  executeRollover,
} from "@/server/daily-plan/service";
import {
  saveMorningPlanSchema,
  completeEveningReviewSchema,
  executeRolloverSchema,
} from "@/server/daily-plan/validation";
import { assertNoCallerSpoofing } from "../auth";
import { UsageError } from "../errors";
import type { CommandResult, ParsedArgs, CommandContext } from "../types";
import { executeAgentOperation } from "@/server/agents/safety-boundary";

async function runPlanWorkflow(
  parsed: ParsedArgs,
  userId: string,
  workflow: string
): Promise<CommandResult<unknown>> {
  const date = (parsed.flags.date as string) || new Date().toISOString().slice(0, 10);

  if (workflow === "morning") {
    const hasUpdateFlags =
      parsed.flags.priorityTasks !== undefined ||
      parsed.flags["priority-tasks"] !== undefined ||
      parsed.flags.habitIntentions !== undefined ||
      parsed.flags["habit-intentions"] !== undefined ||
      parsed.flags.notes !== undefined ||
      parsed.flags.morningNotes !== undefined ||
      parsed.flags["morning-notes"] !== undefined ||
      parsed.flags.complete === true;

    if (!hasUpdateFlags) {
      // Inspect mode
      const planContext = await getDailyPlan(userId, date);
      const isCompleted = planContext.plan?.status === "completed";
      const priorityCount = planContext.plan?.priorityTaskIds?.length ?? planContext.priorityTasks.length;
      const habitsCount = planContext.plan?.habitIntentionIds?.length ?? planContext.todayHabits.length;

      return {
        data: planContext,
        tableData: {
          columns: [
            { key: "field", label: "Property", width: 22 },
            { key: "value", label: "Value", width: 44 },
          ],
          rows: [
            { field: "Date", value: planContext.date },
            { field: "Morning Planned", value: isCompleted ? "yes" : "no" },
            { field: "Priority Tasks Count", value: priorityCount },
            { field: "Habit Intentions Count", value: habitsCount },
            { field: "Overdue Tasks Count", value: planContext.overdueTasks.length },
            { field: "Morning Notes", value: planContext.plan?.morningNotes || "-" },
          ],
          title: `Morning Plan (${date})`,
        },
      };
    }

    // Save/complete morning plan
    let priorityTaskIds: string[] = [];
    const rawPriority = parsed.flags.priorityTasks || parsed.flags["priority-tasks"];
    if (rawPriority) {
      priorityTaskIds = Array.isArray(rawPriority)
        ? (rawPriority as string[])
        : String(rawPriority).split(",").map((s) => s.trim()).filter(Boolean);
    }

    let habitIntentionIds: string[] = [];
    const rawHabits = parsed.flags.habitIntentions || parsed.flags["habit-intentions"];
    if (rawHabits) {
      habitIntentionIds = Array.isArray(rawHabits)
        ? (rawHabits as string[])
        : String(rawHabits).split(",").map((s) => s.trim()).filter(Boolean);
    }

    const morningNotes =
      (parsed.flags.notes as string) ||
      (parsed.flags.morningNotes as string) ||
      (parsed.flags["morning-notes"] as string) ||
      null;

    const rawInput = {
      date,
      priorityTaskIds,
      habitIntentionIds,
      morningNotes,
      complete: parsed.flags.complete === true,
    };

    const validated = saveMorningPlanSchema.parse(rawInput);
    const saved = await saveMorningPlan(userId, validated);

    return {
      data: saved,
      message: `Morning plan for ${date} saved successfully (status: ${saved.status}).`,
    };
  }

  if (workflow === "evening") {
    const hasReviewFlags =
      parsed.flags.rating !== undefined ||
      parsed.flags.selfRating !== undefined ||
      parsed.flags["self-rating"] !== undefined ||
      parsed.flags.reflections !== undefined ||
      parsed.flags.positiveReflections !== undefined ||
      parsed.flags["positive-reflections"] !== undefined ||
      parsed.flags.challenges !== undefined ||
      parsed.flags.challengesReflections !== undefined ||
      parsed.flags["challenges-reflections"] !== undefined ||
      parsed.flags.notes !== undefined ||
      parsed.flags.rollover !== undefined;

    if (!hasReviewFlags) {
      // Inspect mode
      const planContext = await getDailyPlan(userId, date);
      const isCompleted = planContext.review !== null;
      const rating = planContext.review?.productivityScore
        ? `${planContext.review.productivityScore}/10`
        : "-";
      const completedTasks = planContext.review?.completedTaskIds?.length ?? 0;
      const incompleteTasks = planContext.review?.incompleteTaskIds?.length ?? planContext.priorityTasks.length;
      const completedHabits = planContext.review?.completedHabitIds?.length ?? 0;

      return {
        data: planContext,
        tableData: {
          columns: [
            { key: "field", label: "Property", width: 22 },
            { key: "value", label: "Value", width: 44 },
          ],
          rows: [
            { field: "Date", value: planContext.date },
            { field: "Evening Review Completed", value: isCompleted ? "yes" : "no" },
            { field: "Productivity Score", value: rating },
            { field: "Completed Tasks", value: completedTasks },
            { field: "Pending Tasks", value: incompleteTasks },
            { field: "Completed Habits", value: completedHabits },
            { field: "Reflections", value: planContext.review?.positiveReflections || "-" },
          ],
          title: `Evening Review (${date})`,
        },
      };
    }

    // Submit evening review
    const rawRating = parsed.flags.rating ?? parsed.flags.selfRating ?? parsed.flags["self-rating"];
    const selfRating = rawRating !== undefined ? Number(rawRating) : null;

    const positiveReflections =
      (parsed.flags.reflections as string) ||
      (parsed.flags.positiveReflections as string) ||
      (parsed.flags["positive-reflections"] as string) ||
      null;

    const challengesReflections =
      (parsed.flags.challenges as string) ||
      (parsed.flags.challengesReflections as string) ||
      (parsed.flags["challenges-reflections"] as string) ||
      null;

    const notes = (parsed.flags.notes as string) || null;

    const rawInput = {
      date,
      selfRating,
      positiveReflections,
      challengesReflections,
      notes,
    };

    const validated = completeEveningReviewSchema.parse(rawInput);
    const reviewed = await completeEveningReview(userId, validated);

    // If rollover specified
    let rolloverResult: unknown = null;
    const rawRollover = parsed.flags.rollover;
    if (rawRollover) {
      let actions: any[] = [];
      try {
        actions = typeof rawRollover === "string" ? JSON.parse(rawRollover) : rawRollover;
      } catch {
        throw new UsageError("--rollover must be a valid JSON array of rollover actions.");
      }

      const rolloverValidated = executeRolloverSchema.parse({
        date,
        actions: Array.isArray(actions) ? actions : [actions],
      });
      rolloverResult = await executeRollover(userId, rolloverValidated);
    }

    return {
      data: {
        review: reviewed,
        rollover: rolloverResult,
      },
      message: `Evening review for ${date} completed successfully.${rolloverResult ? " Rollover executed." : ""}`,
    };
  }

  throw new UsageError(`Unknown plan workflow: '${workflow}'. Valid workflows: morning, evening.`);
}

export async function handlePlan(
  parsed: ParsedArgs,
  context?: CommandContext
): Promise<CommandResult<unknown>> {
  assertNoCallerSpoofing(parsed.flags);
  if (!context) {
    throw new Error("Command requires an authenticated context.");
  }

  const userId = context.user.id;
  const workflow = parsed.subcommands[1]?.toLowerCase();

  if (!workflow) {
    throw new UsageError("Workflow required: 'lifeos plan morning' or 'lifeos plan evening'");
  }

  if (context.isAgent) {
    const op = `plan.${workflow}`;
    const challengeId = (parsed.flags.challengeId || parsed.flags.challenge) as string | undefined;

    const result = await executeAgentOperation({
      context: {
        isAgent: true,
        agent: context.agent,
        user: context.user,
        sessionId: context.session?.id,
      },
      toolName: op,
      arguments: { ...parsed.flags, subcommands: parsed.subcommands } as Record<string, unknown>,
      challengeId,
      targetUserId: userId,
      executor: () => runPlanWorkflow(parsed, userId, workflow),
    });

    if (result.status === "CHALLENGE_REQUIRED") {
      return {
        data: result,
        message: result.message,
      };
    }

    return result.data as CommandResult<unknown>;
  }

  return runPlanWorkflow(parsed, userId, workflow);
}

