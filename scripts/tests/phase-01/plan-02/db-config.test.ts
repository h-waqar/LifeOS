import { describe, it, expect, afterEach } from "vitest";
import {
  createPgPool,
  closeDatabase,
  getPool,
  getDb,
  getLifecycleState,
} from "@/server/db";
import { Pool } from "pg";

describe("Database Configuration & Pool Lifecycle", () => {
  afterEach(async () => {
    await closeDatabase();
  });

  it("initializes a valid pg.Pool instance with default pool configuration", async () => {
    const testPool = createPgPool({
      connectionString: "postgresql://lifeos:lifeos_password@localhost:5432/lifeos",
    });

    expect(testPool).toBeInstanceOf(Pool);
    expect(testPool.options.max).toBe(10);
    expect(testPool.options.idleTimeoutMillis).toBe(30000);
    expect(testPool.options.connectionTimeoutMillis).toBe(5000);

    await testPool.end();
  });

  it("supports both postgresql:// and postgres:// connection URL formats", async () => {
    const pool1 = createPgPool({
      connectionString: "postgresql://user:pass@127.0.0.1:5432/lifeos",
    });
    const pool2 = createPgPool({
      connectionString: "postgres://user:pass@127.0.0.1:5432/lifeos",
    });

    expect(pool1).toBeInstanceOf(Pool);
    expect(pool2).toBeInstanceOf(Pool);

    await Promise.all([pool1.end(), pool2.end()]);
  });

  it("accepts custom pool configuration overrides", async () => {
    const customPool = createPgPool({
      connectionString: "postgresql://lifeos:lifeos_password@localhost:5432/lifeos",
      max: 5,
      idleTimeoutMillis: 15000,
      connectionTimeoutMillis: 3000,
    });

    expect(customPool.options.max).toBe(5);
    expect(customPool.options.idleTimeoutMillis).toBe(15000);
    expect(customPool.options.connectionTimeoutMillis).toBe(3000);

    await customPool.end();
  });

  it("reuses the cached pool on globalThis during development to prevent HMR connection exhaustion", async () => {
    const envObj = process.env as Record<string, string | undefined>;
    const originalEnv = envObj.NODE_ENV;
    try {
      envObj.NODE_ENV = "development";
      globalThis.__lifeos_pg_pool__ = undefined;

      const p1 = getPool();
      expect(globalThis.__lifeos_pg_pool__).toBeDefined();
      expect(p1).toBe(globalThis.__lifeos_pg_pool__);

      const p2 = getPool();
      expect(p2).toBe(p1);
    } finally {
      envObj.NODE_ENV = originalEnv;
    }
  });

  it("gracefully shuts down active pool connections and clears global cache on closeDatabase()", async () => {
    const p = getPool();
    expect(p).toBeDefined();

    await closeDatabase();
    expect(globalThis.__lifeos_pg_pool__).toBeUndefined();

    // Calling closeDatabase again is idempotent and does not throw
    await expect(closeDatabase()).resolves.toBeUndefined();
  });

  it("provides getDb() returning a Drizzle client instance backed by getPool()", async () => {
    const database = getDb();
    expect(database).toBeDefined();
    expect(database.query).toBeDefined();
    expect(database.select).toBeDefined();
    expect(getLifecycleState()).toBe("READY");
  });

  it("tracks connection lifecycle state transitions across init and close", async () => {
    const activePool = getPool();
    expect(activePool).toBeDefined();
    expect(getLifecycleState()).toBe("READY");

    const closePromise = closeDatabase();
    expect(["CLOSING", "CLOSED"]).toContain(getLifecycleState());
    await closePromise;
    expect(getLifecycleState()).toBe("CLOSED");
  });

  it("handles concurrent closeDatabase() invocations sharing the same promise", async () => {
    getPool();
    expect(getLifecycleState()).toBe("READY");

    const [res1, res2, res3] = await Promise.all([
      closeDatabase(),
      closeDatabase(),
      closeDatabase(),
    ]);

    expect(res1).toBeUndefined();
    expect(res2).toBeUndefined();
    expect(res3).toBeUndefined();
    expect(getLifecycleState()).toBe("CLOSED");
  });

  it("prohibits getPool() and getDb() while database is CLOSING to prevent concurrency races", async () => {
    const activePool = getPool();
    expect(activePool).toBeDefined();

    // Start graceful shutdown
    const closePromise = closeDatabase();
    expect(getLifecycleState()).toBe("CLOSING");

    // Attempting getPool() during CLOSING must throw and not expose dying pool or overwrite state
    expect(() => getPool()).toThrow(
      /Cannot acquire database pool while database connection is CLOSING/
    );

    // Attempting getDb() during CLOSING must also throw
    expect(() => getDb()).toThrow(
      /Cannot acquire database pool while database connection is CLOSING/
    );

    await closePromise;
    expect(getLifecycleState()).toBe("CLOSED");
  });

  it("concurrent getPool() calls return the identical pool instance", () => {
    const [p1, p2, p3] = [getPool(), getPool(), getPool()];
    expect(p1).toBe(p2);
    expect(p2).toBe(p3);
    expect(getLifecycleState()).toBe("READY");
  });

  it("concurrent getDb() calls return the identical client instance", () => {
    const [d1, d2, d3] = [getDb(), getDb(), getDb()];
    expect(d1).toBe(d2);
    expect(d2).toBe(d3);
    expect(getLifecycleState()).toBe("READY");
  });

  it("re-initializes pool and client cleanly after closeDatabase()", async () => {
    const pool1 = getPool();
    await closeDatabase();
    expect(getLifecycleState()).toBe("CLOSED");

    const pool2 = getPool();
    expect(pool2).toBeDefined();
    expect(pool2).not.toBe(pool1);
    expect(getLifecycleState()).toBe("READY");

    const db2 = getDb();
    expect(db2).toBeDefined();
  });
});
