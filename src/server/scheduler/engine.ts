import { eq, and } from "drizzle-orm";
import { db } from "@/server/db";
import { automations, user } from "@/server/db/schema";
import { getUserPreferences } from "@/server/preferences/service";
import { automationEngine } from "@/server/automations";
import { overdueTasksSweeper } from "./jobs/overdue-tasks";
import { planningPromptsSweeper } from "./jobs/planning-prompts";
import { stagnantGoalsSweeper } from "./jobs/stagnant-goals";
import { googleCalendarSyncSweeper } from "./jobs/google-calendar-sync";
import { githubActivitySweeper } from "./jobs/github-activity-sync";
import { cloudBackupSweeper } from "./jobs/cloud-backup";
import { challengeTtlSweeper } from "./jobs/challenge-ttl";
import {
  acquireJobLock,
  completeJobLock,
  failJobLock,
} from "./lock-service";
import {
  isScheduleDue,
  generateScheduledAutomationKey,
  getDatePartsInTimezone,
} from "./cron";
import type {
  PeriodicSweeper,
  SchedulerJobResult,
  SweepExecutionSummary,
  SchedulerOverallSummary,
  SweeperContext,
  ScheduleConfig,
} from "./types";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Scheduler Engine cannot be initialized in the browser."
  );
}

/**
 * Core Background Scheduler Engine.
 * Responsible for determining WHEN routines and automations are due,
 * acquiring distributed idempotency locks, executing registered periodic sweepers,
 * and routing due scheduled automations through the canonical AutomationEngine.
 */
export class SchedulerEngine {
  private sweepers: Map<string, PeriodicSweeper> = new Map();

  constructor() {
    this.registerSweeper(overdueTasksSweeper);
    this.registerSweeper(planningPromptsSweeper);
    this.registerSweeper(stagnantGoalsSweeper);
    this.registerSweeper(googleCalendarSyncSweeper);
    this.registerSweeper(githubActivitySweeper);
    this.registerSweeper(cloudBackupSweeper);
    this.registerSweeper(challengeTtlSweeper);
  }

  /**
   * Registers a periodic sweeper job.
   */
  registerSweeper(sweeper: PeriodicSweeper): void {
    this.sweepers.set(sweeper.name, sweeper);
  }

  /**
   * Unregisters a periodic sweeper by name.
   */
  unregisterSweeper(name: string): boolean {
    return this.sweepers.delete(name);
  }

  /**
   * Lists all registered sweepers.
   */
  getSweepers(): PeriodicSweeper[] {
    return Array.from(this.sweepers.values());
  }

  /**
   * Runs all registered periodic sweepers for a single tenant.
   * Isolates failures so that one failing sweeper does not abort others.
   */
  async runSweepers(
    userId: string,
    context?: SweeperContext
  ): Promise<SweepExecutionSummary> {
    const startedAt = new Date();
    const startTime = performance.now();
    const results: SchedulerJobResult[] = [];

    let executedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const sweeper of this.sweepers.values()) {
      try {
        const result = await sweeper.run(userId, context);
        results.push(result);

        if (result.executed) {
          executedCount++;
        } else if (result.error) {
          failedCount++;
        } else {
          skippedCount++;
        }
      } catch (err: any) {
        failedCount++;
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(
          `[SchedulerEngine] Sweeper "${sweeper.name}" threw unhandled error for user ${userId}:`,
          err
        );
        results.push({
          jobName: sweeper.name,
          userId,
          executed: false,
          error: errorMessage,
          durationMs: 0,
        });
      }
    }

    const completedAt = new Date();
    const durationMs = Math.round(performance.now() - startTime);

