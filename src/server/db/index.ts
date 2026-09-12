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

/**
 * Formal PostgreSQL Connection Lifecycle States:
 * - IDLE: Initial state or reset state. No pool instance exists.
 * - CONNECTING: Transient state while creating a new Pool instance.
 * - READY: Pool resource is allocated and ready to manage lazy connections. Queries are permitted.
 *   (Note: node-postgres pools connect lazily. "READY" means the pool resource is constructed.
 *   Active connectivity over the wire is verified via checkDatabaseHealth()).
 * - CLOSING: Graceful shutdown in progress. Calls to getPool() / getDb() throw to prevent races.
 * - CLOSED: Shutdown completed. Sockets drained and caches cleared. Queries not permitted until re-initialized.
 */
export type LifecycleState =
  | "IDLE"
  | "CONNECTING"
  | "READY"
  | "CLOSING"
  | "CLOSED";

declare global {
  // eslint-disable-next-line no-var
  var __lifeos_pg_pool__: Pool | undefined;
  // eslint-disable-next-line no-var
  var __lifeos_drizzle_db__: NodePgDatabase<typeof schema> | undefined;
  // eslint-disable-next-line no-var
  var __lifeos_db_state__: LifecycleState | undefined;
}

let localPool: Pool | undefined;
let localDb: NodePgDatabase<typeof schema> | undefined;
let currentState: LifecycleState = "IDLE";
let closingPromise: Promise<void> | null = null;

function setState(state: LifecycleState): void {
  currentState = state;
  if (process.env.NODE_ENV !== "production") {
    globalThis.__lifeos_db_state__ = state;
  }
}

/**
 * Returns current connection pool lifecycle state.
 */
export function getLifecycleState(): LifecycleState {
  if (process.env.NODE_ENV !== "production" && globalThis.__lifeos_db_state__) {
    return globalThis.__lifeos_db_state__;
  }
  return currentState;
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
 * Returns or initializes the global pool instance with Next.js HMR development caching
 * and concurrency-safe lifecycle state management.
 * 
 * Semantics:
 * - In IDLE or CLOSED: Transitions CONNECTING -> READY and instantiates the pool.
 * - In READY: Reuses the active cached pool.
 * - In CLOSING: Throws an explicit Error to prevent returning a dying pool or orphaning a new pool.
 */
export function getPool(config?: PoolConfig): Pool {
  if (currentState === "CLOSING" || closingPromise !== null) {
    throw new Error(
      "Cannot acquire database pool while database connection is CLOSING. Await closeDatabase() completion before re-initializing."
    );
  }

  const cachedPool =
    process.env.NODE_ENV !== "production"
      ? globalThis.__lifeos_pg_pool__
      : localPool;

  if (cachedPool && !(cachedPool as any).ended) {
    setState("READY");
    return cachedPool;
  }

  setState("CONNECTING");
  try {
    const newPool = createPgPool(config);

    if (process.env.NODE_ENV !== "production") {
      globalThis.__lifeos_pg_pool__ = newPool;
    } else {
      localPool = newPool;
    }

    setState("READY");
    return newPool;
  } catch (error) {
    setState("IDLE");
    throw error;
  }
}

/**
 * Returns or initializes the Drizzle ORM client instance backed by getPool().
 */
export function getDb(config?: PoolConfig): NodePgDatabase<typeof schema> {
  const currentPool = getPool(config);

  const cachedDb =
    process.env.NODE_ENV !== "production"
      ? globalThis.__lifeos_drizzle_db__
      : localDb;

  if (cachedDb && (cachedDb as any).$client === currentPool) {
    return cachedDb;
  }

  const newDb = drizzle(currentPool, { schema });
  if (process.env.NODE_ENV !== "production") {
    globalThis.__lifeos_drizzle_db__ = newDb;
  } else {
    localDb = newDb;
  }

  return newDb;
}

/**
 * Proxy export for pool: delegates dynamically to getPool()
 */
export const pool: Pool = new Proxy({} as Pool, {
  get(_target, prop, receiver) {
    const instance = getPool();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

/**
 * Proxy export for db: delegates dynamically to getDb()
 */
export const db: NodePgDatabase<typeof schema> = new Proxy(
  {} as NodePgDatabase<typeof schema>,
  {
    get(_target, prop, receiver) {
      const instance = getDb();
      const value = Reflect.get(instance, prop, receiver);
      return typeof value === "function" ? value.bind(instance) : value;
    },
  }
);

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
    const errorMessage =
      error instanceof Error && error.message && error.message.trim().length > 0
        ? error.message
        : (error as any)?.code ||
          (error as any)?.errors?.[0]?.message ||
          "Database connection failed";

    return {
      ok: false,
      error: errorMessage,
    };
  }
}

/**
 * Gracefully terminates pool connections and resets the state machine and caches.
 * Concurrency-safe: multiple concurrent calls share the same close promise.
 * Guaranteed cleanup: references are cleared in finally even if pool.end() fails.
 */
export async function closeDatabase(): Promise<void> {
  if (closingPromise) {
    return closingPromise;
  }

  const activePool =
    process.env.NODE_ENV !== "production"
      ? globalThis.__lifeos_pg_pool__
      : localPool;

  if (!activePool || (activePool as any).ended) {
    if (currentState !== "CLOSED") {
      setState("IDLE");
    }
    return;
  }

  setState("CLOSING");

  closingPromise = (async () => {
    try {
      if (!(activePool as any).ended) {
        await activePool.end();
      }
    } finally {
      if (process.env.NODE_ENV !== "production") {
        globalThis.__lifeos_pg_pool__ = undefined;
        globalThis.__lifeos_drizzle_db__ = undefined;
      }
      localPool = undefined;
      localDb = undefined;
      setState("CLOSED");
      closingPromise = null;
    }
  })();

  return closingPromise;
}

// Re-export schema symbols for convenience
export * from "./schema";
