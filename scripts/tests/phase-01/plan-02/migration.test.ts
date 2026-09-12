import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { runMigrations } from "@/server/db/migrate";

describe("Database Migration Generation & Runner", () => {
  const repoRoot = path.resolve(__dirname, "../../../../");
  const migrationsDir = path.resolve(repoRoot, "src/server/db/migrations");
  const journalPath = path.resolve(migrationsDir, "meta/_journal.json");

  it("verifies the migrations directory exists with journal metadata", () => {
    expect(fs.existsSync(migrationsDir), "Migrations directory must exist").toBe(true);
    expect(fs.existsSync(journalPath), "_journal.json must exist").toBe(true);

    const journalContent = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
    expect(journalContent).toHaveProperty("version");
    expect(journalContent).toHaveProperty("dialect", "postgresql");
    expect(Array.isArray(journalContent.entries)).toBe(true);
    expect(journalContent.entries.length).toBeGreaterThan(0);
  });

  it("verifies generated SQL DDL contains all foundational tables and constraints", () => {
    const sqlFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"));

    expect(sqlFiles.length).toBeGreaterThan(0);

    const combinedSql = sqlFiles
      .map((f) => fs.readFileSync(path.join(migrationsDir, f), "utf-8"))
      .join("\n");

    // All 7 foundational tables must be created
    expect(combinedSql).toContain('CREATE TABLE "user"');
    expect(combinedSql).toContain('CREATE TABLE "session"');
    expect(combinedSql).toContain('CREATE TABLE "account"');
    expect(combinedSql).toContain('CREATE TABLE "verification"');
    expect(combinedSql).toContain('CREATE TABLE "passkey"');
    expect(combinedSql).toContain('CREATE TABLE "user_preferences"');
    expect(combinedSql).toContain('CREATE TABLE "audit_log"');

    // Foreign key constraints
    expect(combinedSql).toContain('REFERENCES "public"."user"("id") ON DELETE cascade');
    expect(combinedSql).toContain('REFERENCES "public"."user"("id") ON DELETE set null');

    // Audit log performance indexes
    expect(combinedSql).toContain('CREATE INDEX "audit_log_category_idx"');
    expect(combinedSql).toContain('CREATE INDEX "audit_log_action_idx"');
    expect(combinedSql).toContain('CREATE INDEX "audit_log_created_at_idx"');
    expect(combinedSql).toContain('CREATE INDEX "audit_log_user_id_idx"');

    // Audit log security boundary and purge function
    expect(combinedSql).toContain("purge_expired_audit_logs");
    expect(combinedSql).toContain("SECURITY DEFINER");
    expect(combinedSql).toContain("lifeos_app");
    expect(combinedSql).toContain("trg_audit_log_prevent_update");
    expect(combinedSql).toContain("trg_audit_log_prevent_direct_delete");
  });

  it("enforces that no migration SQL file contains hardcoded passwords or static credentials", () => {
    const sqlFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"));

    for (const file of sqlFiles) {
      const content = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
      // Migration SQL must not contain PASSWORD keywords or credentials
      expect(content).not.toMatch(/PASSWORD\s+['"][^'"]+['"]/i);
      expect(content).not.toContain("lifeos_app_password");
    }
  });

  it("verifies that audit log delete protection does NOT rely on current_query()", () => {
    const sqlFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"));

    const combinedSql = sqlFiles
      .map((f) => fs.readFileSync(path.join(migrationsDir, f), "utf-8"))
      .join("\n");

    // current_query() is prohibited due to comment bypass vulnerability
    expect(combinedSql).not.toContain("current_query()");
    // Instead, must use transaction-local session setting
    expect(combinedSql).toContain("current_setting('lifeos.in_purge_procedure', true)");
  });

  it("verifies that role creation is provisioned as NOLOGIN without credentials in migrations", () => {
    const sqlFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"));

    const combinedSql = sqlFiles
      .map((f) => fs.readFileSync(path.join(migrationsDir, f), "utf-8"))
      .join("\n");

    expect(combinedSql).toContain("CREATE ROLE lifeos_app NOLOGIN");
  });

  it("verifies generated SQL DDL does not contain any domain tables in initial foundation migration (vertical-slice integrity)", () => {
    const initialMigrationSql = fs.readFileSync(
      path.join(migrationsDir, "0000_productive_lord_hawal.sql"),
      "utf-8"
    );

    const forbiddenTables = [
      'CREATE TABLE "task"',
      'CREATE TABLE "tasks"',
      'CREATE TABLE "project"',
      'CREATE TABLE "projects"',
      'CREATE TABLE "goal"',
      'CREATE TABLE "goals"',
      'CREATE TABLE "habit"',
      'CREATE TABLE "habits"',
      'CREATE TABLE "note"',
      'CREATE TABLE "notes"',
      'CREATE TABLE "person"',
      'CREATE TABLE "people"',
      'CREATE TABLE "transaction"',
      'CREATE TABLE "transactions"',
      'CREATE TABLE "finance"',
    ];

    for (const tableDdl of forbiddenTables) {
      expect(
        initialMigrationSql.includes(tableDdl),
        `Found forbidden domain DDL '${tableDdl}' in initial foundation migration`
      ).toBe(false);
    }
  });

  it("handles migration failure cleanly when target PostgreSQL host is unreachable", async () => {
    // Unreachable host/port
    const invalidUrl = "postgresql://lifeos:pass@127.0.0.1:54329/invalid_db";

    await expect(
      runMigrations({ connectionString: invalidUrl })
    ).rejects.toThrow();
  });
});
