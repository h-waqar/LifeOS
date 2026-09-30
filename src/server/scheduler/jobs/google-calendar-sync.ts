import { eq, and } from "drizzle-orm";
import { db } from "@/server/db";
import { integrationConnections } from "@/server/db/schema";
import { googleCalendarSyncEngine } from "@/server/integrations/google-calendar/sync-engine";
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

export const googleCalendarSyncSweeper: PeriodicSweeper = {
  name: "google_calendar_sync",

  async run(userId: string, context?: SweeperContext): Promise<SchedulerJobResult> {
    const startTime = performance.now();
    const referenceDate = context?.referenceDate ?? new Date();
    const timezone = context?.timezone ?? "UTC";
    const parts = getDatePartsInTimezone(referenceDate, timezone);

    // 1. Check if user has an active connected Google Calendar integration
    const [connection] = await db
      .select({ id: integrationConnections.id, status: integrationConnections.status })
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.userId, userId),
          eq(integrationConnections.provider, "google_calendar")
        )
      )
      .limit(1);

    if (!connection || connection.status !== "connected") {
      return {
        jobName: "google_calendar_sync",
        userId,
        executed: false,
        skippedReason: !connection
          ? "No Google Calendar integration configured"
          : `Integration status is '${connection.status}'`,
        durationMs: Math.round(performance.now() - startTime),
      };
    }

    // 2. Generate 5-minute window idempotency slot key
    const fiveMinuteSlot = Math.floor(parts.minute / 5) * 5;
    const hourStr = parts.hour.toString().padStart(2, "0");
    const minuteSlotStr = String(fiveMinuteSlot).padStart(2, "0");
    const idempotencyKey = `google_calendar_sync:${userId}:${parts.dateStr}T${hourStr}:${minuteSlotStr}`;

    const acquired = await acquireJobLock(
      userId,
      "google_calendar_sync",
      idempotencyKey
    );

    if (!acquired) {
      return {
        jobName: "google_calendar_sync",
        userId,
        executed: false,
        skippedReason: "Already synchronized in this 5-minute interval",
        durationMs: Math.round(performance.now() - startTime),
      };
    }

    try {
      // 3. Execute incremental two-way sync
      const syncResult = await googleCalendarSyncEngine.sync(userId, {
        direction: "bidirectional",
      });

      await completeJobLock(userId, idempotencyKey);

      return {
        jobName: "google_calendar_sync",
        userId,
        executed: true,
        durationMs: Math.round(performance.now() - startTime),
        details: {
          itemsProcessed: syncResult.itemsProcessed,
          itemsCreated: syncResult.itemsCreated,
          itemsUpdated: syncResult.itemsUpdated,
          itemsDeleted: syncResult.itemsDeleted,
          syncStatus: syncResult.status,
        },
      };
    } catch (err: any) {
      await failJobLock(userId, idempotencyKey);

      return {
        jobName: "google_calendar_sync",
        userId,
        executed: false,
        error: err.message ?? "Unknown error during background Google Calendar sync",
        durationMs: Math.round(performance.now() - startTime),
      };
    }
  },
};
