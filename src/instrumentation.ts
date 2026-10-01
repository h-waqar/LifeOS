/**
 * Next.js Server Boot Instrumentation
 *
 * Runs once upon Next.js server instance startup.
 * Automatically initializes and starts the in-process background scheduler worker
 * in Node.js runtime environments.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Avoid running background scheduler during test runs or static build phase
    if (
      process.env.NODE_ENV !== "test" &&
      !process.env.VITEST &&
      process.env.NEXT_PHASE !== "phase-production-build" &&
      process.env.DISABLE_SCHEDULER !== "true"
    ) {
      try {
        const { startSchedulerWorker } = await import("@/server/scheduler/worker");
        startSchedulerWorker();
      } catch (err) {
        console.error("[Instrumentation] Failed to start scheduler worker:", err);
      }
    }
  }
}