    return {
      userId,
      totalJobs: results.length,
      executedCount,
      skippedCount,
      failedCount,
      results,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs,
    };
  }

  /**
   * Evaluates and executes due scheduled automations for a tenant.
   * Strictly invokes the canonical AutomationEngine to execute actions.
   */
  async runScheduledAutomations(
    userId: string,
    context?: SweeperContext
  ): Promise<SchedulerJobResult[]> {
    const referenceDate = context?.referenceDate ?? new Date();
    const results: SchedulerJobResult[] = [];

    // 1. Resolve user timezone
    let defaultTimezone = context?.timezone;
    if (!defaultTimezone) {
      try {
        const prefs = await getUserPreferences(userId);
        defaultTimezone = prefs?.timezone || "UTC";
      } catch {
        defaultTimezone = "UTC";
      }
    }

    // 2. Query active scheduled automations for this tenant
    const scheduledRules = await db
      .select()
      .from(automations)
      .where(
        and(
          eq(automations.userId, userId),
          eq(automations.isActive, true),
          eq(automations.triggerType, "schedule")
        )
      );

    // 3. Evaluate each rule against its schedule definition
    for (const rule of scheduledRules) {
      const startTime = performance.now();
      const scheduleConfig = (rule.triggerConfig || {}) as ScheduleConfig;
      const timezone = scheduleConfig.timezone || defaultTimezone;

      let evaluation;
      try {
        evaluation = isScheduleDue(
          scheduleConfig,
          rule.lastRunAt,
          referenceDate,
          timezone
        );
      } catch (evalErr: any) {
        results.push({
          jobName: `scheduled_automation:${rule.id}`,
          userId,
          executed: false,
          error: `Schedule evaluation error: ${evalErr?.message || evalErr}`,
          durationMs: Math.round(performance.now() - startTime),
        });
        continue;
      }

      if (!evaluation.due) {
        results.push({
          jobName: `scheduled_automation:${rule.id}`,
          userId,
          executed: false,
          skippedReason: evaluation.reason || "Not due yet",
          durationMs: Math.round(performance.now() - startTime),
          details: {
            automationName: rule.name,
            slotKey: evaluation.slotKey,
          },
        });
        continue;
      }

      // Idempotency guard: prevent duplicate execution for this occurrence slot
      const idempotencyKey = generateScheduledAutomationKey(
        userId,
        rule.id,
        evaluation.slotKey
      );

      const acquired = await acquireJobLock(
        userId,
        "scheduled_automation",
        idempotencyKey
      );

      if (!acquired) {
        results.push({
          jobName: `scheduled_automation:${rule.id}`,
          userId,
          executed: false,
          skippedReason: `Already executed for slot "${evaluation.slotKey}"`,
          durationMs: Math.round(performance.now() - startTime),
          details: {
            automationName: rule.name,
            idempotencyKey,
          },
        });
        continue;
      }

      // 4. Dispatch through canonical AutomationEngine
      const { dateStr, timeStr } = getDatePartsInTimezone(referenceDate, timezone);

      const contextSnapshot: Record<string, unknown> = {
        schedule: {
          type: scheduleConfig.type,
          time: scheduleConfig.time,
          cron: scheduleConfig.cron,
          intervalMinutes: scheduleConfig.intervalMinutes,
          runAt: scheduleConfig.runAt,
          scheduledFor: evaluation.scheduledFor.toISOString(),
          slotKey: evaluation.slotKey,
          timezone,
        },
        now: referenceDate.toISOString(),
        date: dateStr,
        time: timeStr,
        userId,
      };

      try {
        const runDTO = await automationEngine.executeAutomationById(
          userId,
          rule.id,
          "schedule.tick",
          contextSnapshot
        );

        // One-time schedule lifecycle: deactivate after firing
        if (scheduleConfig.type === "once" || scheduleConfig.runAt) {
          await db
            .update(automations)
            .set({
              isActive: false,
              updatedAt: new Date(),
            })
            .where(and(eq(automations.userId, userId), eq(automations.id, rule.id)));
        }

        await completeJobLock(userId, idempotencyKey);

        const durationMs = Math.round(performance.now() - startTime);

        results.push({
          jobName: `scheduled_automation:${rule.id}`,
          userId,
          executed: runDTO?.status === "success",
          skippedReason:
            runDTO?.status === "skipped"
              ? runDTO.errorMessage || "Conditions did not match"
              : undefined,
          error: runDTO?.status === "failed" ? runDTO.errorMessage || "Execution failed" : undefined,
          durationMs,
          details: {
            automationId: rule.id,
            automationName: rule.name,
            runId: runDTO?.id,
            status: runDTO?.status,
          },
        });
      } catch (execErr: any) {
        await failJobLock(userId, idempotencyKey);
        const durationMs = Math.round(performance.now() - startTime);

        results.push({
          jobName: `scheduled_automation:${rule.id}`,
          userId,
          executed: false,
          error: execErr instanceof Error ? execErr.message : String(execErr),
          durationMs,
          details: {
            automationId: rule.id,
            automationName: rule.name,
          },
        });
      }
    }

    return results;
  }

  /**
   * Executes all sweepers and scheduled automations for a given tenant.
   */
  async runAllForUser(
    userId: string,
    context?: SweeperContext
  ): Promise<SweepExecutionSummary> {
    const startedAt = new Date();
    const startTime = performance.now();

    const [sweeperSummary, autoResults] = await Promise.all([
      this.runSweepers(userId, context),
      this.runScheduledAutomations(userId, context),
    ]);

    const combinedResults = [...sweeperSummary.results, ...autoResults];

    let executedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const r of combinedResults) {
      if (r.executed) executedCount++;
      else if (r.error) failedCount++;
      else skippedCount++;
    }

    const completedAt = new Date();
    const durationMs = Math.round(performance.now() - startTime);

    return {
      userId,
      totalJobs: combinedResults.length,
      executedCount,
      skippedCount,
      failedCount,
      results: combinedResults,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs,
    };
  }

  /**
   * Iterates across all active users in the system and triggers their scheduler routines.
   * Guarantees complete tenant isolation and error containment across users.
   */
  async runAllUsers(
    context?: SweeperContext
  ): Promise<SchedulerOverallSummary> {
    const startedAt = new Date();
    const startTime = performance.now();

    const activeUsers = await db.select({ id: user.id }).from(user);
    const userSummaries: SweepExecutionSummary[] = [];

    let totalJobs = 0;
    let totalExecuted = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    for (const u of activeUsers) {
      try {
        const summary = await this.runAllForUser(u.id, context);
        userSummaries.push(summary);

        totalJobs += summary.totalJobs;
        totalExecuted += summary.executedCount;
        totalSkipped += summary.skippedCount;
        totalFailed += summary.failedCount;
      } catch (userErr) {
        console.error(
          `[SchedulerEngine] Fatal error processing user ${u.id}:`,
          userErr
        );
        totalFailed++;
        userSummaries.push({
          userId: u.id,
          totalJobs: 0,
          executedCount: 0,
          skippedCount: 0,
          failedCount: 1,
          results: [
            {
              jobName: "tenant_sweep",
              userId: u.id,
              executed: false,
              error:
                userErr instanceof Error ? userErr.message : String(userErr),
              durationMs: 0,
            },
          ],
          startedAt: startedAt.toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 0,
        });
      }
    }

    const completedAt = new Date();
    const durationMs = Math.round(performance.now() - startTime);

    return {
      totalUsers: activeUsers.length,
      totalJobs,
      totalExecuted,
      totalSkipped,
      totalFailed,
      userSummaries,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs,
    };
  }
}

export const schedulerEngine = new SchedulerEngine();
