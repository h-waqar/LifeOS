import {
  pgTable,
  text,
  timestamp,
  jsonb,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";

/**
 * Analytics Snapshots Table (Phase 9)
 * Stores precomputed historical analytics snapshots for fast trend queries
 * and multi-period comparisons.
 *
 * Enforces:
 * - Foreign key cascade to authenticated user
 * - Unique snapshot per user, period type, and date range
 * - Tenant isolation via composite keys
 */
export const analyticsSnapshots = pgTable(
  "analytics_snapshots",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    periodType: text("period_type", {
      enum: ["7d", "30d", "90d", "day", "week", "month", "quarter", "year", "custom"],
    })
      .notNull()
      .default("month"),
    startDate: text("start_date").notNull(), // ISO calendar date: YYYY-MM-DD
    endDate: text("end_date").notNull(), // ISO calendar date: YYYY-MM-DD
    metrics: jsonb("metrics")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("analytics_snapshots_user_id_id_unique").on(table.userId, table.id),
    unique("analytics_snapshots_user_period_range_unique").on(
      table.userId,
      table.periodType,
      table.startDate,
      table.endDate
    ),
    index("analytics_snapshots_user_id_idx").on(table.userId),
    index("analytics_snapshots_user_period_idx").on(table.userId, table.periodType),
    index("analytics_snapshots_date_range_idx").on(
      table.userId,
      table.startDate,
      table.endDate
    ),
  ]
);

export const analyticsSnapshot = analyticsSnapshots;

export type AnalyticsSnapshot = typeof analyticsSnapshots.$inferSelect;
export type NewAnalyticsSnapshot = typeof analyticsSnapshots.$inferInsert;
