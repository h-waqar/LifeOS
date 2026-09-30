import { eq, and, inArray, isNull, lt } from "drizzle-orm";
import { db } from "@/server/db";
import { goals } from "@/server/db/schema";
import { toGoalDTO } from "@/server/goals/service";
import { eventBus } from "@/server/events";
import { createDomainEvent } from "@/server/events/types";
import { createNotification } from "@/server/notifications/service";
import {
  acquireJobLock,
  completeJobLock,
  failJobLock,
} from "../lock-service";
import {
  generateEntityIdempotencyKey,
  getDatePartsInTimezone,
} from "../cron";
import type {
  PeriodicSweeper,
  SchedulerJobResult,
  SweeperContext,
} from "../types";

export const stagnantGoalsSweeper: PeriodicSweeper = {
  name: "stagnant_goals",

  async run(userId: string, context?: SweeperContext): Promise<SchedulerJobResult> {
    const startTime = performance.now();
    const referenceDate = context?.referenceDate ?? new Date();
    const timezone = context?.timezone ?? "UTC";
    const dateStr = getDatePartsInTimezone(referenceDate, timezone).dateStr;

    let processedCount = 0;
    let lockedCount = 0;
    let failedCount = 0;

    try {
      // 14 days of inactivity threshold
      const fourteenDaysAgo = new Date(
        referenceDate.getTime() - 14 * 24 * 60 * 60 * 1000
      );

      // Query active goals with no updates in 14+ days for this tenant
      const candidateGoals = await db
        .select()
        .from(goals)
        .where(
          and(
            eq(goals.userId, userId),
            inArray(goals.status, ["in_progress", "not_started"]),
            isNull(goals.completedAt),
            lt(goals.updatedAt, fourteenDaysAgo)
          )
        )
        .limit(100);

      processedCount = candidateGoals.length;

      for (const goal of candidateGoals) {
        const daysWithoutProgress = Math.max(
          14,
          Math.floor(
            (referenceDate.getTime() - goal.updatedAt.getTime()) /
              (24 * 60 * 60 * 1000)
          )
        );

        const idempotencyKey = generateEntityIdempotencyKey(
          "stagnant_goals",
          userId,
          goal.id,
          dateStr
        );

        const acquired = await acquireJobLock(
          userId,
          "stagnant_goals",
          idempotencyKey
        );

        if (!acquired) {
          // Already notified today for this stagnant goal
          continue;
        }

        lockedCount++;

        try {
          const goalDTO = toGoalDTO(goal);

          // Emit goal.stagnant domain event
          await eventBus.publish(
            createDomainEvent("goal.stagnant", userId, {
              goal: goalDTO,
              daysWithoutProgress,
            })
          );

          // Dispatch in-app notification
          await createNotification(userId, {
            title: `Goal Needs Attention: ${goal.title}`,
            message: `Goal "${goal.title}" has had no progress updates for ${daysWithoutProgress} days.`,
            type: "warning",
            entityType: "goal",
            entityId: goal.id,
            linkUrl: `/goals?id=${goal.id}`,
            metadata: {
              goalId: goal.id,
              daysWithoutProgress,
              lastUpdatedAt: goal.updatedAt.toISOString(),
            },
          });

          await completeJobLock(userId, idempotencyKey);
        } catch (goalErr) {
          failedCount++;
          console.error(
            `[stagnantGoalsSweeper] Failed processing stagnant goal ${goal.id}:`,
            goalErr
          );
          await failJobLock(userId, idempotencyKey);
        }
      }

      const durationMs = Math.round(performance.now() - startTime);

      return {
        jobName: "stagnant_goals",
        userId,
        executed: lockedCount > 0,
        skippedReason:
          lockedCount === 0
            ? processedCount === 0
              ? "No stagnant goals found"
              : "All stagnant goals already notified today"
            : undefined,
        durationMs,
        details: {
          totalFound: processedCount,
          newlyNotified: lockedCount - failedCount,
          failedCount,
        },
      };
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - startTime);
      return {
        jobName: "stagnant_goals",
        userId,
        executed: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs,
      };
    }
  },
};
