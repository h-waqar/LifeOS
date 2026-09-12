import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { probeDatabase, type ProbeResult } from "../plan-02/db-probe";
import { db, pool, closeDatabase } from "@/server/db";
import { user, session, account, verification } from "@/server/db/schema/auth";
import { userPreferences } from "@/server/db/schema/preferences";
import { auditLog } from "@/server/db/schema/audit";
import { auth } from "@/server/auth";
import { sql } from "drizzle-orm";

describe("Plan 01-04.1: Atomic Single-User Registration & Concurrency Hardening", () => {
  let probe: ProbeResult;

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await cleanAuthTables();
      await closeDatabase();
    }
  });

  async function cleanAuthTables() {
    // Truncate all dependent auth tables cleanly
    await db.execute(
      sql`TRUNCATE TABLE "session", "account", "verification", "user_preferences", "audit_log", "user" CASCADE;`
    );
  }

  beforeEach(async () => {
    if (probe?.isAvailable) {
      await cleanAuthTables();
    }
  });

  describe("Section 1 & 2: Proving the Registration Race is Closed", () => {
    it("atomically serializes concurrent registrations via barrier: exactly 1 succeeds, all others rejected", async () => {
      if (!probe.isAvailable) return;

      const CONCURRENCY_LEVEL = 4;
      const ITERATIONS = 5;

      for (let iteration = 0; iteration < ITERATIONS; iteration++) {
        await cleanAuthTables();

        // 1. Verify database starts 100% clean
        const initialUsers = await db.select().from(user);
        expect(
          initialUsers.length,
          `Iteration ${iteration}: DB must be clean before starting`
        ).toBe(0);

        // 2. Setup synchronization barrier (latch) to guarantee request overlap
        let releaseBarrier: () => void;
        const barrierPromise = new Promise<void>((resolve) => {
          releaseBarrier = resolve;
        });

        // 3. Prepare concurrent registration requests
        const registrationPromises = Array.from({ length: CONCURRENCY_LEVEL }).map(
          async (_, idx) => {
            // Await the synchronization latch so all tasks fire into the event loop simultaneously
            await barrierPromise;

            return auth.api.signUpEmail({
              body: {
                email: `racing_user_${iteration}_${idx}@example.com`,
                password: `P@ssword${iteration}${idx}!`,
                name: `Racing User ${iteration}-${idx}`,
              },
            });
          }
        );

        // 4. Release barrier simultaneously
        releaseBarrier!();

        // 5. Await all concurrent outcomes
        const results = await Promise.allSettled(registrationPromises);

        const fulfilled = results.filter((r) => r.status === "fulfilled");
        const rejected = results.filter((r) => r.status === "rejected");

        // 6. Assertions:
        // - Exactly 1 registration must succeed
        expect(
          fulfilled.length,
          `Iteration ${iteration}: Exactly one concurrent registration must fulfill (got ${fulfilled.length})`
        ).toBe(1);

        // - All other registration requests must be rejected
        expect(
          rejected.length,
          `Iteration ${iteration}: Exactly ${CONCURRENCY_LEVEL - 1} registrations must be rejected (got ${rejected.length})`
        ).toBe(CONCURRENCY_LEVEL - 1);

        // - PostgreSQL must contain EXACTLY one user row
        const usersInDb = await db.select().from(user);
        expect(
          usersInDb.length,
          `Iteration ${iteration}: PostgreSQL must contain exactly 1 user row in "user" table (got ${usersInDb.length})`
        ).toBe(1);

        // - The single user in PostgreSQL must have single_user_lock = true
        expect(usersInDb[0].singleUserLock).toBe(true);

        // - Exactly one set of user preferences must exist
        const prefsInDb = await db.select().from(userPreferences);
        expect(prefsInDb.length).toBe(1);
        expect(prefsInDb[0].userId).toBe(usersInDb[0].id);
      }
    });

    it("enforces that subsequent registration after the owner exists fails with 403 Forbidden", async () => {
      if (!probe.isAvailable) return;

      // Register owner
      const ownerRes = await auth.api.signUpEmail({
        body: {
          email: "primary_owner@example.com",
          password: "OwnerPassword123!",
          name: "Owner",
        },
      });
      expect(ownerRes.user?.id).toBeDefined();

      // Subsequent registration must fail closed with 403 Forbidden
      let errorCaught: any = null;
      try {
        await auth.api.signUpEmail({
          body: {
            email: "second_user@example.com",
            password: "SecondPassword123!",
            name: "Second User",
          },
        });
      } catch (err) {
        errorCaught = err;
      }

      expect(errorCaught).toBeDefined();
      expect(errorCaught.statusCode || errorCaught.status).toBe(403);
      expect(errorCaught.body?.message).toContain("single-user");

      // Verify still only 1 user exists
      const totalUsers = await db.select().from(user);
      expect(totalUsers.length).toBe(1);
    });
  });

  describe("Section 3: Database Invariant Audit & Non-Bypassability", () => {
    it("Database Object Audit: user_single_user_lock_unique prevents second user via direct SQL", async () => {
      if (!probe.isAvailable) return;

      // 1. Insert primary owner directly via Drizzle
      const ownerId = "owner_" + crypto.randomUUID().slice(0, 8);
      await db.insert(user).values({
        id: ownerId,
        name: "Direct Owner",
        email: "direct_owner@example.com",
      });

      // 2. Attempt to insert second user directly via SQL
      const adversaryId = "adversary_" + crypto.randomUUID().slice(0, 8);
      let sqlError: any = null;

      try {
        await db.insert(user).values({
          id: adversaryId,
          name: "Direct Adversary",
          email: "direct_adversary@example.com",
        });
      } catch (err) {
        sqlError = err;
      }

      // Assert PostgreSQL storage engine rejected the insert
      expect(sqlError).toBeDefined();
      expect(sqlError.code || sqlError.cause?.code).toBe("23505"); // PostgreSQL unique_violation
      const constraintName = sqlError.constraint || sqlError.cause?.constraint;
      expect(constraintName).toBe("user_single_user_lock_unique");

      // Assert only 1 user exists in table
      const rows = await db.select().from(user);
      expect(rows.length).toBe(1);
      expect(rows[0].id).toBe(ownerId);
    });

    it("Bypass Resistance: Raw client.query cannot insert second user bypassing Better Auth", async () => {
      if (!probe.isAvailable) return;

      const client = await pool.connect();
      try {
        // Insert first user via raw SQL
        await client.query(`
          INSERT INTO "user" ("id", "name", "email", "email_verified", "created_at", "updated_at")
          VALUES ('raw_user_1', 'Raw Owner', 'raw_owner@example.com', false, NOW(), NOW());
        `);

        // Attempt to insert second user via raw SQL
        let rawError: any = null;
        try {
          await client.query(`
            INSERT INTO "user" ("id", "name", "email", "email_verified", "created_at", "updated_at")
            VALUES ('raw_user_2', 'Raw Adversary', 'raw_adversary@example.com', false, NOW(), NOW());
          `);
        } catch (err) {
          rawError = err;
        }

        expect(rawError).toBeDefined();
        expect(rawError.code).toBe("23505");
        expect(rawError.constraint).toBe("user_single_user_lock_unique");

        const countRes = await client.query('SELECT COUNT(*)::int as count FROM "user"');
        expect(countRes.rows[0].count).toBe(1);
      } finally {
        client.release();
      }
    });

    it("Constraint Integrity: CHECK constraint rejects single_user_lock = false", async () => {
      if (!probe.isAvailable) return;

      const client = await pool.connect();
      try {
        let checkError: any = null;
        try {
          // Attempt to bypass unique constraint by passing false
          await client.query(`
            INSERT INTO "user" ("id", "name", "email", "email_verified", "single_user_lock", "created_at", "updated_at")
            VALUES ('invalid_val', 'Invalid Check', 'invalid_check@example.com', false, false, NOW(), NOW());
          `);
        } catch (err) {
          checkError = err;
        }

        expect(checkError).toBeDefined();
        expect(checkError.code).toBe("23514"); // PostgreSQL check_violation
        expect(checkError.constraint).toBe("user_single_user_lock_check");
      } finally {
        client.release();
      }
    });

    it("Constraint Integrity: NOT NULL constraint rejects single_user_lock = NULL", async () => {
      if (!probe.isAvailable) return;

      const client = await pool.connect();
      try {
        let notNullError: any = null;
        try {
          // Attempt to bypass unique constraint by passing NULL
          await client.query(`
            INSERT INTO "user" ("id", "name", "email", "email_verified", "single_user_lock", "created_at", "updated_at")
            VALUES ('null_val', 'Null Check', 'null_check@example.com', false, NULL, NOW(), NOW());
          `);
        } catch (err) {
          notNullError = err;
        }

        expect(notNullError).toBeDefined();
        expect(notNullError.code).toBe("23502"); // PostgreSQL not_null_violation
      } finally {
        client.release();
      }
    });

    it("Transactional Concurrency: Concurrent PostgreSQL transactions block and serialize on index lock", async () => {
      if (!probe.isAvailable) return;

      const clientA = await pool.connect();
      const clientB = await pool.connect();

      try {
        await clientA.query("BEGIN");
        await clientB.query("BEGIN");

        // Transaction A inserts user
        await clientA.query(`
          INSERT INTO "user" ("id", "name", "email", "email_verified", "created_at", "updated_at")
          VALUES ('tx_user_a', 'Tx A', 'tx_a@example.com', false, NOW(), NOW());
        `);

        // Transaction B attempts to insert user while Transaction A is still uncommitted.
        // PostgreSQL places Transaction B in a waiting state on the index tuple lock.
        let txBFinished = false;
        let txBError: any = null;

        const txBPromise = clientB
          .query(`
            INSERT INTO "user" ("id", "name", "email", "email_verified", "created_at", "updated_at")
            VALUES ('tx_user_b', 'Tx B', 'tx_b@example.com', false, NOW(), NOW());
          `)
          .then(() => {
            txBFinished = true;
          })
          .catch((err) => {
            txBError = err;
          });

        // Give event loop a short window to confirm Transaction B is truly blocked
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(txBFinished, "Transaction B must be blocked waiting on Transaction A").toBe(false);

        // Commit Transaction A
        await clientA.query("COMMIT");

        // Await Transaction B completion: it must immediately fail with unique_violation
        await txBPromise;
        expect(txBError).toBeDefined();
        expect(txBError.code).toBe("23505");
        expect(txBError.constraint).toBe("user_single_user_lock_unique");

        await clientB.query("ROLLBACK");

        // Exactly 1 user committed
        const countRes = await clientA.query('SELECT COUNT(*)::int as count FROM "user"');
        expect(countRes.rows[0].count).toBe(1);
      } finally {
        clientA.release();
        clientB.release();
      }
    });

    it("ACID Consistency: Rolled-back transaction leaves database clean and allows subsequent insert", async () => {
      if (!probe.isAvailable) return;

      const client = await pool.connect();
      try {
        // Start transaction, insert user, and rollback
        await client.query("BEGIN");
        await client.query(`
          INSERT INTO "user" ("id", "name", "email", "email_verified", "created_at", "updated_at")
          VALUES ('rollback_user', 'Rollback User', 'rollback@example.com', false, NOW(), NOW());
        `);
        await client.query("ROLLBACK");

        // Verify zero users exist after rollback
        const afterRollback = await client.query('SELECT COUNT(*)::int as count FROM "user"');
        expect(afterRollback.rows[0].count).toBe(0);

        // Verify a subsequent insert now succeeds without conflicting with rolled back transaction
        await client.query(`
          INSERT INTO "user" ("id", "name", "email", "email_verified", "created_at", "updated_at")
          VALUES ('valid_user', 'Valid User', 'valid@example.com', false, NOW(), NOW());
        `);

        const finalCount = await client.query('SELECT COUNT(*)::int as count FROM "user"');
        expect(finalCount.rows[0].count).toBe(1);
      } finally {
        client.release();
      }
    });
  });
});
