import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { tasks } from "@/server/db/schema/tasks";
import { auditLog } from "@/server/db/schema/audit";
import { auth } from "@/server/auth";
import { createTask, updateTask, deleteTask } from "@/server/tasks/service";
import { createAuditLog } from "@/server/audit";
import { eq, and, sql } from "drizzle-orm";

describe("Plan 01-08: Audit Log Integrity, Actor Attribution & Immutability Integration Suite", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "plan08_audit@example.com",
    password: "Plan08AuditPassword123!",
    name: "Plan08 Audit Integrity Tester",
  };

  let testUserId: string;

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    await db.delete(user);

    const res = await auth.api.signUpEmail({
      body: {
        email: testUser.email,
        password: testUser.password,
        name: testUser.name,
      },
      asResponse: true,
    });

    expect(res.status).toBe(200);

    const [createdUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testUser.email));
    testUserId = createdUser.id;
  });

  afterAll(async () => {
    if (!probe.isAvailable) return;
    await db.delete(user);
    await closeDatabase();
  });

  describe("Actor Attribution & Non-Spoofability", () => {
    it("strictly binds actor identity to user:${userId} when userId is present, ignoring client-supplied actor", async () => {
      if (!probe.isAvailable) return;

      // Attempt to spoof actor as 'admin_system' while providing authenticated userId
      await createAuditLog({
        userId: testUserId,
        category: "security",
        action: "security.tamper_attempt",
        status: "success",
        actor: "admin_system", // Client attempted override
      });

      const [logEntry] = await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.userId, testUserId),
            eq(auditLog.action, "security.tamper_attempt")
          )
        );

      expect(logEntry).toBeDefined();
      // Must be canonical user:${userId}, NOT the spoofed 'admin_system'
      expect(logEntry.actor).toBe(`user:${testUserId}`);
    });

    it("accurately records mutation details JSON in task operations", async () => {
      if (!probe.isAvailable) return;

      const task = await createTask(testUserId, {
        title: "Audited Task Execution",
        priority: "critical",
      });

      const [createLog] = await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.userId, testUserId),
            eq(auditLog.action, "task.create")
          )
        );

      expect(createLog).toBeDefined();
      const details = createLog.details as Record<string, unknown>;
      expect(details.taskId).toBe(task.id);
      expect(details.title).toBe("Audited Task Execution");

      await updateTask(testUserId, task.id, { title: "Renamed Task" });

      const [updateLog] = await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.userId, testUserId),
            eq(auditLog.action, "task.update")
          )
        );

      expect(updateLog).toBeDefined();
      const updateDetails = updateLog.details as Record<string, unknown>;
      expect(updateDetails.taskId).toBe(task.id);
      expect(updateDetails.updatedFields).toContain("title");

      await deleteTask(testUserId, task.id);
    });
  });

  describe("PostgreSQL Immutability & Anti-Tampering Trigger Verification", () => {
    it("proves immutability: PostgreSQL trigger blocks any SQL UPDATE on audit_log", async () => {
      if (!probe.isAvailable) return;

      const auditId = crypto.randomUUID();

      await db.insert(auditLog).values({
        id: auditId,
        userId: testUserId,
        category: "mutation",
        action: "immutable.test",
        status: "success",
      });

      // Attempt to tamper with the action column
      let updateError: any = null;
      try {
        await db
          .update(auditLog)
          .set({ action: "tampered.action" })
          .where(eq(auditLog.id, auditId));
      } catch (err) {
        updateError = err;
      }

      expect(updateError).not.toBeNull();
      const msg = updateError?.cause?.message || updateError?.message || "";
      expect(msg).toMatch(/audit_log records are immutable and cannot be updated/i);

      // Verify the record remained unchanged
      const [freshRecord] = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.id, auditId));
      expect(freshRecord.action).toBe("immutable.test");
    });

    it("proves tamper-resistance: PostgreSQL trigger blocks direct SQL DELETE within retention wall", async () => {
      if (!probe.isAvailable) return;

      const auditId = crypto.randomUUID();

      await db.insert(auditLog).values({
        id: auditId,
        userId: testUserId,
        category: "security",
        action: "delete.prevention.test",
        status: "success",
      });

      // Direct DELETE attempt
      let deleteError: any = null;
      try {
        await db.delete(auditLog).where(eq(auditLog.id, auditId));
      } catch (err) {
        deleteError = err;
      }

      expect(deleteError).not.toBeNull();
      const msg = deleteError?.cause?.message || deleteError?.message || "";
      expect(msg).toMatch(/mandatory 90-day retention wall and cannot be deleted/i);

      // Verify record still exists
      const [freshRecord] = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.id, auditId));
      expect(freshRecord).toBeDefined();
    });

    it("proves purge procedure enforces mandatory 90-day retention wall", async () => {
      if (!probe.isAvailable) return;

      // Attempt to purge with retention < 90 days must be rejected by check_violation
      let purgeError: any = null;
      try {
        await db.execute(sql`SELECT purge_expired_audit_logs(30);`);
      } catch (err) {
        purgeError = err;
      }

      expect(purgeError).not.toBeNull();
      const msg = purgeError?.cause?.message || purgeError?.message || "";
      expect(msg).toMatch(/Retention period must be at least 90 days/i);
    });
  });
});
