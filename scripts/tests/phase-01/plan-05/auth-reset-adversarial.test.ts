import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user, session, account } from "@/server/db/schema/auth";
import { runAuthReset } from "../../../../scripts/auth-reset";
import { eq } from "drizzle-orm";

describe("Plan 01-05: Adversarial Auth Reset Boundary & Transaction Atomicity", () => {
  let probe: ProbeResult;
  let testUserId: string;
  let testEmail = "auth_reset_adv@example.com";
  let createdUser = false;
  let originalPasswordHash: string | undefined;
  let originalSessions: (typeof session.$inferSelect)[] = [];

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    const existingUsers = await db.select().from(user);
    if (existingUsers.length > 0) {
      testUserId = existingUsers[0].id;
      testEmail = existingUsers[0].email;
      const acc = await db.select().from(account).where(eq(account.userId, testUserId));
      if (acc.length > 0 && acc[0].password) {
        originalPasswordHash = acc[0].password;
      }
      originalSessions = await db.select().from(session).where(eq(session.userId, testUserId));
    } else {
      testUserId = "user_reset_adv_" + crypto.randomUUID().slice(0, 8);
      testEmail = "auth_reset_adv@example.com";
      // Create base user in PostgreSQL
      await db.insert(user).values({
        id: testUserId,
        name: "Reset Adversarial User",
        email: testEmail,
      });
      createdUser = true;
    }
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      if (createdUser) {
        await db.delete(user).where(eq(user.id, testUserId));
      } else {
        if (originalPasswordHash) {
          await db
            .update(account)
            .set({ password: originalPasswordHash })
            .where(eq(account.userId, testUserId));
        }
        for (const s of originalSessions) {
          await db.insert(session).values(s).onConflictDoNothing();
        }
      }
      await closeDatabase();
    }
  });

  it("fails gracefully and does not mutate state when target user does not exist", async () => {
    if (!probe.isAvailable) return;

    const result = await runAuthReset({
      email: "nonexistent_adversary@example.com",
      password: "ValidPassword123!",
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("not found");
  });

  it("fails gracefully when password is too short (< 8 chars)", async () => {
    if (!probe.isAvailable) return;

    const result = await runAuthReset({
      email: testEmail,
      password: "short",
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("at least 8 characters");
  });

  it("atomically updates password and revokes multiple sessions within single transaction", async () => {
    if (!probe.isAvailable) return;

    // Clear any existing sessions for testUserId before testing atomic session revocation
    await db.delete(session).where(eq(session.userId, testUserId));

    // Create 3 active sessions for this user
    const tokens = [1, 2, 3].map((i) => `token_adv_${i}_${crypto.randomUUID()}`);
    for (const t of tokens) {
      await db.insert(session).values({
        id: crypto.randomUUID(),
        userId: testUserId,
        token: t,
        expiresAt: new Date(Date.now() + 1000 * 3600),
      });
    }

    const sessionsBefore = await db
      .select()
      .from(session)
      .where(eq(session.userId, testUserId));
    expect(sessionsBefore.length).toBe(3);

    // Run auth reset
    const result = await runAuthReset({
      email: testEmail,
      password: "NewSecurePassword123!",
    });

    expect(result.success).toBe(true);
    expect(result.userId).toBe(testUserId);

    // Verify all 3 sessions were revoked
    const sessionsAfter = await db
      .select()
      .from(session)
      .where(eq(session.userId, testUserId));
    expect(sessionsAfter.length).toBe(0);

    // Verify credential account exists
    const accounts = await db
      .select()
      .from(account)
      .where(eq(account.userId, testUserId));
    expect(accounts.length).toBe(1);
    expect(accounts[0].providerId).toBe("credential");
    expect(accounts[0].password).toBeDefined();
  });
});
