import { checkDatabaseHealth } from "@/server/db";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Health service cannot be initialized in the browser."
  );
}

export interface HealthCheckResult {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

/**
 * System health service
 * Encapsulates infrastructure and database health checks behind server domain boundary.
 */
export async function getSystemHealth(): Promise<HealthCheckResult> {
  return await checkDatabaseHealth();
}
