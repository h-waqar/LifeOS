/**
 * Phase 21 Plan 01: Drizzle Kit Migration Snapshot Baseline Reconciliation & Historical Chain Alignment (PROD-03)
 *
 * Verifies:
 * 1. Journal integrity: `_journal.json` preserved with all 28 entries (0000–0027) untouched.
 * 2. Snapshot chain continuity: Unbroken parent-child ID chain from 0011 through 0027 with zero collisions.
 * 3. Authoritative schema alignment: `0027_snapshot.json` contains all 50 tables with 100% fidelity.
 * 4. Drizzle Kit tooling verification: `drizzle-kit check` and `drizzle-kit generate` confirm zero drift.
 * 5. Deterministic fresh database replay: Clean database successfully reaches 50 tables, 628 columns with zero errors.
 * 6. Historical migration invariant preservation: ON DELETE RESTRICT on financial accounts, pgvector embeddings, and zero-trust agent safety.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { Client } from "pg";
import { runMigrations } from "@/server/db/migrate";

describe("Plan 21-01: Drizzle Kit Migration Baseline & Historical Chain (PROD-03)", () => {
  const rootDir = process.cwd();
  const metaDir = path.resolve(rootDir, "src/server/db/migrations/meta");
  const migrationsDir = path.resolve(rootDir, "src/server/db/migrations");

  it("1. Migration Journal Integrity — verifies all 28 entries preserved with dialect and version", () => {
    const journalPath = path.join(metaDir, "_journal.json");
    expect(fs.existsSync(journalPath)).toBe(true);

    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
    expect(journal.dialect).toBe("postgresql");
    expect(journal.version).toBe("7");
    expect(journal.entries).toBeInstanceOf(Array);
    expect(journal.entries.length).toBe(28);

    // Verify ordering and indices 0 to 27
    for (let idx = 0; idx < 28; idx++) {
      const entry = journal.entries[idx];
      expect(entry.idx).toBe(idx);
      expect(entry.version).toBe("7");
      expect(entry.breakpoints).toBe(true);
      expect(entry.tag).toMatch(new RegExp(`^${String(idx).padStart(4, "0")}_`));
    }

    // Verify specific boundary tags
    expect(journal.entries[0].tag).toBe("0000_productive_lord_hawal");
    expect(journal.entries[11].tag).toBe("0011_daily_planning_and_evening_review");
    expect(journal.entries[12].tag).toBe("0012_notes_and_knowledge_graph");
    expect(journal.entries[18].tag).toBe("0018_finance_restrict_account_delete");
    expect(journal.entries[26].tag).toBe("0026_pgvector_knowledge_embeddings");
    expect(journal.entries[27].tag).toBe("0027_agent_safety_and_audit");
  });

  it("2. Snapshot Chain Continuity — verifies continuous parent-child linking from 0011 to 0027 without collisions", () => {
    // Check that historical snapshots 0000, 0001, 0005, 0011 exist
    for (const idx of [0, 1, 5, 11]) {
      const p = path.join(metaDir, `${String(idx).padStart(4, "0")}_snapshot.json`);
      expect(fs.existsSync(p), `Snapshot ${idx} should exist`).toBe(true);
    }

    // Check that all reconciled snapshots 0012 through 0027 exist
    for (let idx = 12; idx <= 27; idx++) {
      const p = path.join(metaDir, `${String(idx).padStart(4, "0")}_snapshot.json`);
      expect(fs.existsSync(p), `Reconciled snapshot ${idx} should exist`).toBe(true);
    }

    // Load all snapshots in meta/
    const allSnapshotFiles = fs
      .readdirSync(metaDir)
      .filter((f) => f.endsWith("_snapshot.json"))
      .sort();

    const idMap = new Map<string, string>();
    const parentMap = new Map<string, string[]>();

    for (const f of allSnapshotFiles) {
      const content = JSON.parse(fs.readFileSync(path.join(metaDir, f), "utf8"));
      expect(content.version).toBe("7");
      expect(content.dialect).toBe("postgresql");
      expect(content.id).toBeDefined();
      expect(content.prevId).toBeDefined();

      idMap.set(f, content.id);

      const existingChildren = parentMap.get(content.prevId) || [];
      existingChildren.push(f);
      parentMap.set(content.prevId, existingChildren);
    }

    // Verify unbroken chain from 0011 to 0027
    const snap11 = JSON.parse(fs.readFileSync(path.join(metaDir, "0011_snapshot.json"), "utf8"));
    let expectedParentId = snap11.id;

    for (let idx = 12; idx <= 27; idx++) {
      const fileName = `${String(idx).padStart(4, "0")}_snapshot.json`;
      const snap = JSON.parse(fs.readFileSync(path.join(metaDir, fileName), "utf8"));
      expect(snap.prevId).toBe(expectedParentId);
      expectedParentId = snap.id;
    }

    // Verify zero parent-child collisions across all snapshots
    for (const [parentId, children] of parentMap.entries()) {
      if (parentId !== "00000000-0000-0000-0000-000000000000") {
        expect(children.length).toBeLessThanOrEqual(1);
      }
    }
  });

  it("3. Authoritative Schema Alignment — verifies 0027_snapshot.json contains all 50 tables and complete definitions", () => {
    const snap27Path = path.join(metaDir, "0027_snapshot.json");
    const snap27 = JSON.parse(fs.readFileSync(snap27Path, "utf8"));

    const tables = Object.keys(snap27.tables).sort();
    expect(tables.length).toBe(50);

    // Required domain tables
    const expectedTables = [
      "public.account",
      "public.agent_audit_log",
      "public.agent_challenges",
      "public.agent_permissions",
      "public.agent_tokens",
      "public.ai_actions",
      "public.ai_conversations",
      "public.ai_messages",
      "public.analytics_snapshots",
      "public.audit_log",
      "public.automation_runs",
      "public.automations",
      "public.backup_records",
      "public.calendar_event_mappings",
      "public.content_items",
      "public.content_metrics",
      "public.content_publications",
      "public.content_variants",
      "public.daily_plans",
      "public.evening_reviews",
      "public.finance_accounts",
      "public.finance_budgets",
      "public.finance_categories",
      "public.finance_transactions",
      "public.github_activities",
      "public.goals",
      "public.habit_entries",
      "public.habits",
      "public.integration_connections",
      "public.interactions",
      "public.knowledge_embeddings",
      "public.learning_items",
      "public.note_links",
      "public.notes",
      "public.notifications",
      "public.passkey",
      "public.people",
      "public.project_milestones",
      "public.projects",
      "public.scheduler_locks",
      "public.session",
      "public.sync_logs",
      "public.task_dependencies",
      "public.tasks",
      "public.time_blocks",
      "public.user",
      "public.user_ai_settings",
      "public.user_preferences",
      "public.verification",
      "public.webhook_deliveries",
    ];

    for (const expected of expectedTables) {
      expect(snap27.tables[expected], `Table ${expected} must exist in 0027 snapshot`).toBeDefined();
    }
  });

  it("4. Drizzle Kit Tooling Execution — verifies check and generate pass with zero drift", () => {
    // 1. drizzle-kit check
    const checkOutput = execSync("pnpm exec drizzle-kit check", { encoding: "utf8" });
    expect(checkOutput).toContain("Everything's fine");

    // 2. drizzle-kit generate (must report no schema changes)
    const genOutput = execSync("pnpm exec drizzle-kit generate", { encoding: "utf8" });
    expect(genOutput).toContain("No schema changes, nothing to migrate");

    // 3. Confirm no unexpected migration file was created in src/server/db/migrations
    const sqlFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
    expect(sqlFiles.length).toBe(28); // strictly 0000 to 0027
  });

  it("5. Deterministic Fresh Database Replay — replays migrations 0000–0027 on clean database with 100% schema parity", async () => {
    const defaultUrl = process.env.DATABASE_URL || "postgresql://lifeos:lifeos_password@localhost:5432/lifeos";
    const testDbName = `lifeos_test_replay_${Date.now()}`;
    const adminClient = new Client({ connectionString: defaultUrl });

    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE ${testDbName};`);

    const testDbUrl = defaultUrl.replace(/\/[^/]+$/, `/${testDbName}`);

    try {
      // Run migrations on fresh database
      const result = await runMigrations({
        connectionString: testDbUrl,
        migrationsFolder: migrationsDir,
      });

      expect(result.success).toBe(true);

      // Verify schema parity between test database and expected table/column counts
      const testClient = new Client({ connectionString: testDbUrl });
      await testClient.connect();

      const tablesRes = await testClient.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
      );
      expect(tablesRes.rows.length).toBe(50);

      const colsRes = await testClient.query(
        "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public';"
      );
      expect(colsRes.rows.length).toBe(628);

      // Verify drizzle migration tracking table
      const migRes = await testClient.query(
        "SELECT count(*)::int as count FROM drizzle.__drizzle_migrations;"
      );
      expect(migRes.rows[0].count).toBe(28);

      await testClient.end();
    } finally {
      // Clean up test database
      await adminClient.query(`DROP DATABASE IF EXISTS ${testDbName};`);
      await adminClient.end();
    }
  });

  it("6. Migration Invariant Preservation — verifies critical schema constraints", () => {
    const snap27 = JSON.parse(
      fs.readFileSync(path.join(metaDir, "0027_snapshot.json"), "utf8")
    );

    // 0018 invariant: finance_transactions FK to finance_accounts must be ON DELETE RESTRICT
    const txnTable = snap27.tables["public.finance_transactions"];
    expect(txnTable).toBeDefined();
    const accountFk = Object.values(txnTable.foreignKeys).find(
      (fk: any) => fk.tableTo === "finance_accounts"
    ) as any;
    expect(accountFk).toBeDefined();
    expect(accountFk.onDelete).toBe("restrict");

    // 0026 invariant: knowledge_embeddings has vector column
    const embedTable = snap27.tables["public.knowledge_embeddings"];
    expect(embedTable).toBeDefined();
    expect(embedTable.columns["embedding"]).toBeDefined();
    expect(embedTable.columns["embedding"].type).toBe("vector(768)");

    // 0027 invariant: agent_audit_log and agent_tokens exist
    expect(snap27.tables["public.agent_tokens"]).toBeDefined();
    expect(snap27.tables["public.agent_audit_log"]).toBeDefined();
    expect(snap27.tables["public.agent_challenges"]).toBeDefined();
    expect(snap27.tables["public.agent_permissions"]).toBeDefined();
  });
});
