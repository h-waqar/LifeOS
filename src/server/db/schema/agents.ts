/**
 * Agent Safety, Identity, Scopes, Challenges & Audit Schema
 *
 * Implements the database tier for Phase 13 Zero-Trust Agent Architecture:
 * - agent_tokens: Hashed token credentials and provider attribution
 * - agent_permissions: Scoped 5-tier capabilities (READ, WRITE, EXECUTE, DESTRUCTIVE, SENSITIVE)
 * - agent_challenges: Concurrency-safe human-in-the-loop (HITL) approval gates with TTL
 * - agent_audit_log: Forensic audit trail attributing every agent operation
 */

import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  unique,
  check,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";

/**
 * Agent Tokens Table
 * Stores registered agent credentials. Plaintext bearer tokens are NEVER stored;
 * only SHA-256 hashes are persisted.
 */
export const agentTokens = pgTable(
  "agent_tokens",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    provider: text("provider").notNull().default("generic"),
    status: text("status", { enum: ["active", "revoked", "expired"] })
      .notNull()
      .default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("agent_tokens_token_hash_unique").on(table.tokenHash),
    index("agent_tokens_user_id_idx").on(table.userId),
    index("agent_tokens_user_status_idx").on(table.userId, table.status),
    index("agent_tokens_token_hash_idx").on(table.tokenHash),
    check(
      "agent_tokens_status_check",
      sql`${table.status} IN ('active', 'revoked', 'expired')`
    ),
  ]
);

export const agentToken = agentTokens;

/**
 * Agent Permissions Table
 * Explicit capabilities granted to an agent token across 5 tiers:
 * READ, WRITE, EXECUTE, DESTRUCTIVE, SENSITIVE.
 */
export const agentPermissions = pgTable(
  "agent_permissions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    agentTokenId: text("agent_token_id")
      .notNull()
      .references(() => agentTokens.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    capability: text("capability", {
      enum: ["READ", "WRITE", "EXECUTE", "DESTRUCTIVE", "SENSITIVE"],
    }).notNull(),
    resource: text("resource").notNull().default("*"),
    action: text("action").notNull().default("*"),
    allowed: boolean("allowed").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("agent_permissions_token_cap_res_act_unique").on(
      table.agentTokenId,
      table.capability,
      table.resource,
      table.action
    ),
    index("agent_permissions_agent_token_idx").on(table.agentTokenId),
    index("agent_permissions_user_token_idx").on(table.userId, table.agentTokenId),
    index("agent_permissions_capability_idx").on(
      table.agentTokenId,
      table.capability
    ),
    check(
      "agent_permissions_capability_check",
      sql`${table.capability} IN ('READ', 'WRITE', 'EXECUTE', 'DESTRUCTIVE', 'SENSITIVE')`
    ),
  ]
);

export const agentPermission = agentPermissions;

/**
 * Agent Challenges Table
 * Mandatory human approval challenges for DESTRUCTIVE and SENSITIVE agent operations.
 */
export const agentChallenges = pgTable(
  "agent_challenges",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    agentTokenId: text("agent_token_id")
      .notNull()
      .references(() => agentTokens.id, { onDelete: "cascade" }),
    operation: text("operation").notNull(),
    capability: text("capability", {
      enum: ["DESTRUCTIVE", "SENSITIVE"],
    }).notNull(),
    resource: text("resource").notNull(),
    resourceId: text("resource_id"),
    arguments: jsonb("arguments")
      .$type<Record<string, unknown>>()
      .notNull(),
    argumentsHash: text("arguments_hash").notNull(),
    status: text("status", {
      enum: ["PENDING", "APPROVED", "REJECTED", "EXPIRED", "CONSUMED"],
    })
      .notNull()
      .default("PENDING"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("agent_challenges_user_status_expires_idx").on(
      table.userId,
      table.status,
      table.expiresAt
    ),
    index("agent_challenges_agent_status_idx").on(
      table.agentTokenId,
      table.status
    ),
    index("agent_challenges_expires_at_idx").on(
      table.expiresAt,
      table.status
    ),
    check(
      "agent_challenges_status_check",
      sql`${table.status} IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CONSUMED')`
    ),
    check(
      "agent_challenges_capability_check",
      sql`${table.capability} IN ('DESTRUCTIVE', 'SENSITIVE')`
    ),
  ]
);

export const agentChallenge = agentChallenges;

/**
 * Agent Audit Log Table
 * Comprehensive attribution trail recording every agent-originated operation,
 * with redacted arguments, argument integrity hashes, execution duration, and state snapshots.
 */
export const agentAuditLog = pgTable(
  "agent_audit_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    agentTokenId: text("agent_token_id").references(() => agentTokens.id, {
      onDelete: "set null",
    }),
    agentName: text("agent_name"),
    provider: text("provider"),
    sessionId: text("session_id"),
    toolName: text("tool_name").notNull(),
    capability: text("capability", {
      enum: ["READ", "WRITE", "EXECUTE", "DESTRUCTIVE", "SENSITIVE"],
    }).notNull(),
    operation: text("operation").notNull(),
    resource: text("resource"),
    arguments: jsonb("arguments").$type<Record<string, unknown>>(),
    argumentsHash: text("arguments_hash"),
    challengeId: text("challenge_id").references(() => agentChallenges.id, {
      onDelete: "set null",
    }),
    challengeStatus: text("challenge_status"),
    status: text("status", {
      enum: [
        "REQUESTED",
        "DENIED",
        "CHALLENGE_CREATED",
        "APPROVED",
        "REJECTED",
        "EXPIRED",
        "EXECUTED",
        "FAILED",
      ],
    }).notNull(),
    beforeState: jsonb("before_state").$type<Record<string, unknown>>(),
    afterState: jsonb("after_state").$type<Record<string, unknown>>(),
    stateDiff: jsonb("state_diff").$type<Record<string, unknown>>(),
    durationMs: integer("duration_ms"),
    errorMessage: text("error_message"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("agent_audit_log_user_created_idx").on(
      table.userId,
      table.createdAt
    ),
    index("agent_audit_log_token_created_idx").on(
      table.agentTokenId,
      table.createdAt
    ),
    index("agent_audit_log_tool_status_idx").on(table.toolName, table.status),
    index("agent_audit_log_challenge_idx").on(table.challengeId),
    index("agent_audit_log_created_at_idx").on(table.createdAt),
    check(
      "agent_audit_log_status_check",
      sql`${table.status} IN ('REQUESTED', 'DENIED', 'CHALLENGE_CREATED', 'APPROVED', 'REJECTED', 'EXPIRED', 'EXECUTED', 'FAILED')`
    ),
    check(
      "agent_audit_log_capability_check",
      sql`${table.capability} IN ('READ', 'WRITE', 'EXECUTE', 'DESTRUCTIVE', 'SENSITIVE')`
    ),
  ]
);

export const agentAuditLogs = agentAuditLog;

export type AgentToken = typeof agentTokens.$inferSelect;
export type NewAgentToken = typeof agentTokens.$inferInsert;
export type AgentPermission = typeof agentPermissions.$inferSelect;
export type NewAgentPermission = typeof agentPermissions.$inferInsert;
export type AgentChallenge = typeof agentChallenges.$inferSelect;
export type NewAgentChallenge = typeof agentChallenges.$inferInsert;
export type AgentAuditLog = typeof agentAuditLog.$inferSelect;
export type NewAgentAuditLog = typeof agentAuditLog.$inferInsert;
