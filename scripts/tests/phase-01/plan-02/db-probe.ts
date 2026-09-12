import { checkDatabaseHealth } from "@/server/db";

export interface ProbeResult {
  isAvailable: boolean;
  error?: string;
  latencyMs?: number;
}

/**
 * Top-level database probe ensuring the three-state authenticity contract:
 * 1. DB online -> tests execute and pass
 * 2. DB offline + REQUIRE_DB unset -> tests SKIPPED (describe.skipIf)
 * 3. DB offline + REQUIRE_DB=true -> suite FAILS with non-zero exit code
 */
export async function probeDatabase(): Promise<ProbeResult> {
  const health = await checkDatabaseHealth();
  const isAvailable = health.ok;
  const requireDb =
    process.env.REQUIRE_DB === "true" || process.env.REQUIRE_DB === "1";

  if (!isAvailable && requireDb) {
    throw new Error(
      `[CRITICAL REQUIRE_DB FAILURE] PostgreSQL database is REQUIRED (REQUIRE_DB=true) but is unreachable: ${health.error}`
    );
  }

  if (!isAvailable) {
    console.warn(
      "\n[integration] Skipping live database tests: PostgreSQL is offline.\n" +
        "To enable live integration tests, ensure PostgreSQL is active.\n"
    );
  }

  return {
    isAvailable,
    error: health.error,
    latencyMs: health.latencyMs,
  };
}
