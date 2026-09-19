import {
  pgTable,
  text,
  timestamp,
  integer,
  unique,
  check,
  foreignKey,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";
import { tasks } from "./tasks";
import { projects } from "./projects";
import { goals } from "./goals";
import { habits } from "./habits";

/**
 * Time Blocks Table
 * Represents scheduled time blocks on the calendar for execution.
 * Can be linked to a Task, Project, Goal, or Habit, or exist standalone (personal/event).
 *
 * Enforces cross-user isolation via composite foreign keys:
 * - (user_id, task_id) references tasks(user_id, id) ON DELETE SET NULL
 * - (user_id, project_id) references projects(user_id, id) ON DELETE SET NULL
 * - (user_id, goal_id) references goals(user_id, id) ON DELETE SET NULL
 * - (user_id, habit_id) references habits(user_id, id) ON DELETE SET NULL
 *
 * Enforces commitment level (soft vs hard) and completed duration invariants.
 */
export const timeBlocks = pgTable(
  "time_blocks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    status: text("status", {
      enum: ["scheduled", "completed", "cancelled"],
    })
      .notNull()
      .default("scheduled"),
    commitmentLevel: text("commitment_level", {
      enum: ["soft", "hard"],
    })
      .notNull()
      .default("soft"),
    actualMinutes: integer("actual_minutes"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    color: text("color"),
    taskId: text("task_id"),
    projectId: text("project_id"),
    goalId: text("goal_id"),
    habitId: text("habit_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Unique composite key required as foreign key target and multi-tenant isolation
    unique("time_blocks_user_id_id_unique").on(table.userId, table.id),

    // Composite FK to tasks: prevents linking to another user's task
    foreignKey({
      name: "time_blocks_user_task_fk",
      columns: [table.userId, table.taskId],
      foreignColumns: [tasks.userId, tasks.id],
    }).onDelete("set null"),

    // Composite FK to projects: prevents linking to another user's project
    foreignKey({
      name: "time_blocks_user_project_fk",
      columns: [table.userId, table.projectId],
      foreignColumns: [projects.userId, projects.id],
    }).onDelete("set null"),

    // Composite FK to goals: prevents linking to another user's goal
    foreignKey({
      name: "time_blocks_user_goal_fk",
      columns: [table.userId, table.goalId],
      foreignColumns: [goals.userId, goals.id],
    }).onDelete("set null"),

    // Composite FK to habits: prevents linking to another user's habit
    foreignKey({
      name: "time_blocks_user_habit_fk",
      columns: [table.userId, table.habitId],
      foreignColumns: [habits.userId, habits.id],
    }).onDelete("set null"),

    // Text field bounds
    check("time_blocks_title_non_empty", sql`length(trim(${table.title})) > 0`),
    check("time_blocks_title_max_length", sql`length(${table.title}) <= 255`),
    check(
      "time_blocks_description_max_length",
      sql`${table.description} IS NULL OR length(${table.description}) <= 4000`
    ),

    // Time ordering invariant: end_time must be strictly greater than start_time
    check("time_blocks_time_order", sql`${table.endTime} > ${table.startTime}`),

    // Duration limits: positive, max 24 hours (1440 mins)
    check(
      "time_blocks_duration_bounds",
      sql`${table.durationMinutes} > 0 AND ${table.durationMinutes} <= 1440`
    ),

    // Actual duration limits
    check(
      "time_blocks_actual_minutes_bounds",
      sql`${table.actualMinutes} IS NULL OR (${table.actualMinutes} >= 0 AND ${table.actualMinutes} <= 1440)`
    ),

    // Status check
    check(
      "time_blocks_status_check",
      sql`${table.status} IN ('scheduled', 'completed', 'cancelled')`
    ),

    // Commitment level check
    check(
      "time_blocks_commitment_check",
      sql`${table.commitmentLevel} IN ('soft', 'hard')`
    ),

    // Completed invariant: status = 'completed' requires non-null completedAt
    check(
      "time_blocks_completed_at_invariant",
      sql`${table.status} != 'completed' OR ${table.completedAt} IS NOT NULL`
    ),

    // Performance and query indexes
    index("time_blocks_user_id_idx").on(table.userId),
    index("time_blocks_user_range_idx").on(table.userId, table.startTime, table.endTime),
    index("time_blocks_user_task_idx").on(table.userId, table.taskId),
    index("time_blocks_user_habit_idx").on(table.userId, table.habitId),
    index("time_blocks_user_project_idx").on(table.userId, table.projectId),
    index("time_blocks_user_goal_idx").on(table.userId, table.goalId),
    index("time_blocks_user_status_idx").on(table.userId, table.status),
    index("time_blocks_user_commitment_idx").on(table.userId, table.commitmentLevel),
  ]
);

export const timeBlock = timeBlocks;

export type TimeBlock = typeof timeBlocks.$inferSelect;
export type NewTimeBlock = typeof timeBlocks.$inferInsert;
