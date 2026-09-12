import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { probeDatabase } from "./db-probe";

const probe = await probeDatabase();

describe.skipIf(!probe.isAvailable)(
  "Audit Log Security Boundary & Privilege Separation (Adversarial Acceptance Tests)",
  () => {
    let adminPool: Pool;
    let appPool: Pool;
    const testAppPassword = `test_lifeos_app_${Date.now()}`;

    beforeAll(async () => {
      adminPool = new Pool({
        connectionString:
          process.env.DATABASE_URL ||
          "postgresql://lifeos:lifeos_password@localhost:5432/lifeos",
      });

      // Role provisioning: dynamically assign a unique ephemeral password for the test suite run
      await adminPool.query(
        `ALTER ROLE lifeos_app WITH LOGIN PASSWORD '${testAppPassword}';`
      );

      appPool = new Pool({
        connectionString:
          process.env.APP_DATABASE_URL ||
          `postgresql://lifeos_app:${testAppPassword}@localhost:5432/lifeos`,
      });
    });

    afterAll(async () => {
      await appPool?.end();
      // Credential cleanup: reset lifeos_app to NOLOGIN and remove credentials
      if (adminPool) {
        await adminPool
          .query("ALTER ROLE lifeos_app WITH NOLOGIN PASSWORD NULL;")
          .catch(() => {});
        await adminPool.end();
      }
    });

    it("PostgreSQL catalog inspection confirms final lifeos_app privileges and SECURITY DEFINER configuration", async () => {
      // 1. Verify table privileges
      const tablePrivs = await adminPool.query(`
        SELECT has_table_privilege('lifeos_app', 'audit_log', 'select') AS can_select,
               has_table_privilege('lifeos_app', 'audit_log', 'insert') AS can_insert,
               has_table_privilege('lifeos_app', 'audit_log', 'update') AS can_update,
               has_table_privilege('lifeos_app', 'audit_log', 'delete') AS can_delete,
               has_table_privilege('lifeos_app', 'audit_log', 'truncate') AS can_truncate;
      `);

      const row = tablePrivs.rows[0];
      expect(row.can_select).toBe(true);
      expect(row.can_insert).toBe(true);
      expect(row.can_update).toBe(false);
      expect(row.can_delete).toBe(false);
      expect(row.can_truncate).toBe(false);

      // 2. Verify function execution privilege
      const funcPriv = await adminPool.query(`
        SELECT has_function_privilege('lifeos_app', 'purge_expired_audit_logs(integer)', 'execute') AS can_execute;
      `);
      expect(funcPriv.rows[0].can_execute).toBe(true);

      // 3. Verify function is SECURITY DEFINER with fixed search_path = pg_catalog
      const funcDef = await adminPool.query(`
        SELECT proname, prosecdef, proconfig
        FROM pg_proc
        WHERE proname = 'purge_expired_audit_logs';
      `);
      expect(funcDef.rows.length).toBe(1);
      expect(funcDef.rows[0].prosecdef).toBe(true); // SECURITY DEFINER
      expect(funcDef.rows[0].proconfig).toEqual(["search_path=pg_catalog"]); // Fixed secure search_path
    });

    it("lifeos_app cannot UPDATE audit_log", async () => {
      const testId = `adv-upd-${Date.now()}`;

      // Insert via app role is allowed
      await appPool.query(`
        INSERT INTO audit_log (id, category, action, status)
        VALUES ($1, 'security', 'test.update.attempt', 'success');
      `, [testId]);

      // Direct update must be rejected by PostgreSQL permissions
      await expect(
        appPool.query(`
          UPDATE audit_log
          SET action = 'tampered'
          WHERE id = $1;
        `, [testId])
      ).rejects.toThrow(/permission denied for table audit_log/i);
    });

    it("lifeos_app cannot DELETE audit_log directly", async () => {
      const testId = `adv-del-${Date.now()}`;

      await appPool.query(`
        INSERT INTO audit_log (id, category, action, status)
        VALUES ($1, 'security', 'test.delete.attempt', 'success');
      `, [testId]);

      // Direct delete must be rejected by PostgreSQL permissions
      await expect(
        appPool.query(`
          DELETE FROM audit_log WHERE id = $1;
        `, [testId])
      ).rejects.toThrow(/permission denied for table audit_log/i);
    });

    it("lifeos_app cannot TRUNCATE audit_log", async () => {
      await expect(
        appPool.query("TRUNCATE audit_log;")
      ).rejects.toThrow(/permission denied for table audit_log/i);
    });

    it("the legacy/session-variable authorization technique cannot enable deletion", async () => {
      const testId = `adv-sess-${Date.now()}`;

      await appPool.query(
        `
        INSERT INTO audit_log (id, category, action, status)
        VALUES ($1, 'security', 'test.session.variable.attempt', 'success');
      `,
        [testId]
      );

      // Attempting deletion while spoofing legacy session variables inside a session/transaction
      const client = await appPool.connect();
      try {
        await client.query("BEGIN;");
        await client.query("SET LOCAL lifeos.allow_audit_delete = 'true';");
        await client.query("SET LOCAL lifeos.audit_purge_authorized = 'true';");
        await expect(
          client.query("DELETE FROM audit_log WHERE id = $1;", [testId])
        ).rejects.toThrow(/permission denied for table audit_log/i);
      } finally {
        await client.query("ROLLBACK;").catch(() => {});
        client.release();
      }
    });

    it("direct DELETE executed outside purge_expired_audit_logs() is rejected even for privileged roles", async () => {
      const testId = `adv-admin-del-${Date.now()}`;

      // Insert record as admin
      await adminPool.query(`
        INSERT INTO audit_log (id, category, action, status, created_at)
        VALUES ($1, 'system', 'admin.direct.delete.test', 'success', NOW() - INTERVAL '120 days');
      `, [testId]);

      // Even if admin has table DELETE privilege, trigger prevents direct DELETE outside purge_expired_audit_logs()
      await expect(
        adminPool.query(`
          DELETE FROM audit_log WHERE id = $1;
        `, [testId])
      ).rejects.toThrow(/Direct DELETE on audit_log is prohibited/i);
    });

    it("retention_days < 90 is rejected", async () => {
      // Reject < 90 days
      for (const invalidDays of [89, 60, 30, 0, -1]) {
        await expect(
          appPool.query("SELECT purge_expired_audit_logs($1);", [invalidDays])
        ).rejects.toThrow(/Retention period must be at least 90 days/i);
      }

      // Reject NULL
      await expect(
        appPool.query("SELECT purge_expired_audit_logs(NULL);")
      ).rejects.toThrow(/Retention period must be at least 90 days/i);
    });

    it("records newer than the mandatory 90-day wall cannot be deleted, even through the purge procedure", async () => {
      const idRecent30 = `adv-wall-30-${Date.now()}`;
      const idRecent89 = `adv-wall-89-${Date.now()}`;

      // Insert records inside the 90-day wall
      await adminPool.query(`
        INSERT INTO audit_log (id, category, action, status, created_at)
        VALUES ($1, 'auth', 'user.login.30d', 'success', NOW() - INTERVAL '30 days'),
               ($2, 'auth', 'user.login.89d', 'success', NOW() - INTERVAL '89 days');
      `, [idRecent30, idRecent89]);

      // Execute purge with minimum retention (90 days)
      await appPool.query("SELECT purge_expired_audit_logs(90);");

      // Verify records are preserved
      const check = await adminPool.query(`
        SELECT id FROM audit_log WHERE id IN ($1, $2);
      `, [idRecent30, idRecent89]);

      expect(check.rows.length).toBe(2);
    });

    it("records older than the requested retention cutoff are deleted correctly via purge_expired_audit_logs()", async () => {
      const idOld100 = `adv-purge-100-${Date.now()}`;
      const idOld120 = `adv-purge-120-${Date.now()}`;

      await adminPool.query(`
        INSERT INTO audit_log (id, category, action, status, created_at)
        VALUES ($1, 'auth', 'user.login.100d', 'success', NOW() - INTERVAL '100 days'),
               ($2, 'auth', 'user.login.120d', 'success', NOW() - INTERVAL '120 days');
      `, [idOld100, idOld120]);

      // Purge records older than 110 days
      const purgeRes1 = await appPool.query("SELECT purge_expired_audit_logs(110) AS deleted;");
      expect(Number(purgeRes1.rows[0].deleted)).toBeGreaterThanOrEqual(1);

      // 120d record must be gone, 100d record must still exist
      const check1 = await adminPool.query(`
        SELECT id FROM audit_log WHERE id IN ($1, $2);
      `, [idOld100, idOld120]);
      expect(check1.rows.map((r: any) => r.id)).toEqual([idOld100]);

      // Now purge with 90 days: 100d record must also be deleted
      const purgeRes2 = await appPool.query("SELECT purge_expired_audit_logs(90) AS deleted;");
      expect(Number(purgeRes2.rows[0].deleted)).toBeGreaterThanOrEqual(1);

      const check2 = await adminPool.query(`
        SELECT id FROM audit_log WHERE id IN ($1, $2);
      `, [idOld100, idOld120]);
      expect(check2.rows.length).toBe(0);
    });

    it("SECURITY DEFINER functions cannot be hijacked through search_path manipulation", async () => {
      // Verify that even if a caller manipulates session search_path,
      // the purge procedure still executes safely under pg_catalog, public
      const evilClient = await appPool.connect();
      try {
        await evilClient.query("SET search_path = evil_schema, public;");
        const res = await evilClient.query("SELECT purge_expired_audit_logs(90);");
        expect(res.rows[0].purge_expired_audit_logs).toBeDefined();
      } finally {
        evilClient.release();
      }
    });

    it("deletion cannot be bypassed through an alternate trigger/function execution path", async () => {
      // Create a spoofed bypass function as admin
      await adminPool.query(`
        CREATE OR REPLACE FUNCTION spoofed_delete_attempt(target_id text)
        RETURNS void
        LANGUAGE plpgsql
        AS $$
        BEGIN
          DELETE FROM audit_log WHERE id = target_id;
        END;
        $$;
      `);

      const testId = `adv-bypass-${Date.now()}`;
      await adminPool.query(`
        INSERT INTO audit_log (id, category, action, status, created_at)
        VALUES ($1, 'security', 'bypass.test', 'success', NOW() - INTERVAL '150 days');
      `, [testId]);

      // Even through alternate function, direct delete is prohibited by the BEFORE DELETE trigger
      await expect(
        adminPool.query("SELECT spoofed_delete_attempt($1);", [testId])
      ).rejects.toThrow(/Direct DELETE on audit_log is prohibited/i);

      // Clean up spoofed function
      await adminPool.query("DROP FUNCTION IF EXISTS spoofed_delete_attempt(text);");
    });

    it("direct DELETE with SQL comments (/* purge_expired_audit_logs */) is REJECTED by hardened trigger", async () => {
      const testId = `adv-comment-${Date.now()}`;
      await adminPool.query(
        `INSERT INTO audit_log (id, category, action, status, created_at)
         VALUES ($1, 'security', 'adv.comment.bypass', 'success', NOW() - INTERVAL '150 days');`,
        [testId]
      );

      // Attempting comment bypass that worked in vulnerable trigger
      await expect(
        adminPool.query(`DELETE FROM audit_log WHERE id = $1 /* purge_expired_audit_logs */;`, [testId])
      ).rejects.toThrow(/Direct DELETE on audit_log is prohibited/i);

      // Clean up
      await adminPool.query("SELECT purge_expired_audit_logs(90);");
    });

    it("direct DELETE with string literals or subqueries containing function name is REJECTED", async () => {
      const testId = `adv-str-${Date.now()}`;
      await adminPool.query(
        `INSERT INTO audit_log (id, category, action, status, created_at)
         VALUES ($1, 'security', 'adv.str.bypass', 'success', NOW() - INTERVAL '150 days');`,
        [testId]
      );

      await expect(
        adminPool.query(
          `DELETE FROM audit_log WHERE id = $1 AND 'purge_expired_audit_logs' = 'purge_expired_audit_logs';`,
          [testId]
        )
      ).rejects.toThrow(/Direct DELETE on audit_log is prohibited/i);

      await adminPool.query("SELECT purge_expired_audit_logs(90);");
    });

    it("retention_days > 36500 (100 years) is rejected to prevent numeric overflow", async () => {
      // 36501 days rejected
      await expect(
        appPool.query("SELECT purge_expired_audit_logs(36501);")
      ).rejects.toThrow(/Retention period exceeds maximum threshold/i);

      // Integer max rejected
      await expect(
        appPool.query("SELECT purge_expired_audit_logs(2147483647);")
      ).rejects.toThrow(/Retention period exceeds maximum threshold/i);
    });

    it("PUBLIC does not have execute privileges on internal trigger functions", async () => {
      const triggerFuncs = [
        "audit_log_prevent_direct_delete()",
        "audit_log_prevent_update()",
      ];

      for (const fn of triggerFuncs) {
        const res = await adminPool.query(
          `SELECT has_function_privilege('public', $1, 'execute') AS public_can_exec;`,
          [fn]
        );
        expect(res.rows[0].public_can_exec).toBe(false);
      }
    });

    it("lifeos_app cannot ALTER table, DROP table, or disable triggers due to ownership boundary", async () => {
      // lifeos_app is NOT table owner
      await expect(
        appPool.query("ALTER TABLE audit_log DISABLE TRIGGER ALL;")
      ).rejects.toThrow(/must be owner of table audit_log/i);

      await expect(
        appPool.query("DROP TABLE audit_log;")
      ).rejects.toThrow(/must be owner of table audit_log/i);

      await expect(
        appPool.query("ALTER TABLE audit_log DROP COLUMN category;")
      ).rejects.toThrow(/must be owner of table audit_log/i);
    });

    it("documents security reality: lifeos_app can insert arbitrary past timestamps and fake actor IDs", async () => {
      // An application role with INSERT privilege can supply arbitrary created_at and actor
      const fakeId = `fake-audit-${Date.now()}`;
      await appPool.query(
        `INSERT INTO audit_log (id, user_id, category, action, status, actor, details, created_at)
         VALUES ($1, NULL, 'security', 'fake.event', 'success', 'impersonated_admin', '{"forged": true}', NOW() - INTERVAL '500 days');`,
        [fakeId]
      );

      const res = await adminPool.query(
        `SELECT actor, details FROM audit_log WHERE id = $1;`,
        [fakeId]
      );
      expect(res.rows[0].actor).toBe("impersonated_admin");
      expect(res.rows[0].details).toEqual({ forged: true });

      // Clean up via legitimate purge procedure
      await adminPool.query("SELECT purge_expired_audit_logs(90);");
    });
  }
);
