import { startSchedulerWorker, stopSchedulerWorker } from "@/server/scheduler";

console.log("=========================================");
console.log("LifeOS Background Scheduler Daemon");
console.log("=========================================");

const intervalMs = process.env.SCHEDULER_INTERVAL_MS
  ? parseInt(process.env.SCHEDULER_INTERVAL_MS, 10)
  : 60_000;

startSchedulerWorker({
  intervalMs,
  runImmediately: true,
});

function shutdown(signal: string) {
  console.log(`\nReceived ${signal}. Shutting down LifeOS background worker gracefully...`);
  stopSchedulerWorker();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
