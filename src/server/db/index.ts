import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema";
import { env } from "@/lib/env";

// Server-only runtime protection: database connections must never be initialized in the browser
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Database connection pool cannot be initialized in the browser."
  );
}

declare global {
  // eslint-disable-next-line no-var
  var __lifeos_pg_pool__: Pool | undefined;
}

/**
 * Creates a configured PostgreSQL connection pool.
 */
export function createPgPool(config?: PoolConfig): Pool {
  return new Pool({
    connectionString: config?.connectionString ?? env.DATABASE_URL,
    max: config?.max ?? 10,
    idleTimeoutMillis: config?.idleTimeoutMillis ?? 30000,
    connectionTimeoutMillis: config?.connectionTimeoutMillis ?? 5000,
    ...config,
  });
}

/**
 * Returns or initializes the global pool instance with Next.js HMR development caching.
 */
export function getPool(): Pool {
  if (!globalThis.__lifeos_pg_pool__ || (globalThis.__lifeos_pg_pool__ as any).ended) {
    const newPool = createPgPool();
    if (process.env.NODE_ENV !== "production") {
      globalThis.__lifeos_pg_pool__ = newPool;
    }
    return newPool;
  }
  return globalThis.__lifeos_pg_pool__;
}

export const pool = getPool();

/**
 * Drizzle ORM client instance with foundational schema.
 */
export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });

/**
 * Verifies database connectivity by executing a lightweight ping query.
 * Catches all connection errors and timeouts, returning a structured health status.
 */
export async function checkDatabaseHealth(customPool?: Pool): Promise<{
  ok: boolean;
  latencyMs?: number;
  error?: string;
}> {
  const activePool = customPool ?? getPool();
  const start = Date.now();
  try {
    const client = await activePool.connect();
    try {
      await client.query("SELECT 1");
      return { ok: true, latencyMs: Date.now() - start };
    } finally {
      client.release();
    }
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Database connection failed",
    };
  }
}

/**
 * Gracefully terminates pool connections and resets the global cache.
 * Idempotent: safe to call multiple times without throwing.
 */
export async function closeDatabase(): Promise<void> {
  const target = globalThis.__lifeos_pg_pool__;
  if (target && !(target as any).ended) {
    await target.end();
  }
  globalThis.__lifeos_pg_pool__ = undefined;

  if (pool && pool !== target && !(pool as any).ended) {
    await pool.end();
  }
}

// Re-export schema symbols for convenience
export * from "./schema";
