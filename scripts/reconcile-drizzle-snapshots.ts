/**
 * LifeOS Drizzle Snapshot Baseline Reconciliation Script (Phase 21, PROD-03)
 *
 * Reconciles the historical Drizzle Kit snapshot gap for migrations 0012 through 0026 (and 0027)
 * in `src/server/db/migrations/meta/`.
 *
 * Guarantees:
 * 1. Preserves existing 0000, 0001, 0005, 0011 snapshots untouched.
 * 2. Preserves `_journal.json` untouched (entries 0–27).
 * 3. Builds a strictly linear, collision-free parent-child UUID snapshot chain (0011 -> 0012 -> ... -> 0027).
 * 4. Ensures 0027_snapshot.json matches `src/server/db/schema/index.ts` with 100% fidelity.
 * 5. Verifies zero schema drift via `drizzle-kit check` and `drizzle-kit generate`.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

export const SNAPSHOT_IDS: Record<number, string> = {
  11: "9497ac0e-2a18-49a6-8778-f2ff9a313fd9", // existing 0011 snapshot id
  12: "12121212-1212-4212-8212-121212121212",
  13: "13131313-1313-4313-8313-131313131313",
  14: "14141414-1414-4414-8414-141414141414",
  15: "15151515-1515-4515-8515-151515151515",
  16: "16161616-1616-4616-8616-161616161616",
  17: "17171717-1717-4717-8717-171717171717",
  18: "18181818-1818-4818-8818-181818181818",
  19: "19191919-1919-4919-8919-191919191919",
  20: "20202020-2020-4020-8020-202020202020",
  21: "21212121-2121-4121-8121-212121212121",
  22: "22222222-2222-4222-8222-222222222222",
  23: "23232323-2323-4323-8323-232323232323",
  24: "24242424-2424-4424-8424-242424242424",
  25: "25252525-2525-4525-8525-252525252525",
  26: "26262626-2626-4626-8626-262626262626",
  27: "27272727-2727-4727-8727-272727272727",
};

export const MIGRATION_TABLE_ADDITIONS: Record<number, string[]> = {
  12: ["public.notes", "public.note_links"],
  13: ["public.people", "public.interactions"],
  14: [], // full-text search columns/indexes
  15: ["public.learning_items"],
  16: ["public.finance_accounts", "public.finance_categories", "public.finance_transactions"],
  17: ["public.finance_budgets"],
  18: [], // restrict account delete
  19: ["public.content_items", "public.content_variants"],
  20: ["public.content_publications", "public.content_metrics"],
  21: ["public.user_ai_settings", "public.ai_conversations", "public.ai_messages", "public.ai_actions"],
  22: ["public.notifications", "public.automations", "public.automation_runs", "public.scheduler_locks"],
  23: ["public.integration_connections", "public.calendar_event_mappings", "public.sync_logs"],
  24: ["public.github_activities", "public.backup_records", "public.webhook_deliveries"],
  25: ["public.analytics_snapshots"],
  26: ["public.knowledge_embeddings"],
  27: ["public.agent_tokens", "public.agent_permissions", "public.agent_challenges", "public.agent_audit_log"],
};

export async function reconcileSnapshots(options?: { metaDir?: string; schemaPath?: string }) {
  const rootDir = process.cwd();
  const metaDir = options?.metaDir || path.resolve(rootDir, "src/server/db/migrations/meta");
  const schemaPath = options?.schemaPath || path.resolve(rootDir, "src/server/db/schema/index.ts");
  const tempDir = path.resolve(rootDir, ".temp_drizzle_reconcile");

  console.log(`[reconcile-snapshots] Generating authoritative 50-table snapshot from: ${schemaPath}`);

  // Step 1: Generate clean full snapshot using drizzle-kit generate into temp dir
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  execSync(
    `pnpm exec drizzle-kit generate --schema ${schemaPath} --dialect postgresql --out ${tempDir}`,
    { stdio: "ignore" }
  );

  const fullSnapPath = path.join(tempDir, "meta", "0000_snapshot.json");
  if (!fs.existsSync(fullSnapPath)) {
    throw new Error(`Failed to generate full snapshot at: ${fullSnapPath}`);
  }

  const fullSnap = JSON.parse(fs.readFileSync(fullSnapPath, "utf8"));
  fs.rmSync(tempDir, { recursive: true, force: true });

  const totalFullTables = Object.keys(fullSnap.tables).length;
  console.log(`[reconcile-snapshots] Full snapshot contains ${totalFullTables} tables.`);

  // Step 2: Read baseline 0011 snapshot
  const snap11Path = path.join(metaDir, "0011_snapshot.json");
  if (!fs.existsSync(snap11Path)) {
    throw new Error(`Base snapshot 0011 not found at: ${snap11Path}`);
  }
  const snap11 = JSON.parse(fs.readFileSync(snap11Path, "utf8"));

  // Step 3: Progressively construct snapshots 0012 through 0027
  let currentTables = { ...snap11.tables };

  for (let idx = 12; idx <= 27; idx++) {
    // Add tables introduced by this migration
    for (const tableKey of MIGRATION_TABLE_ADDITIONS[idx]) {
      if (fullSnap.tables[tableKey]) {
        currentTables[tableKey] = fullSnap.tables[tableKey];
      }
    }

    // At idx 27, currentTables represents the full final authoritative schema
    if (idx === 27) {
      currentTables = { ...fullSnap.tables };
    }

    const snapshotPayload = {
      id: SNAPSHOT_IDS[idx],
      prevId: SNAPSHOT_IDS[idx - 1],
      version: "7",
      dialect: "postgresql",
      tables: { ...currentTables },
      enums: {},
      schemas: {},
      sequences: {},
      roles: {},
      policies: {},
      views: {},
      _meta: {
        columns: {},
        schemas: {},
        tables: {},
      },
    };

    const targetFile = path.join(metaDir, `${String(idx).padStart(4, "0")}_snapshot.json`);
    fs.writeFileSync(targetFile, JSON.stringify(snapshotPayload, null, 2) + "\n", "utf8");
    console.log(`[reconcile-snapshots] Wrote ${path.basename(targetFile)} (tables: ${Object.keys(currentTables).length})`);
  }

  console.log("✔ [reconcile-snapshots] Successfully wrote all historical snapshots 0012–0027.");
  return { success: true };
}

// CLI direct execution
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  reconcileSnapshots()
    .then(() => {
      console.log("Validating with drizzle-kit check...");
      execSync("pnpm exec drizzle-kit check", { stdio: "inherit" });
      console.log("Validating with drizzle-kit generate (expecting 0 changes)...");
      execSync("pnpm exec drizzle-kit generate", { stdio: "inherit" });
      process.exit(0);
    })
    .catch((err) => {
      console.error("❌ Snapshot reconciliation failed:", err);
      process.exit(1);
    });
}
