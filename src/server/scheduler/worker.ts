import { schedulerEngine } from "./engine";
import type { SchedulerOverallSummary } from "./types";

export interface SchedulerWorkerOptions {
  intervalMs?: number;
  runImmediately?: boolean;
}

export const DEFAULT_TICK_INTERVAL_MS = 60_000; // 60 seconds

let workerTimer: NodeJS.Timeout | null = null;
let isWorkerRunning = false;
let isTicking = false;

/**
 * Executes a single scheduler tick across all tenants.
 * Prevents overlapping ticks if a previous tick is still in flight.
 */
export async function triggerTick(): Promise<SchedulerOverallSummary | null> {
  if (isTicking) {
    console.warn(
      "[SchedulerWorker] Previous tick is still active; skipping tick cycle to prevent overlap."
    );
    return null;
  }

  isTicking = true;
  try {
    const summary = await schedulerEngine.runAllUsers();
    if (summary.totalExecuted > 0 || summary.totalFailed > 0) {
      console.log(
        `[SchedulerWorker] Tick completed: ${summary.totalExecuted} executed, ${summary.totalSkipped} skipped, ${summary.totalFailed} failed across ${summary.totalUsers} user(s).`
      );
    }
    return summary;
  } catch (tickErr) {
    console.error("[SchedulerWorker] Fatal error during scheduler tick:", tickErr);
    return null;
  } finally {
    isTicking = false;
  }
}

/**
 * Starts the in-process background scheduler worker loop.
 */
export function startSchedulerWorker(options?: SchedulerWorkerOptions): void {
  if (isWorkerRunning) {
    console.warn("[SchedulerWorker] Scheduler worker is already running.");
    return;
  }

  const intervalMs = options?.intervalMs ?? DEFAULT_TICK_INTERVAL_MS;
  isWorkerRunning = true;

  console.log(
    `[SchedulerWorker] Background scheduler started (tick interval: ${Math.round(intervalMs / 1000)}s).`
  );

  if (options?.runImmediately) {
    triggerTick().catch((err) =>
      console.error("[SchedulerWorker] Startup tick error:", err)
    );
  }

  workerTimer = setInterval(() => {
    triggerTick().catch((err) =>
      console.error("[SchedulerWorker] Interval tick error:", err)
    );
  }, intervalMs);

  // Unref timer so it doesn't prevent Node process exit in CLI/tests
  if (workerTimer.unref) {
    workerTimer.unref();
  }
}

/**
 * Stops the in-process background scheduler worker loop.
 */
export function stopSchedulerWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
  isWorkerRunning = false;
  console.log("[SchedulerWorker] Background scheduler stopped.");
}

/**
 * Returns true if the background worker ticker is active.
 */
export function isSchedulerWorkerRunning(): boolean {
  return isWorkerRunning;
}
