/**
 * Challenge TTL Sweeper Engine
 *
 * Background reconciliation sweeper that discovers unconfirmed PENDING challenges
 * past their expiration TTL and transitions them to EXPIRED.
 *
 * Note: Correctness does NOT rely solely on this sweeper; consumeChallenge and getChallenge
 * perform synchronous expiration validation at the moment of request processing.
 */

import { and, eq, lte } from "drizzle-orm";
import { db as defaultDb } from "@/server/db";
import { agentChallenges } from "@/server/db/schema/agents";

export interface SweeperStats {
  scannedAt: Date;
  expiredCount: number;
}

/**
 * Sweeps pending challenges whose TTL has elapsed and transitions them to EXPIRED.
 * Supports optional tenant filtering (userId) and custom dbClient.
 */
export async function sweepExpiredChallenges(
  userIdOrDbClient?: string | any,
  maybeDbClient?: any
): Promise<SweeperStats> {
  const now = new Date();
  let userId: string | undefined;
  let dbClient = defaultDb;

  if (typeof userIdOrDbClient === "string") {
    userId = userIdOrDbClient;
    dbClient = maybeDbClient ?? defaultDb;
  } else if (userIdOrDbClient) {
    dbClient = userIdOrDbClient;
  }

  const conditions = [
    eq(agentChallenges.status, "PENDING"),
    lte(agentChallenges.expiresAt, now),
  ];

  if (userId) {
    conditions.push(eq(agentChallenges.userId, userId));
  }

  const expiredRows = await dbClient
    .update(agentChallenges)
    .set({
      status: "EXPIRED",
      updatedAt: now,
    })
    .where(and(...conditions))
    .returning({ id: agentChallenges.id });

  return {
    scannedAt: now,
    expiredCount: expiredRows.length,
  };
}

/**
 * Starts a recurring background sweeper timer.
 */
export function startTtlSweeper(
  intervalMs = 60000,
  dbClient = defaultDb
): { stop: () => void } {
  const timer = setInterval(async () => {
    try {
      await sweepExpiredChallenges(dbClient);
    } catch (err) {
      console.error("[ttl-sweeper] Error sweeping expired challenges:", err);
    }
  }, intervalMs);

  // Unref timer in Node so it doesn't block process exit
  if (typeof timer.unref === "function") {
    timer.unref();
  }

  return {
    stop: () => clearInterval(timer),
  };
}
