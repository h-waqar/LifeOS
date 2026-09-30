import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  unique,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";
import { timeBlocks } from "./time-blocks";

/**
 * Integration Connections Table
 * Stores third-party OAuth connection records and tokens encrypted at rest with AES-256-GCM.
 */
export const integrationConnections = pgTable(
  "integration_connections",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider", {
      enum: ["google_calendar", "github", "backup"],
    }).notNull(),
    status: text("status", {
      enum: ["connected", "disconnected", "error", "expired"],
    })
      .notNull()
      .default("disconnected"),
    encryptedAccessToken: text("encrypted_access_token"),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    externalAccountId: text("external_account_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("integration_connections_user_provider_unique").on(
      table.userId,
      table.provider
    ),
    check(
      "integration_connections_status_check",
      sql`${table.status} IN ('connected', 'disconnected', 'error', 'expired')`
    ),
    check(
      "integration_connections_provider_check",
      sql`${table.provider} IN ('google_calendar', 'github', 'backup')`
    ),
    index("integration_connections_user_id_idx").on(table.userId),
    index("integration_connections_user_provider_idx").on(
      table.userId,
      table.provider
    ),
    index("integration_connections_status_idx").on(table.status),
  ]
);

export const integrationConnection = integrationConnections;

export type IntegrationConnection = typeof integrationConnections.$inferSelect;
export type NewIntegrationConnection = typeof integrationConnections.$inferInsert;

/**
 * Calendar Event Mappings Table
 * Maintains 1-to-1 bidirectional correspondence between LifeOS time_blocks and external calendar events.
 */
export const calendarEventMappings = pgTable(
  "calendar_event_mappings",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => integrationConnections.id, { onDelete: "cascade" }),
    timeBlockId: text("time_block_id")
      .notNull()
      .references(() => timeBlocks.id, { onDelete: "cascade" }),
    externalCalendarId: text("external_calendar_id").notNull().default("primary"),
    externalEventId: text("external_event_id").notNull(),
    externalEtag: text("external_etag"),
    syncDirection: text("sync_direction", {
      enum: ["inbound", "outbound", "bidirectional"],
    })
      .notNull()
      .default("bidirectional"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("calendar_event_mappings_user_external_unique").on(
      table.userId,
      table.externalEventId
    ),
    unique("calendar_event_mappings_user_time_block_unique").on(
      table.userId,
      table.timeBlockId
    ),
    check(
      "calendar_event_mappings_sync_dir_check",
      sql`${table.syncDirection} IN ('inbound', 'outbound', 'bidirectional')`
    ),
    index("calendar_event_mappings_user_id_idx").on(table.userId),
    index("calendar_event_mappings_connection_id_idx").on(table.connectionId),
    index("calendar_event_mappings_time_block_id_idx").on(table.timeBlockId),
    index("calendar_event_mappings_external_event_id_idx").on(
      table.userId,
      table.externalEventId
    ),
  ]
);

export const calendarEventMapping = calendarEventMappings;

export type CalendarEventMapping = typeof calendarEventMappings.$inferSelect;
export type NewCalendarEventMapping = typeof calendarEventMappings.$inferInsert;

/**
 * Sync Logs Table
 * Historical audit trail of all synchronization runs, status, and item counters.
 */
export const syncLogs = pgTable(
  "sync_logs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => integrationConnections.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    syncType: text("sync_type", {
      enum: ["initial", "incremental", "outbound", "inbound", "manual"],
    }).notNull(),
    status: text("status", {
      enum: ["success", "partial", "failed"],
    }).notNull(),
    itemsProcessed: integer("items_processed").notNull().default(0),
    itemsCreated: integer("items_created").notNull().default(0),
    itemsUpdated: integer("items_updated").notNull().default(0),
    itemsDeleted: integer("items_deleted").notNull().default(0),
    itemsFailed: integer("items_failed").notNull().default(0),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "sync_logs_sync_type_check",
      sql`${table.syncType} IN ('initial', 'incremental', 'outbound', 'inbound', 'manual')`
    ),
    check(
      "sync_logs_status_check",
      sql`${table.status} IN ('success', 'partial', 'failed')`
    ),
    index("sync_logs_user_id_idx").on(table.userId),
    index("sync_logs_connection_id_idx").on(table.connectionId),
    index("sync_logs_user_provider_idx").on(table.userId, table.provider),
    index("sync_logs_started_at_idx").on(table.startedAt),
  ]
);

