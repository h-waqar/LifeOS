import { z } from "zod";

export type JobLockStatus = "locked" | "completed" | "failed";

export type ScheduleType = "cron" | "daily" | "interval" | "once";

export interface ScheduleConfig {
  type?: ScheduleType;
  cron?: string;
  time?: string;
  intervalMinutes?: number;
  runAt?: string;
  timezone?: string;
}

export interface SchedulerJobResult {
  jobName: string;
  userId: string;
  executed: boolean;
  skippedReason?: string;
  error?: string;
  durationMs: number;
  details?: Record<string, unknown>;
}

export interface SweepExecutionSummary {
  userId: string;
  totalJobs: number;
  executedCount: number;
  skippedCount: number;
  failedCount: number;
  results: SchedulerJobResult[];
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

export interface SchedulerOverallSummary {
  totalUsers: number;
  totalJobs: number;
  totalExecuted: number;
  totalSkipped: number;
  totalFailed: number;
  userSummaries: SweepExecutionSummary[];
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

export interface SweeperContext {
  referenceDate?: Date;
  timezone?: string;
}

export interface PeriodicSweeper {
  name: string;
  run(userId: string, context?: SweeperContext): Promise<SchedulerJobResult>;
}

export interface ScheduleEvaluationResult {
  due: boolean;
  slotKey: string;
  scheduledFor: Date;
  reason?: string;
}

export const scheduleConfigSchema = z
  .object({
    type: z.enum(["cron", "daily", "interval", "once"]).optional(),
    cron: z.string().trim().min(1).optional(),
    time: z
      .string()
      .trim()
      .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Time must be in HH:mm format (00:00 - 23:59)")
      .optional(),
    intervalMinutes: z.number().int().positive().optional(),
    runAt: z
      .string()
      .datetime({ offset: true })
      .or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/))
      .optional(),
    timezone: z.string().trim().optional(),
  })
  .strict()
  .refine(
    (data) => {
      const hasCron = Boolean(data.cron);
      const hasTime = Boolean(data.time);
      const hasInterval = Boolean(data.intervalMinutes);
      const hasRunAt = Boolean(data.runAt);
      return hasCron || hasTime || hasInterval || hasRunAt;
    },
    {
      message:
        "Schedule config must specify at least one valid trigger (cron, time 'HH:mm', intervalMinutes, or runAt)",
    }
  );

export type ValidatedScheduleConfig = z.infer<typeof scheduleConfigSchema>;
