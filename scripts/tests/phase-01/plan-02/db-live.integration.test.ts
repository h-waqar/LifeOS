import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, checkDatabaseHealth, closeDatabase } from "@/server/db";
import { user, session, userPreferences, auditLog } from "@/server/db/schema";
import { eq } from "drizzle-orm";

describe("Live PostgreSQL Integration Tests", () => {
  let isDbAvailable = false;

  beforeAll(async () => {
    const health = await checkDatabaseHealth();
    isDbAvailable = health.ok;
    if (!isDbAvailable) {
      console.warn(
        "\n[integration] Skipping live database tests: PostgreSQL container is offline.\n" +
          "To enable live integration tests, run: docker compose up -d postgres\n"
      );
    }
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it("verifies live PostgreSQL connectivity and latency", async () => {
    if (!isDbAvailable) return;

    const health = await checkDatabaseHealth();
    expect(health.ok).toBe(true);
    expect(health.latencyMs).toBeDefined();
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("verifies ACID transaction rollback behavior", async () => {
    if (!isDbAvailable) return;

    const testUserId = `test-user-tx-${Date.now()}`;

    try {
      await db.transaction(async (tx) => {
        await tx.insert(user).values({
          id: testUserId,
          name: "Transaction Test",
          email: `${testUserId}@example.com`,
          emailVerified: false,
        });

        // Force an error to trigger rollback
        throw new Error("Intentional transaction rollback test");
      });
    } catch (err: any) {
      expect(err.message).toBe("Intentional transaction rollback test");
    }

    // Verify row was NOT persisted
    const rows = await db.select().from(user).where(eq(user.id, testUserId));
    expect(rows).toHaveLength(0);
  });

  it("verifies foreign key cascade deletion and audit log set null behavior", async () => {
    if (!isDbAvailable) return;

    const testUserId = `test-cascade-${Date.now()}`;
    const testSessionId = `test-session-${Date.now()}`;
    const testAuditId = `test-audit-${Date.now()}`;

    // 1. Create user
    await db.insert(user).values({
      id: testUserId,
      name: "Cascade User",
      email: `${testUserId}@example.com`,
      emailVerified: false,
    });

    // 2. Create linked session and audit log
    await db.insert(session).values({
      id: testSessionId,
      userId: testUserId,
      token: `token-${testUserId}`,
      expiresAt: new Date(Date.now() + 86400000),
    });

    await db.insert(auditLog).values({
      id: testAuditId,
      userId: testUserId,
      category: "auth",
      action: "test.cascade",
      status: "success",
    });

    // 3. Delete user
    await db.delete(user).where(eq(user.id, testUserId));

    // 4. Session should be cascade deleted
    const sessionRows = await db
      .select()
      .from(session)
      .where(eq(session.id, testSessionId));
    expect(sessionRows).toHaveLength(0);

    // 5. Audit log should remain with userId set to null
    const auditRows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.id, testAuditId));
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].userId).toBeNull();

    // Clean up audit entry
    await db.delete(auditLog).where(eq(auditLog.id, testAuditId));
  });
});