export const syncLog = syncLogs;

export type SyncLog = typeof syncLogs.$inferSelect;
export type NewSyncLog = typeof syncLogs.$inferInsert;

/**
 * GitHub Activities Table
 * Ingested activity events (commits, PRs, issues) linked to user and daily timeline.
 * Idempotency guaranteed via unique(userId, externalId).
 */
export const githubActivities = pgTable(
  "github_activities",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .references(() => integrationConnections.id, { onDelete: "set null" }),
    externalId: text("external_id").notNull(),
    activityType: text("activity_type", {
      enum: ["commit", "pull_request", "issue", "review", "release"],
    }).notNull(),
    repository: text("repository").notNull(),
    actor: text("actor").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    url: text("url"),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("github_activities_user_external_unique").on(
      table.userId,
      table.externalId
    ),
    check(
      "github_activities_activity_type_check",
      sql`${table.activityType} IN ('commit', 'pull_request', 'issue', 'review', 'release')`
    ),
    index("github_activities_user_id_idx").on(table.userId),
    index("github_activities_user_timestamp_idx").on(table.userId, table.timestamp),
    index("github_activities_user_repo_idx").on(table.userId, table.repository),
    index("github_activities_activity_type_idx").on(table.activityType),
  ]
);

export const githubActivity = githubActivities;
export type GitHubActivity = typeof githubActivities.$inferSelect;
export type NewGitHubActivity = typeof githubActivities.$inferInsert;

/**
 * Backup Records Table
 * Historical log of automated and manual backups, status, manifests, and checksums.
 */
export const backupRecords = pgTable(
  "backup_records",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .references(() => integrationConnections.id, { onDelete: "set null" }),
    storageProvider: text("storage_provider", {
      enum: ["local", "s3"],
    })
      .notNull()
      .default("local"),
    status: text("status", {
      enum: ["pending", "completed", "failed", "verified"],
    })
      .notNull()
      .default("pending"),
    destination: text("destination").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    checksum: text("checksum").notNull(),
    encrypted: boolean("encrypted").notNull().default(false),
    entityCounts: jsonb("entity_counts").$type<Record<string, number>>().default({}),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "backup_records_storage_provider_check",
      sql`${table.storageProvider} IN ('local', 's3')`
    ),
    check(
      "backup_records_status_check",
      sql`${table.status} IN ('pending', 'completed', 'failed', 'verified')`
    ),
    index("backup_records_user_id_idx").on(table.userId),
    index("backup_records_user_created_at_idx").on(table.userId, table.createdAt),
    index("backup_records_status_idx").on(table.status),
  ]
);

export const backupRecord = backupRecords;
export type BackupRecord = typeof backupRecords.$inferSelect;
export type NewBackupRecord = typeof backupRecords.$inferInsert;

/**
 * Webhook Deliveries Table
 * Audit and delivery log of inbound webhook events from GitHub and automation tools.
 */
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    eventType: text("event_type").notNull(),
    deliveryId: text("delivery_id"),
    status: text("status", {
      enum: ["processed", "ignored", "failed"],
    })
      .notNull()
      .default("processed"),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
    headers: jsonb("headers").$type<Record<string, unknown>>().default({}),
    errorMessage: text("error_message"),
    processedAt: timestamp("processed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "webhook_deliveries_status_check",
      sql`${table.status} IN ('processed', 'ignored', 'failed')`
    ),
    index("webhook_deliveries_user_id_idx").on(table.userId),
    index("webhook_deliveries_provider_idx").on(table.provider),
    index("webhook_deliveries_created_at_idx").on(table.createdAt),
  ]
);

export const webhookDelivery = webhookDeliveries;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDelivery = typeof webhookDeliveries.$inferInsert;
