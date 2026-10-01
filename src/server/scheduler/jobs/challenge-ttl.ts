import { sweepExpiredChallenges } from "@/server/agents/challenges/ttl-sweeper";
import type {
  PeriodicSweeper,
  SchedulerJobResult,
  SweeperContext,
} from "../types";

/**
 * Challenge TTL Reconciliation Sweeper.
 *
 * Discovers expired PENDING challenges for a user/tenant and transitions
 * them to EXPIRED status within the background scheduler lifecycle.
 */
export const challengeTtlSweeper: PeriodicSweeper = {
  name: "challenge_ttl",

  async run(userId: string, context?: SweeperContext): Promise<SchedulerJobResult> {
    const startTime = performance.now();

    try {
      const stats = await sweepExpiredChallenges(userId);

      return {
        jobName: "challenge_ttl",
        userId,
        executed: stats.expiredCount > 0,
        durationMs: Math.round(performance.now() - startTime),
        details: {
          scannedAt: stats.scannedAt.toISOString(),
          expiredCount: stats.expiredCount,
        },
      };
    } catch (err: any) {
      return {
        jobName: "challenge_ttl",
        userId,
        executed: false,
        error: err.message ?? String(err),
        durationMs: Math.round(performance.now() - startTime),
      };
    }
  },
};
