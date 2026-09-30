import { eq, and } from "drizzle-orm";
import { db } from "@/server/db";
import { dailyPlans, eveningReviews } from "@/server/db/schema";
import { getUserPreferences } from "@/server/preferences/service";
import { eventBus } from "@/server/events";
import { createDomainEvent } from "@/server/events/types";
import { createNotification } from "@/server/notifications/service";
import {
  acquireJobLock,
  completeJobLock,
  failJobLock,
} from "../lock-service";
import {
  generateDailyIdempotencyKey,
  getDatePartsInTimezone,
} from "../cron";
import type {
  PeriodicSweeper,
  SchedulerJobResult,
  SweeperContext,
} from "../types";

export const planningPromptsSweeper: PeriodicSweeper = {
  name: "planning_prompts",

  async run(userId: string, context?: SweeperContext): Promise<SchedulerJobResult> {
    const startTime = performance.now();
    const referenceDate = context?.referenceDate ?? new Date();

    // 1. Resolve user timezone and preferences
    let timezone = context?.timezone;
    if (!timezone) {
      try {
        const prefs = await getUserPreferences(userId);
        timezone = prefs?.timezone || "UTC";
      } catch {
        timezone = "UTC";
      }
    }

    const { dateStr, timeStr, hour, minute } = getDatePartsInTimezone(
      referenceDate,
      timezone
    );
    const currentTotalMinutes = hour * 60 + minute;

    let executedActions: string[] = [];
    let skippedReasons: string[] = [];

    // Morning window: 08:00 to 12:00 local time
    const morningStart = 8 * 60; // 08:00
    const morningEnd = 12 * 60; // 12:00
    const inMorningWindow =
      currentTotalMinutes >= morningStart && currentTotalMinutes < morningEnd;

    // Evening window: 21:00 to 23:59 local time
    const eveningStart = 21 * 60; // 21:00
    const inEveningWindow = currentTotalMinutes >= eveningStart;

    // 2. Evaluate Morning Routine Prompt
    if (inMorningWindow) {
      // Check if daily plan for today has already been started or completed
      const [existingPlan] = await db
        .select()
        .from(dailyPlans)
        .where(and(eq(dailyPlans.userId, userId), eq(dailyPlans.date, dateStr)))
        .limit(1);

      const hasStarted =
        existingPlan &&
        (existingPlan.status === "completed" ||
          (Array.isArray(existingPlan.priorityTaskIds) &&
            existingPlan.priorityTaskIds.length > 0) ||
          Boolean(existingPlan.morningNotes));

      if (hasStarted) {
        skippedReasons.push("Morning plan already started or completed for today");
      } else {
        const morningKey = generateDailyIdempotencyKey(
          "morning_plan",
          userId,
          dateStr
        );

        const acquired = await acquireJobLock(
          userId,
          "morning_plan",
          morningKey
        );

        if (acquired) {
          try {
            await eventBus.publish(
              createDomainEvent("system.morning_routine_due", userId, {
                userId,
                date: dateStr,
                targetHour: "08:00",
              })
            );

            await createNotification(userId, {
              title: "Plan Your Day",
              message:
                "Good morning! Set your focus priorities and daily intentions for today.",
              type: "reminder",
              entityType: "system",
              linkUrl: "/daily-plan",
              metadata: {
                date: dateStr,
                promptType: "morning_plan",
              },
            });

            await completeJobLock(userId, morningKey);
            executedActions.push("morning_plan");
          } catch (morningErr) {
            console.error(
              `[planningPromptsSweeper] Failed dispatching morning prompt for user ${userId}:`,
              morningErr
            );
            await failJobLock(userId, morningKey);
            throw morningErr;
          }
        } else {
          skippedReasons.push("Morning prompt already delivered for today");
        }
      }
    }

    // 3. Evaluate Evening Review Prompt
    if (inEveningWindow) {
      // Check if evening review for today has been completed
      const [existingReview] = await db
        .select()
        .from(eveningReviews)
        .where(and(eq(eveningReviews.userId, userId), eq(eveningReviews.date, dateStr)))
        .limit(1);

      const isCompleted = existingReview && Boolean(existingReview.completedAt);

      if (isCompleted) {
        skippedReasons.push("Evening review already completed for today");
      } else {
        const eveningKey = generateDailyIdempotencyKey(
          "evening_review",
          userId,
          dateStr
        );

        const acquired = await acquireJobLock(
          userId,
          "evening_review",
          eveningKey
        );

        if (acquired) {
          try {
            await eventBus.publish(
              createDomainEvent("system.evening_review_due", userId, {
                userId,
                date: dateStr,
                targetHour: "21:00",
              })
            );

            await createNotification(userId, {
              title: "Daily Evening Review",
              message:
                "Take a few moments to review your accomplishments and close out your day.",
              type: "reminder",
              entityType: "system",
              linkUrl: "/daily-plan",
              metadata: {
                date: dateStr,
                promptType: "evening_review",
              },
            });

            await completeJobLock(userId, eveningKey);
            executedActions.push("evening_review");
          } catch (eveningErr) {
            console.error(
              `[planningPromptsSweeper] Failed dispatching evening review prompt for user ${userId}:`,
              eveningErr
            );
            await failJobLock(userId, eveningKey);
            throw eveningErr;
          }
        } else {
          skippedReasons.push("Evening review prompt already delivered for today");
        }
      }
    }

    if (!inMorningWindow && !inEveningWindow) {
      skippedReasons.push(
        `Outside planning prompt windows (local time: ${timeStr} ${timezone})`
      );
    }

    const durationMs = Math.round(performance.now() - startTime);

    return {
      jobName: "planning_prompts",
      userId,
      executed: executedActions.length > 0,
      skippedReason:
        executedActions.length === 0 ? skippedReasons.join("; ") : undefined,
      durationMs,
      details: {
        dateStr,
        timeStr,
        timezone,
        executedActions,
      },
    };
  },
};
