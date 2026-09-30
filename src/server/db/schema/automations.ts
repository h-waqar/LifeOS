import {
  pgTable,
  text,
  varchar,
  integer,
  timestamp,
  boolean,
  jsonb,
  index,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";

/**
 * Automations Table
 * Stores user-defined Trigger-Condition-Action automation rules.
 */
export const automations = pgTable(
  "automations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    triggerType: text("trigger_type", {
      enum: ["event", "schedule", "threshold"],
    }).notNull(),
    triggerConfig: jsonb("trigger_config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    conditions: jsonb("conditions")
      .$type<unknown[]>()
      .notNull()
      .default([]),
    actionType: text("action_type", {
      enum: [
        "create_notification",
        "create_task",
        "update_task",
        "update_project",
        "log_audit",
        "trigger_ai_suggestions",
      ],
    }).notNull(),
    actionConfig: jsonb("action_config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    isActive: boolean("is_active").notNull().default(true),
    executionCount: integer("execution_count").notNull().default(0),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("automations_user_active_idx").on(table.userId, table.isActive),
    index("automations_user_trigger_idx").on(table.userId, table.triggerType),
    index("automations_user_id_idx").on(table.userId),
    check(
      "automations_trigger_type_check",
      sql`${table.triggerType} IN ('event', 'schedule', 'threshold')`
    ),
    check(
      "automations_action_type_check",
      sql`${table.actionType} IN ('create_notification', 'create_task', 'update_task', 'update_project', 'log_audit', 'trigger_ai_suggestions')`
    ),
  ]
);

export const automation = automations;

export type Automation = typeof automations.$inferSelect;
export type NewAutomation = typeof automations.$inferInsert;

/**
 * Automation Runs Table
 * Stores execution history, status, duration, and telemetry for automations.
 */
export const automationRuns = pgTable(
  "automation_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    automationId: text("automation_id")
      .notNull()
      .references(() => automations.id, { onDelete: "cascade" }),
    triggerEvent: text("trigger_event").notNull(),
    status: text("status", { enum: ["success", "failed", "skipped"] }).notNull(),
    executionDurationMs: integer("execution_duration_ms").notNull().default(0),
    contextSnapshot: jsonb("context_snapshot")
      .$type<Record<string, unknown>>()
      .default({}),
    actionOutput: jsonb("action_output")
      .$type<Record<string, unknown>>()
      .default({}),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("automation_runs_user_auto_created_idx").on(
      table.userId,
      table.automationId,
      table.createdAt.desc()
    ),
    index("automation_runs_user_status_idx").on(table.userId, table.status),
    index("automation_runs_user_id_idx").on(table.userId),
    check(
      "automation_runs_status_check",
      sql`${table.status} IN ('success', 'failed', 'skipped')`
    ),
  ]
);

export const automationRun = automationRuns;

export type AutomationRun = typeof automationRuns.$inferSelect;
export type NewAutomationRun = typeof automationRuns.$inferInsert;

/**
 * Scheduler Locks Table
 * Distributed PostgreSQL idempotency lock preventing concurrent / duplicate execution of scheduled jobs.
 */
export const schedulerLocks = pgTable(
  "scheduler_locks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    jobName: varchar("job_name", { length: 128 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    status: text("status", { enum: ["locked", "completed", "failed"] })
      .notNull()
      .default("locked"),
    lockedAt: timestamp("locked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    unique("scheduler_locks_key_unique").on(table.userId, table.idempotencyKey),
    index("scheduler_locks_user_job_idx").on(table.userId, table.jobName),
    index("scheduler_locks_user_id_idx").on(table.userId),
    check(
      "scheduler_locks_status_check",
      sql`${table.status} IN ('locked', 'completed', 'failed')`
    ),
  ]
);

export const schedulerLock = schedulerLocks;

export type SchedulerLock = typeof schedulerLocks.$inferSelect;
export type NewSchedulerLock = typeof schedulerLocks.$inferInsert;
