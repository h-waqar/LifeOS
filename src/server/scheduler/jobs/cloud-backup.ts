import { eq, and } from "drizzle-orm";
import { db } from "@/server/db";
import { integrationConnections } from "@/server/db/schema";
import { backupService } from "@/server/integrations/backup/service";
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

export const cloudBackupSweeper: PeriodicSweeper = {
  name: "cloud_backup",

  async run(userId: string, context?: SweeperContext): Promise<SchedulerJobResult> {
    const startTime = performance.now();
    const referenceDate = context?.referenceDate ?? new Date();
    const timezone = context?.timezone ?? "UTC";
    const parts = getDatePartsInTimezone(referenceDate, timezone);

    // 1. Check if user has an active backup integration configured
    const [connection] = await db
      .select({ id: integrationConnections.id, status: integrationConnections.status, metadata: integrationConnections.metadata })
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.userId, userId),
          eq(integrationConnections.provider, "backup")
        )
      )
      .limit(1);

    const meta = (connection?.metadata || {}) as Record<string, any>;
    const schedule = meta.schedule || "daily";

    if (!connection || connection.status !== "connected" || schedule === "disabled") {
      return {
        jobName: "cloud_backup",
        userId,
        executed: false,
        skippedReason: !connection
          ? "No backup integration configured"
          : schedule === "disabled"
          ? "Scheduled backups are disabled"
          : `Integration status is '${connection.status}'`,
        durationMs: Math.round(performance.now() - startTime),
      };
    }

    // If weekly: only run on Sunday (dayOfWeek === 0)
    if (schedule === "weekly" && parts.dayOfWeek !== 0) {
      return {
        jobName: "cloud_backup",
        userId,
        executed: false,
        skippedReason: "Weekly backup scheduled for Sunday",
        durationMs: Math.round(performance.now() - startTime),
      };
    }

    // 2. Daily idempotency lock (run once per calendar date)
    const idempotencyKey = `cloud_backup:${userId}:${parts.dateStr}`;

    const acquired = await acquireJobLock(
      userId,
      "cloud_backup",
      idempotencyKey
    );

    if (!acquired) {
      return {
        jobName: "cloud_backup",
        userId,
        executed: false,
        skippedReason: "Backup already executed for today",
        durationMs: Math.round(performance.now() - startTime),
      };
    }

    try {
      // 3. Execute automated backup
      const backupResult = await backupService.createBackup(userId, {
        provider: meta.provider,
        encrypt: meta.encrypt,
      });

      await completeJobLock(userId, idempotencyKey);

      return {
        jobName: "cloud_backup",
        userId,
        executed: true,
        durationMs: Math.round(performance.now() - startTime),
        details: {
          backupId: backupResult.id,
          destination: backupResult.destination,
          sizeBytes: backupResult.sizeBytes,
          storageProvider: backupResult.storageProvider,
          status: backupResult.status,
        },
      };
    } catch (err: any) {
      await failJobLock(userId, idempotencyKey);

      return {
        jobName: "cloud_backup",
        userId,
        executed: false,
        error: err.message ?? "Unknown error during background cloud backup",
        durationMs: Math.round(performance.now() - startTime),
      };
    }
  },
};
