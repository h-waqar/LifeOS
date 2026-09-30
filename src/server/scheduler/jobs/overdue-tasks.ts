import { eq, and, notInArray, isNotNull, lt } from "drizzle-orm";
import { db } from "@/server/db";
import { tasks } from "@/server/db/schema";
import { toTaskDTO } from "@/server/tasks/service";
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

export const overdueTasksSweeper: PeriodicSweeper = {
  name: "overdue_tasks",

  async run(userId: string, context?: SweeperContext): Promise<SchedulerJobResult> {
    const startTime = performance.now();
    const referenceDate = context?.referenceDate ?? new Date();
    const timezone = context?.timezone ?? "UTC";
    const dateStr = getDatePartsInTimezone(referenceDate, timezone).dateStr;

    let processedCount = 0;
    let lockedCount = 0;
    let failedCount = 0;

    try {
      // 1. Query overdue, uncompleted tasks for this tenant with bounded limit
      const candidateTasks = await db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, userId),
            notInArray(tasks.status, ["completed", "cancelled"]),
            isNotNull(tasks.dueDate),
            lt(tasks.dueDate, referenceDate)
          )
        )
        .limit(100);

      processedCount = candidateTasks.length;

      // 2. Iterate each task with isolated error boundary and distributed idempotency lock
      for (const task of candidateTasks) {
        if (!task.dueDate) continue;

        const daysOverdue = Math.max(
          1,
          Math.floor(
            (referenceDate.getTime() - task.dueDate.getTime()) /
              (24 * 60 * 60 * 1000)
          )
        );

        const idempotencyKey = generateEntityIdempotencyKey(
          "overdue_tasks",
          userId,
          task.id,
          dateStr
        );

        const acquired = await acquireJobLock(
          userId,
          "overdue_tasks",
          idempotencyKey
        );

        if (!acquired) {
          // Already notified for this calendar day
          continue;
        }

        lockedCount++;

        try {
          const taskDTO = toTaskDTO(task);

          // Emit task.overdue domain event
          await eventBus.publish(
            createDomainEvent("task.overdue", userId, {
              task: taskDTO,
              daysOverdue,
            })
          );

          // Dispatch in-app notification
          await createNotification(userId, {
            title: `Overdue Task: ${task.title}`,
            message: `Task "${task.title}" is ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue.`,
            type: "warning",
            entityType: "task",
            entityId: task.id,
            linkUrl: `/tasks?id=${task.id}`,
            metadata: {
              daysOverdue,
              dueDate: task.dueDate.toISOString(),
            },
          });

          await completeJobLock(userId, idempotencyKey);
        } catch (taskErr) {
          failedCount++;
          console.error(
            `[overdueTasksSweeper] Failed processing overdue task ${task.id}:`,
            taskErr
          );
          await failJobLock(userId, idempotencyKey);
        }
      }

      const durationMs = Math.round(performance.now() - startTime);

      return {
        jobName: "overdue_tasks",
        userId,
        executed: lockedCount > 0,
        skippedReason:
          lockedCount === 0
            ? processedCount === 0
              ? "No overdue tasks found"
              : "All overdue tasks already notified today"
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
        jobName: "overdue_tasks",
        userId,
        executed: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs,
      };
    }
  },
};
