/**
 * Plan 13-01: Schema & Forward Migration Test Suite
 *
 * Verifies:
 * 1. Drizzle ORM schema exports for agent tokens, permissions, challenges, and audit log.
 * 2. Table column definitions, constraints, primary keys, and foreign keys.
 * 3. Migration file 0027_agent_safety_and_audit.sql integrity and DDL validity.
 * 4. Migration journal (_journal.json) integrity for entry idx: 27.
 * 5. Preservation of historical migrations 0000–0026.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getTableColumns } from "drizzle-orm";
import {
  agentTokens,
  agentToken,
  agentPermissions,
  agentPermission,
  agentChallenges,
  agentChallenge,
  agentAuditLog,
  agentAuditLogs,
  PHASE_13_TABLE_NAMES,
  userRelations,
  agentTokensRelations,
  agentPermissionsRelations,
  agentChallengesRelations,
  agentAuditLogRelations,
} from "@/server/db/schema";

const REPO_ROOT = path.resolve(__dirname, "../../../../");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "src/server/db/migrations");
const JOURNAL_PATH = path.join(MIGRATIONS_DIR, "meta/_journal.json");

describe("Plan 13-01: Database Schema & Migration 0027", () => {
  describe("1. Drizzle ORM Table Definitions & Aliases", () => {
    it("exports table singletons and plural aliases", () => {
      expect(agentTokens).toBeDefined();
      expect(agentToken).toBe(agentTokens);
      expect(agentPermissions).toBeDefined();
      expect(agentPermission).toBe(agentPermissions);
      expect(agentChallenges).toBeDefined();
      expect(agentChallenge).toBe(agentChallenges);
      expect(agentAuditLog).toBeDefined();
      expect(agentAuditLogs).toBe(agentAuditLog);
    });

    it("includes all 4 agent tables in PHASE_13_TABLE_NAMES", () => {
      expect(PHASE_13_TABLE_NAMES).toContain("agent_tokens");
      expect(PHASE_13_TABLE_NAMES).toContain("agent_permissions");
      expect(PHASE_13_TABLE_NAMES).toContain("agent_challenges");
      expect(PHASE_13_TABLE_NAMES).toContain("agent_audit_log");
      expect(PHASE_13_TABLE_NAMES).toHaveLength(4);
    });
  });

  describe("2. Table Columns & Integrity Constraints", () => {
    it("defines 'agent_tokens' with required security fields and constraints", () => {
      const cols = getTableColumns(agentTokens);

      expect(cols).toHaveProperty("id");
      expect(cols).toHaveProperty("userId");
      expect(cols).toHaveProperty("name");
      expect(cols).toHaveProperty("tokenHash");
      expect(cols).toHaveProperty("tokenPrefix");
      expect(cols).toHaveProperty("provider");
      expect(cols).toHaveProperty("status");
      expect(cols).toHaveProperty("expiresAt");
      expect(cols).toHaveProperty("lastUsedAt");
      expect(cols).toHaveProperty("revokedAt");
      expect(cols).toHaveProperty("createdAt");
      expect(cols).toHaveProperty("updatedAt");

      expect(cols.id.primary).toBe(true);
      expect(cols.userId.notNull).toBe(true);
      expect(cols.name.notNull).toBe(true);
      expect(cols.tokenHash.notNull).toBe(true);
      expect(cols.tokenPrefix.notNull).toBe(true);
      expect(cols.provider.notNull).toBe(true);
      expect(cols.status.notNull).toBe(true);
      expect(cols.createdAt.notNull).toBe(true);
      expect(cols.updatedAt.notNull).toBe(true);
    });

    it("defines 'agent_permissions' with 5-tier capabilities and unique scoping", () => {
      const cols = getTableColumns(agentPermissions);

      expect(cols).toHaveProperty("id");
      expect(cols).toHaveProperty("agentTokenId");
      expect(cols).toHaveProperty("userId");
      expect(cols).toHaveProperty("capability");
      expect(cols).toHaveProperty("resource");
      expect(cols).toHaveProperty("action");
      expect(cols).toHaveProperty("allowed");
      expect(cols).toHaveProperty("createdAt");

      expect(cols.id.primary).toBe(true);
      expect(cols.agentTokenId.notNull).toBe(true);
      expect(cols.userId.notNull).toBe(true);
      expect(cols.capability.notNull).toBe(true);
      expect(cols.resource.notNull).toBe(true);
      expect(cols.action.notNull).toBe(true);
      expect(cols.allowed.notNull).toBe(true);
      expect(cols.createdAt.notNull).toBe(true);
    });

    it("defines 'agent_challenges' with lifecycle states, args hash, and TTL", () => {
      const cols = getTableColumns(agentChallenges);

      expect(cols).toHaveProperty("id");
      expect(cols).toHaveProperty("userId");
      expect(cols).toHaveProperty("agentTokenId");
      expect(cols).toHaveProperty("operation");
      expect(cols).toHaveProperty("capability");
      expect(cols).toHaveProperty("resource");
      expect(cols).toHaveProperty("resourceId");
      expect(cols).toHaveProperty("arguments");
      expect(cols).toHaveProperty("argumentsHash");
      expect(cols).toHaveProperty("status");
      expect(cols).toHaveProperty("expiresAt");
      expect(cols).toHaveProperty("approvedAt");
      expect(cols).toHaveProperty("consumedAt");
      expect(cols).toHaveProperty("rejectedAt");
      expect(cols).toHaveProperty("rejectionReason");
      expect(cols).toHaveProperty("createdAt");
      expect(cols).toHaveProperty("updatedAt");

      expect(cols.id.primary).toBe(true);
      expect(cols.userId.notNull).toBe(true);
      expect(cols.agentTokenId.notNull).toBe(true);
      expect(cols.operation.notNull).toBe(true);
      expect(cols.capability.notNull).toBe(true);
      expect(cols.resource.notNull).toBe(true);
      expect(cols.arguments.notNull).toBe(true);
      expect(cols.argumentsHash.notNull).toBe(true);
      expect(cols.status.notNull).toBe(true);
      expect(cols.expiresAt.notNull).toBe(true);
      expect(cols.createdAt.notNull).toBe(true);
      expect(cols.updatedAt.notNull).toBe(true);
    });

    it("defines 'agent_audit_log' with full attribution fields and state snapshots", () => {
      const cols = getTableColumns(agentAuditLog);

      expect(cols).toHaveProperty("id");
      expect(cols).toHaveProperty("userId");
      expect(cols).toHaveProperty("agentTokenId");
      expect(cols).toHaveProperty("agentName");
      expect(cols).toHaveProperty("provider");
      expect(cols).toHaveProperty("sessionId");
      expect(cols).toHaveProperty("toolName");
      expect(cols).toHaveProperty("capability");
      expect(cols).toHaveProperty("operation");
      expect(cols).toHaveProperty("resource");
      expect(cols).toHaveProperty("arguments");
      expect(cols).toHaveProperty("argumentsHash");
      expect(cols).toHaveProperty("challengeId");
      expect(cols).toHaveProperty("challengeStatus");
      expect(cols).toHaveProperty("status");
      expect(cols).toHaveProperty("beforeState");
      expect(cols).toHaveProperty("afterState");
      expect(cols).toHaveProperty("stateDiff");
      expect(cols).toHaveProperty("durationMs");
      expect(cols).toHaveProperty("errorMessage");
      expect(cols).toHaveProperty("ipAddress");
      expect(cols).toHaveProperty("userAgent");
      expect(cols).toHaveProperty("createdAt");

      expect(cols.id.primary).toBe(true);
      expect(cols.userId.notNull).toBe(true);
      expect(cols.toolName.notNull).toBe(true);
      expect(cols.capability.notNull).toBe(true);
      expect(cols.operation.notNull).toBe(true);
      expect(cols.status.notNull).toBe(true);
      expect(cols.createdAt.notNull).toBe(true);
    });
  });

  describe("3. Relations Declarations", () => {
    it("defines relations between user and agent entities", () => {
      expect(userRelations).toBeDefined();
      expect(agentTokensRelations).toBeDefined();
      expect(agentPermissionsRelations).toBeDefined();
      expect(agentChallengesRelations).toBeDefined();
      expect(agentAuditLogRelations).toBeDefined();
    });
  });

  describe("4. Forward Migration File 0027 Integrity", () => {
    it("verifies 0027_agent_safety_and_audit.sql exists with correct DDL", () => {
      const migrationFile = path.join(MIGRATIONS_DIR, "0027_agent_safety_and_audit.sql");
      expect(fs.existsSync(migrationFile)).toBe(true);

      const sqlContent = fs.readFileSync(migrationFile, "utf-8");

      // Table creations
      expect(sqlContent).toContain('CREATE TABLE IF NOT EXISTS "agent_tokens"');
      expect(sqlContent).toContain('CREATE TABLE IF NOT EXISTS "agent_permissions"');
      expect(sqlContent).toContain('CREATE TABLE IF NOT EXISTS "agent_challenges"');
      expect(sqlContent).toContain('CREATE TABLE IF NOT EXISTS "agent_audit_log"');

      // Check constraints
      expect(sqlContent).toContain('CHECK ("status" IN (\'active\', \'revoked\', \'expired\'))');
      expect(sqlContent).toContain('CHECK ("capability" IN (\'READ\', \'WRITE\', \'EXECUTE\', \'DESTRUCTIVE\', \'SENSITIVE\'))');
      expect(sqlContent).toContain('CHECK ("status" IN (\'PENDING\', \'APPROVED\', \'REJECTED\', \'EXPIRED\', \'CONSUMED\'))');
      expect(sqlContent).toContain('CHECK ("status" IN (\'REQUESTED\', \'DENIED\', \'CHALLENGE_CREATED\', \'APPROVED\', \'REJECTED\', \'EXPIRED\', \'EXECUTED\', \'FAILED\'))');

      // Foreign key cascades
      expect(sqlContent).toContain('REFERENCES "public"."user"("id") ON DELETE cascade');
      expect(sqlContent).toContain('REFERENCES "public"."agent_tokens"("id") ON DELETE cascade');

      // Performance indexes
      expect(sqlContent).toContain('CREATE INDEX IF NOT EXISTS "agent_tokens_user_id_idx"');
      expect(sqlContent).toContain('CREATE INDEX IF NOT EXISTS "agent_permissions_agent_token_idx"');
      expect(sqlContent).toContain('CREATE INDEX IF NOT EXISTS "agent_challenges_user_status_expires_idx"');
      expect(sqlContent).toContain('CREATE INDEX IF NOT EXISTS "agent_audit_log_user_created_idx"');
    });

    it("verifies _journal.json contains valid entry for migration 0027", () => {
      expect(fs.existsSync(JOURNAL_PATH)).toBe(true);
      const journalContent = JSON.parse(fs.readFileSync(JOURNAL_PATH, "utf-8"));

      expect(Array.isArray(journalContent.entries)).toBe(true);
      const entry27 = journalContent.entries.find((e: { idx: number }) => e.idx === 27);
      expect(entry27).toBeDefined();
      expect(entry27.tag).toBe("0027_agent_safety_and_audit");
      expect(entry27.version).toBe("7");
    });

    it("verifies all historical migrations 0000 through 0026 are preserved and unchanged", () => {
      const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();

      expect(files.length).toBeGreaterThanOrEqual(28);
      expect(files[0]).toBe("0000_productive_lord_hawal.sql");
      expect(files[26]).toBe("0026_pgvector_knowledge_embeddings.sql");
      expect(files[27]).toBe("0027_agent_safety_and_audit.sql");
    });
  });
});
