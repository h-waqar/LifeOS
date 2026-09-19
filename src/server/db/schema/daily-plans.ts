import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  unique,
  check,
  foreignKey,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";

/**
 * Daily Plans Table
 * Captures the morning daily plan, focus priorities, habit intentions, and focus notes.
 *
 * Enforces:
 * - Exactly one daily plan per user per calendar day (user_id, date)
 * - Composite isolation (user_id, id) for safe multi-tenant foreign keys
 * - Valid YYYY-MM-DD date format
 * - Invariant: status = 'completed' requires non-null completed_at
 */
export const dailyPlans = pgTable(
  "daily_plans",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // ISO calendar date: YYYY-MM-DD
    status: text("status", {
      enum: ["in_progress", "completed"],
    })
      .notNull()
      .default("in_progress"),
    priorityTaskIds: jsonb("priority_task_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    habitIntentionIds: jsonb("habit_intention_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    morningNotes: text("morning_notes"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Unique composite key for foreign key targets & tenant isolation
    unique("daily_plans_user_id_id_unique").on(table.userId, table.id),

    // Strictly one daily plan per user per calendar day
    unique("daily_plans_user_date_unique").on(table.userId, table.date),

    // Constraints
    check("daily_plans_date_format", sql`${table.date} ~ '^\\d{4}-\\d{2}-\\d{2}$'`),
    check(
      "daily_plans_status_check",
      sql`${table.status} IN ('in_progress', 'completed')`
    ),
    check(
      "daily_plans_completed_at_invariant",
      sql`${table.status} != 'completed' OR ${table.completedAt} IS NOT NULL`
    ),
    check(
      "daily_plans_notes_length",
      sql`${table.morningNotes} IS NULL OR length(${table.morningNotes}) <= 4000`
    ),

    // Indexes
    index("daily_plans_user_id_idx").on(table.userId),
    index("daily_plans_user_date_idx").on(table.userId, table.date),
    index("daily_plans_user_status_idx").on(table.userId, table.status),
  ]
);

export const dailyPlan = dailyPlans;

export type DailyPlan = typeof dailyPlans.$inferSelect;
export type NewDailyPlan = typeof dailyPlans.$inferInsert;

/**
 * Evening Reviews Table
 * Captures evening reflections, completed/uncompleted task summaries,
 * rolled-over task IDs, and calculated daily productivity scores.
 *
 * Enforces:
 * - Exactly one evening review per user per calendar day (user_id, date)
 * - Composite foreign key to daily_plans(user_id, id)
 * - Productivity score bounds (0 <= productivity_score <= 100)
 */
export const eveningReviews = pgTable(
  "evening_reviews",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    dailyPlanId: text("daily_plan_id"),
    date: text("date").notNull(), // ISO calendar date: YYYY-MM-DD
    productivityScore: integer("productivity_score").notNull().default(0),
    positiveReflections: text("positive_reflections"),
    challengesReflections: text("challenges_reflections"),
    notes: text("notes"),
    completedTaskIds: jsonb("completed_task_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    incompleteTaskIds: jsonb("incomplete_task_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    rolledOverTaskIds: jsonb("rolled_over_task_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    completedHabitIds: jsonb("completed_habit_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    completedAt: timestamp("completed_at", { withTimezone: true })
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
    // Unique composite key
    unique("evening_reviews_user_id_id_unique").on(table.userId, table.id),

    // Strictly one evening review per user per calendar day
    unique("evening_reviews_user_date_unique").on(table.userId, table.date),

    // Composite foreign key to daily_plans ensuring zero cross-tenant leakage
    foreignKey({
      name: "evening_reviews_user_daily_plan_fk",
      columns: [table.userId, table.dailyPlanId],
      foreignColumns: [dailyPlans.userId, dailyPlans.id],
    }).onDelete("set null"),

    // Constraints
    check(
      "evening_reviews_date_format",
      sql`${table.date} ~ '^\\d{4}-\\d{2}-\\d{2}$'`
    ),
    check(
      "evening_reviews_score_bounds",
      sql`${table.productivityScore} >= 0 AND ${table.productivityScore} <= 100`
    ),
    check(
      "evening_reviews_pos_length",
      sql`${table.positiveReflections} IS NULL OR length(${table.positiveReflections}) <= 4000`
    ),
    check(
      "evening_reviews_chal_length",
      sql`${table.challengesReflections} IS NULL OR length(${table.challengesReflections}) <= 4000`
    ),
    check(
      "evening_reviews_notes_length",
      sql`${table.notes} IS NULL OR length(${table.notes}) <= 4000`
    ),

    // Indexes
    index("evening_reviews_user_id_idx").on(table.userId),
    index("evening_reviews_user_date_idx").on(table.userId, table.date),
    index("evening_reviews_user_daily_plan_idx").on(
      table.userId,
      table.dailyPlanId
    ),
  ]
);

export const eveningReview = eveningReviews;

export type EveningReview = typeof eveningReviews.$inferSelect;
export type NewEveningReview = typeof eveningReviews.$inferInsert;
