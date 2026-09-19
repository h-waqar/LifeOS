import {
  pgTable,
  text,
  timestamp,
  doublePrecision,
  integer,
  unique,
  check,
  foreignKey,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";

/**
 * Goals Table
 * Defines hierarchical goals across multiple horizons (Long-term, Medium-term, Short-term)
 * with measurable metrics, progress tracking, and life-area alignment.
 *
 * Enforces cross-user isolation via composite foreign keys:
 * - (user_id, parent_goal_id) references goals(user_id, id) ON DELETE SET NULL
 */
export const goals = pgTable(
  "goals",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    horizon: text("horizon", {
      enum: ["long_term", "medium_term", "short_term"],
    })
      .notNull()
      .default("medium_term"),
    area: text("area", {
      enum: [
        "health",
        "career",
        "finance",
        "personal_development",
        "relationships",
        "general",
      ],
    })
      .notNull()
      .default("general"),
    status: text("status", {
      enum: [
        "not_started",
        "in_progress",
        "completed",
        "paused",
        "archived",
      ],
    })
      .notNull()
      .default("in_progress"),
    priority: text("priority", {
      enum: ["low", "medium", "high", "critical"],
    })
      .notNull()
      .default("medium"),
    metricType: text("metric_type", {
      enum: ["none", "numeric", "currency", "boolean", "percentage"],
    })
      .notNull()
      .default("none"),
    targetValue: doublePrecision("target_value"),
    currentValue: doublePrecision("current_value").default(0),
    unit: text("unit"),
    startDate: timestamp("start_date", { withTimezone: true }),
    targetDate: timestamp("target_date", { withTimezone: true }),
    parentGoalId: text("parent_goal_id"),
    progress: integer("progress").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("goals_user_id_id_unique").on(table.userId, table.id),
    foreignKey({
      name: "goals_user_parent_goal_fk",
      columns: [table.userId, table.parentGoalId],
      foreignColumns: [table.userId, table.id],
    }).onDelete("set null"),
    check(
      "goals_parent_not_self",
      sql`${table.parentGoalId} IS NULL OR ${table.parentGoalId} != ${table.id}`
    ),
    check("goals_title_non_empty", sql`length(trim(${table.title})) > 0`),
    check("goals_title_max_length", sql`length(${table.title}) <= 255`),
    check(
      "goals_description_max_length",
      sql`${table.description} IS NULL OR length(${table.description}) <= 4000`
    ),
    check(
      "goals_horizon_check",
      sql`${table.horizon} IN ('long_term', 'medium_term', 'short_term')`
    ),
    check(
      "goals_area_check",
      sql`${table.area} IN ('health', 'career', 'finance', 'personal_development', 'relationships', 'general')`
    ),
    check(
      "goals_status_check",
      sql`${table.status} IN ('not_started', 'in_progress', 'completed', 'paused', 'archived')`
    ),
    check(
      "goals_priority_check",
      sql`${table.priority} IN ('low', 'medium', 'high', 'critical')`
    ),
    check(
      "goals_metric_type_check",
      sql`${table.metricType} IN ('none', 'numeric', 'currency', 'boolean', 'percentage')`
    ),
    check(
      "goals_progress_bounds",
      sql`${table.progress} >= 0 AND ${table.progress} <= 100`
    ),
    check(
      "goals_completed_at_invariant",
      sql`${table.status} != 'completed' OR ${table.completedAt} IS NOT NULL`
    ),
    index("goals_user_id_idx").on(table.userId),
    index("goals_user_status_idx").on(table.userId, table.status),
    index("goals_user_horizon_idx").on(table.userId, table.horizon),
    index("goals_user_area_idx").on(table.userId, table.area),
    index("goals_user_parent_goal_idx").on(table.userId, table.parentGoalId),
  ]
);

export const goal = goals;
export type Goal = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;
