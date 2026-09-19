import {
  pgTable,
  text,
  timestamp,
  doublePrecision,
  integer,
  jsonb,
  unique,
  check,
  foreignKey,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";
import { goals } from "./goals";

/**
 * Habits Table
 * Defines recurring personal habits with multi-frequency schedules
 * (daily, weekdays, weekly, specific days, custom interval),
 * time-of-day cues, and optional goal / identity statement linkage.
 *
 * Enforces cross-user isolation via composite unique key and composite foreign keys:
 * - (user_id, id) is UNIQUE to serve as target for tasks(user_id, habit_id) and habit_entries(user_id, habit_id)
 * - (user_id, goal_id) references goals(user_id, id) ON DELETE SET NULL
 */
export const habits = pgTable(
  "habits",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    frequency: text("frequency", {
      enum: ["daily", "weekdays", "weekly", "specific_days", "custom"],
    })
      .notNull()
      .default("daily"),
    frequencyTarget: integer("frequency_target").notNull().default(1),
    frequencyDays: jsonb("frequency_days")
      .$type<number[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    intervalDays: integer("interval_days").notNull().default(1),
    targetValue: doublePrecision("target_value").notNull().default(1),
    unit: text("unit"),
    timeOfDay: text("time_of_day", {
      enum: ["morning", "afternoon", "evening", "anytime"],
    })
      .notNull()
      .default("anytime"),
    reminderTime: text("reminder_time"),
    goalId: text("goal_id"),
    identityStatement: text("identity_statement"),
    status: text("status", {
      enum: ["active", "paused", "archived"],
    })
      .notNull()
      .default("active"),
    currentStreak: integer("current_streak").notNull().default(0),
    longestStreak: integer("longest_streak").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Unique composite key required as foreign key target for tasks(user_id, habit_id) and habit_entries
    unique("habits_user_id_id_unique").on(table.userId, table.id),

    // Composite FK to goals: prevents associating a habit with another user's goal
    foreignKey({
      name: "habits_user_goal_fk",
      columns: [table.userId, table.goalId],
      foreignColumns: [goals.userId, goals.id],
    }).onDelete("set null"),

    // Text field bounds & invariants
    check("habits_title_non_empty", sql`length(trim(${table.title})) > 0`),
    check("habits_title_max_length", sql`length(${table.title}) <= 255`),
    check(
      "habits_description_max_length",
      sql`${table.description} IS NULL OR length(${table.description}) <= 4000`
    ),
    check(
      "habits_identity_statement_max_length",
      sql`${table.identityStatement} IS NULL OR length(${table.identityStatement}) <= 500`
    ),
    check(
      "habits_frequency_check",
      sql`${table.frequency} IN ('daily', 'weekdays', 'weekly', 'specific_days', 'custom')`
    ),
    check("habits_frequency_target_positive", sql`${table.frequencyTarget} >= 1`),
    check("habits_interval_days_positive", sql`${table.intervalDays} >= 1`),
    check("habits_target_value_positive", sql`${table.targetValue} > 0`),
    check(
      "habits_time_of_day_check",
      sql`${table.timeOfDay} IN ('morning', 'afternoon', 'evening', 'anytime')`
    ),
    check(
      "habits_status_check",
      sql`${table.status} IN ('active', 'paused', 'archived')`
    ),
    check(
      "habits_current_streak_non_negative",
      sql`${table.currentStreak} >= 0`
    ),
    check(
      "habits_longest_streak_non_negative",
      sql`${table.longestStreak} >= 0`
    ),

    // Performance indexes
    index("habits_user_id_idx").on(table.userId),
    index("habits_user_status_idx").on(table.userId, table.status),
    index("habits_user_goal_idx").on(table.userId, table.goalId),
    index("habits_user_time_of_day_idx").on(table.userId, table.timeOfDay),
  ]
);

export const habit = habits;
export type Habit = typeof habits.$inferSelect;
export type NewHabit = typeof habits.$inferInsert;

/**
 * Habit Entries Table
 * Tracks daily execution and completion history for habits.
 *
 * Enforces composite uniqueness on (user_id, habit_id, date) to ensure check-in idempotency.
 * References habits via composite foreign key (user_id, habit_id).
 */
export const habitEntries = pgTable(
  "habit_entries",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    habitId: text("habit_id").notNull(),
    date: text("date").notNull(), // ISO calendar date YYYY-MM-DD
    value: doublePrecision("value").notNull().default(1),
    targetValue: doublePrecision("target_value").notNull().default(1),
    notes: text("notes"),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Composite unique constraint: strictly 1 entry per user per habit per date
    unique("habit_entries_user_habit_date_unique").on(
      table.userId,
      table.habitId,
      table.date
    ),

    // Composite FK to habits: prevents logging entries against another user's habit
    foreignKey({
      name: "habit_entries_user_habit_fk",
      columns: [table.userId, table.habitId],
      foreignColumns: [habits.userId, habits.id],
    }).onDelete("cascade"),

    // Date format invariant YYYY-MM-DD
    check("habit_entries_date_format_check", sql`${table.date} ~ '^\\d{4}-\\d{2}-\\d{2}$'`),
    check("habit_entries_value_positive", sql`${table.value} >= 0`),
    check(
      "habit_entries_notes_max_length",
      sql`${table.notes} IS NULL OR length(${table.notes}) <= 1000`
    ),

    // Performance indexes
    index("habit_entries_user_habit_idx").on(table.userId, table.habitId),
    index("habit_entries_user_date_idx").on(table.userId, table.date),
    index("habit_entries_user_habit_date_idx").on(
      table.userId,
      table.habitId,
      table.date
    ),
  ]
);

export const habitEntry = habitEntries;
export type HabitEntry = typeof habitEntries.$inferSelect;
export type NewHabitEntry = typeof habitEntries.$inferInsert;
