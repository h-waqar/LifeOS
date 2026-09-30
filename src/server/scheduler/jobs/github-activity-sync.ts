import { eq, and } from "drizzle-orm";
import { db } from "@/server/db";
import { integrationConnections } from "@/server/db/schema";
import { githubSyncEngine } from "@/server/integrations/github/sync-engine";
import {
  acquireJobLock,
  completeJobLock,
  failJobLock,
} from "../lock-service";
import { getDatePartsInTimezone } from "../cron";
import type {
  PeriodicSweeper,
  SchedulerJobResult,
  SweeperContext,
} from "../types";

export const githubActivitySweeper: PeriodicSweeper = {
  name: "github_activity_sync",

  async run(userId: string, context?: SweeperContext): Promise<SchedulerJobResult> {
    const startTime = performance.now();
    const referenceDate = context?.referenceDate ?? new Date();
    const timezone = context?.timezone ?? "UTC";
    const parts = getDatePartsInTimezone(referenceDate, timezone);

    // 1. Check if user has an active connected GitHub integration
    const [connection] = await db
      .select({ id: integrationConnections.id, status: integrationConnections.status })
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.userId, userId),
          eq(integrationConnections.provider, "github")
        )
      )
      .limit(1);

    if (!connection || connection.status !== "connected") {
      return {
        jobName: "github_activity_sync",
        userId,
        executed: false,
        skippedReason: !connection
          ? "No GitHub integration configured"
          : `Integration status is '${connection.status}'`,
        durationMs: Math.round(performance.now() - startTime),
      };
    }

    // 2. Generate 15-minute window idempotency slot key
    const fifteenMinuteSlot = Math.floor(parts.minute / 15) * 15;
    const hourStr = parts.hour.toString().padStart(2, "0");
    const minuteSlotStr = String(fifteenMinuteSlot).padStart(2, "0");
    const idempotencyKey = `github_activity_sync:${userId}:${parts.dateStr}T${hourStr}:${minuteSlotStr}`;

    const acquired = await acquireJobLock(
      userId,
      "github_activity_sync",
      idempotencyKey
    );

    if (!acquired) {
      return {
        jobName: "github_activity_sync",
        userId,
        executed: false,
        skippedReason: "Already synchronized in this 15-minute interval",
        durationMs: Math.round(performance.now() - startTime),
      };
    }

    try {
      // 3. Execute incremental sync
      const result = await githubSyncEngine.sync(userId);

      await completeJobLock(userId, idempotencyKey);

      return {
        jobName: "github_activity_sync",
        userId,
        executed: true,
        durationMs: Math.round(performance.now() - startTime),
        details: {
          itemsProcessed: result.itemsProcessed,
          itemsCreated: result.itemsCreated,
          itemsSkipped: result.itemsSkipped,
          syncStatus: result.status,
        },
      };
    } catch (err: any) {
      await failJobLock(userId, idempotencyKey);

      return {
        jobName: "github_activity_sync",
        userId,
        executed: false,
        error: err.message ?? "Unknown error during background GitHub activity sync",
        durationMs: Math.round(performance.now() - startTime),
      };
    }
  },
};
