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
import { projects } from "./projects";

/**
 * Tasks Table
 * Primary user-owned unit of execution in LifeOS.
 * Enforces cross-user isolation at the database level via composite foreign keys:
 * - (user_id, project_id) references projects(user_id, id) ON DELETE SET NULL
 * - (user_id, parent_task_id) references tasks(user_id, id) ON DELETE CASCADE
 *
 * Prevents self-referential cycles and guarantees completed status timestamp invariants.
 */
export const tasks = pgTable(
  "tasks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectId: text("project_id"),
    parentTaskId: text("parent_task_id"),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status", {
      enum: [
        "inbox",
        "todo",
        "in_progress",
        "blocked",
        "completed",
        "cancelled",
      ],
    })
      .notNull()
      .default("inbox"),
    priority: text("priority", {
      enum: ["low", "medium", "high", "critical"],
    })
      .notNull()
      .default("medium"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    estimatedDuration: integer("estimated_duration"),
    actualDuration: integer("actual_duration"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Unique composite key required as foreign key target for self-referential subtasks
    unique("tasks_user_id_id_unique").on(table.userId, table.id),

    // Composite FK to projects: prevents associating a task with another user's project
    foreignKey({
      name: "tasks_user_project_fk",
      columns: [table.userId, table.projectId],
      foreignColumns: [projects.userId, projects.id],
    }).onDelete("set null"),

    // Composite FK to tasks: prevents associating a subtask with another user's parent task
    foreignKey({
      name: "tasks_user_parent_task_fk",
      columns: [table.userId, table.parentTaskId],
      foreignColumns: [table.userId, table.id],
    }).onDelete("cascade"),

    // Check constraint preventing direct self-referential cycle
    check(
      "tasks_parent_not_self",
      sql`${table.parentTaskId} IS NULL OR ${table.parentTaskId} != ${table.id}`
    ),

    // Text field bounds
    check("tasks_title_non_empty", sql`length(trim(${table.title})) > 0`),
    check("tasks_title_max_length", sql`length(${table.title}) <= 255`),
    check(
      "tasks_description_max_length",
      sql`${table.description} IS NULL OR length(${table.description}) <= 4000`
    ),

    // Non-negative bounded duration constraints (in minutes, max 1 week = 10080 mins)
    check(
      "tasks_estimated_duration_bounds",
      sql`${table.estimatedDuration} IS NULL OR (${table.estimatedDuration} >= 0 AND ${table.estimatedDuration} <= 10080)`
    ),
    check(
      "tasks_actual_duration_bounds",
      sql`${table.actualDuration} IS NULL OR (${table.actualDuration} >= 0 AND ${table.actualDuration} <= 10080)`
    ),

    // Completed status invariant: status = 'completed' requires non-null completedAt
    check(
      "tasks_completed_at_invariant",
      sql`${table.status} != 'completed' OR ${table.completedAt} IS NOT NULL`
    ),

    // Query performance indexes
    index("tasks_user_id_idx").on(table.userId),
    index("tasks_user_status_idx").on(table.userId, table.status),
    index("tasks_user_project_idx").on(table.userId, table.projectId),
    index("tasks_user_parent_task_idx").on(table.userId, table.parentTaskId),
    index("tasks_user_due_date_idx").on(table.userId, table.dueDate),
    index("tasks_user_priority_idx").on(table.userId, table.priority),
  ]
);

export const task = tasks;
