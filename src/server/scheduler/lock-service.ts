import { eq, and, lt } from "drizzle-orm";
import { db } from "@/server/db";
import { schedulerLocks, type SchedulerLock } from "@/server/db/schema";
import { AuthorizationError } from "@/server/auth/guard";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Scheduler lock service cannot be initialized in the browser."
  );
}

export const DEFAULT_LOCK_TIMEOUT_MINUTES = 15;

/**
 * Attempts to acquire an idempotency lock for a scheduled job occurrence.
 *
 * Concurrency & Idempotency:
 * 1. Attempts an atomic INSERT with ON CONFLICT DO NOTHING.
 * 2. If row was inserted, lock is successfully acquired.
 * 3. If insert was skipped:
 *    - If existing lock is 'completed' or active 'locked', acquisition fails (job already executed or executing).
 *    - If existing lock is stale (status = 'locked' and lockedAt older than lockTimeoutMinutes),
 *      it re-claims the lock by updating lockedAt = NOW().
 */
export async function acquireJobLock(
  userId: string,
  jobName: string,
  idempotencyKey: string,
  options?: { lockTimeoutMinutes?: number }
): Promise<boolean> {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new AuthorizationError("Authenticated user ID is required to acquire job lock.");
  }
  if (!jobName || !idempotencyKey) {
    throw new Error("Job name and idempotency key are required to acquire lock.");
  }

  const safeUserId = userId.trim();
  const safeJobName = jobName.trim();
  const safeKey = idempotencyKey.trim();
  const timeoutMinutes = options?.lockTimeoutMinutes ?? DEFAULT_LOCK_TIMEOUT_MINUTES;

  // 1. Attempt atomic insert
  try {
    const [inserted] = await db
      .insert(schedulerLocks)
      .values({
        userId: safeUserId,
        jobName: safeJobName,
        idempotencyKey: safeKey,
        status: "locked",
        lockedAt: new Date(),
      })
      .onConflictDoNothing({
        target: [schedulerLocks.userId, schedulerLocks.idempotencyKey],
      })
      .returning({ id: schedulerLocks.id });

    if (inserted) {
      return true;
    }
  } catch (err) {
    // Unique constraint violation or conflict handled
  }

  // 2. Insert skipped: check for stale abandoned lock recovery
  const staleThreshold = new Date(Date.now() - timeoutMinutes * 60 * 1000);

  const [reclaimed] = await db
    .update(schedulerLocks)
    .set({
      status: "locked",
      lockedAt: new Date(),
      completedAt: null,
    })
    .where(
      and(
        eq(schedulerLocks.userId, safeUserId),
        eq(schedulerLocks.idempotencyKey, safeKey),
        eq(schedulerLocks.status, "locked"),
        lt(schedulerLocks.lockedAt, staleThreshold)
      )
    )
    .returning({ id: schedulerLocks.id });

  return Boolean(reclaimed);
}

/**
 * Marks an acquired job lock as successfully completed.
 */
export async function completeJobLock(
  userId: string,
  idempotencyKey: string
): Promise<void> {
  if (!userId || !idempotencyKey) return;
  const safeUserId = userId.trim();
  const safeKey = idempotencyKey.trim();

  await db
    .update(schedulerLocks)
    .set({
      status: "completed",
      completedAt: new Date(),
    })
    .where(
      and(
        eq(schedulerLocks.userId, safeUserId),
        eq(schedulerLocks.idempotencyKey, safeKey)
      )
    );
}

/**
 * Marks an acquired job lock as failed.
 */
export async function failJobLock(
  userId: string,
  idempotencyKey: string
): Promise<void> {
  if (!userId || !idempotencyKey) return;
  const safeUserId = userId.trim();
  const safeKey = idempotencyKey.trim();

  await db
    .update(schedulerLocks)
    .set({
      status: "failed",
      completedAt: new Date(),
    })
    .where(
      and(
        eq(schedulerLocks.userId, safeUserId),
        eq(schedulerLocks.idempotencyKey, safeKey)
      )
    );
}

/**
 * Checks if a job occurrence is currently locked or already completed.
 */
export async function isJobLocked(
  userId: string,
  idempotencyKey: string
): Promise<boolean> {
  if (!userId || !idempotencyKey) return false;
  const safeUserId = userId.trim();
  const safeKey = idempotencyKey.trim();

  const [row] = await db
    .select({ status: schedulerLocks.status })
    .from(schedulerLocks)
    .where(
      and(
        eq(schedulerLocks.userId, safeUserId),
        eq(schedulerLocks.idempotencyKey, safeKey)
      )
    )
    .limit(1);

  if (!row) return false;
  return row.status === "locked" || row.status === "completed";
}

/**
 * Releases or deletes a job lock (useful for rollback or test setup).
 */
export async function releaseJobLock(
  userId: string,
  idempotencyKey: string
): Promise<void> {
  if (!userId || !idempotencyKey) return;
  const safeUserId = userId.trim();
  const safeKey = idempotencyKey.trim();

  await db
    .delete(schedulerLocks)
    .where(
      and(
        eq(schedulerLocks.userId, safeUserId),
        eq(schedulerLocks.idempotencyKey, safeKey)
      )
    );
}

/**
 * Clears all scheduler locks for a given user.
 */
export async function clearJobLocks(userId: string): Promise<void> {
  if (!userId) return;
  await db
    .delete(schedulerLocks)
    .where(eq(schedulerLocks.userId, userId.trim()));
}

/**
 * Executes an async routine wrapped in an idempotency lock.
 * If the lock cannot be acquired, execution is safely skipped.
 */
export async function withJobLock<T>(
  userId: string,
  jobName: string,
  idempotencyKey: string,
  fn: () => Promise<T>,
  options?: { lockTimeoutMinutes?: number }
): Promise<{ executed: boolean; result?: T }> {
  const acquired = await acquireJobLock(userId, jobName, idempotencyKey, options);
  if (!acquired) {
    return { executed: false };
  }

  try {
    const result = await fn();
    await completeJobLock(userId, idempotencyKey);
    return { executed: true, result };
  } catch (err) {
    await failJobLock(userId, idempotencyKey);
    throw err;
  }
}
