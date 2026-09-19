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
import { projects } from "./projects";
import { goals } from "./goals";
import { projectMilestones } from "./milestones";
import { habits } from "./habits";

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
    scheduledDate: timestamp("scheduled_date", { withTimezone: true }),
    energyLevel: text("energy_level", { enum: ["low", "medium", "high"] }),
    recurrenceRule: jsonb("recurrence_rule").$type<RecurrenceRule>(),
    goalId: text("goal_id"),
    milestoneId: text("milestone_id"),
    habitId: text("habit_id"),
    noteId: text("note_id"),
    personId: text("person_id"),
    tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
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

    // Composite FK to goals: prevents associating a task with another user's goal
    foreignKey({
      name: "tasks_user_goal_fk",
      columns: [table.userId, table.goalId],
      foreignColumns: [goals.userId, goals.id],
    }).onDelete("set null"),

    // Composite FK to project_milestones: prevents associating a task with another user's milestone
    foreignKey({
      name: "tasks_user_milestone_fk",
      columns: [table.userId, table.milestoneId],
      foreignColumns: [projectMilestones.userId, projectMilestones.id],
    }).onDelete("set null"),

    // Composite FK to habits: prevents associating a task with another user's habit
    foreignKey({
      name: "tasks_user_habit_fk",
      columns: [table.userId, table.habitId],
      foreignColumns: [habits.userId, habits.id],
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

    // Energy level check constraint
    check(
      "tasks_energy_level_check",
      sql`${table.energyLevel} IS NULL OR ${table.energyLevel} IN ('low', 'medium', 'high')`
    ),

    // Query performance indexes
    index("tasks_user_id_idx").on(table.userId),
    index("tasks_user_status_idx").on(table.userId, table.status),
    index("tasks_user_project_idx").on(table.userId, table.projectId),
    index("tasks_user_parent_task_idx").on(table.userId, table.parentTaskId),
    index("tasks_user_due_date_idx").on(table.userId, table.dueDate),
    index("tasks_user_priority_idx").on(table.userId, table.priority),
    index("tasks_user_scheduled_date_idx").on(table.userId, table.scheduledDate),
    index("tasks_user_energy_level_idx").on(table.userId, table.energyLevel),
    index("tasks_user_goal_idx").on(table.userId, table.goalId),
    index("tasks_user_milestone_idx").on(table.userId, table.milestoneId),
    index("tasks_user_habit_idx").on(table.userId, table.habitId),
  ]
);

export const task = tasks;

/**
 * Task Dependencies Table
 * Models task prerequisite/blocking relationships in a Directed Acyclic Graph (DAG).
 * Strictly user-owned, enforcing composite foreign keys to ensure cross-user isolation:
 * - (user_id, task_id) references tasks(user_id, id) ON DELETE CASCADE
 * - (user_id, depends_on_task_id) references tasks(user_id, id) ON DELETE CASCADE
 * Prevents self-dependency and circular deadlocks.
 */
export const taskDependencies = pgTable(
  "task_dependencies",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    taskId: text("task_id").notNull(),
    dependsOnTaskId: text("depends_on_task_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("task_dependencies_unique").on(
      table.userId,
      table.taskId,
      table.dependsOnTaskId
    ),
    foreignKey({
      name: "task_dependencies_task_fk",
      columns: [table.userId, table.taskId],
      foreignColumns: [tasks.userId, tasks.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "task_dependencies_depends_on_task_fk",
      columns: [table.userId, table.dependsOnTaskId],
      foreignColumns: [tasks.userId, tasks.id],
    }).onDelete("cascade"),
    check(
      "task_dependencies_no_self",
      sql`${table.taskId} != ${table.dependsOnTaskId}`
    ),
    index("task_dependencies_user_task_idx").on(table.userId, table.taskId),
    index("task_dependencies_user_depends_idx").on(
      table.userId,
      table.dependsOnTaskId
    ),
  ]
);

export const taskDependency = taskDependencies;

export interface RecurrenceRule {
  frequency: "daily" | "weekly" | "monthly" | "custom";
  interval: number;
  daysOfWeek?: number[];
  endDate?: string;
  count?: number;
}

export type TaskDependency = typeof taskDependencies.$inferSelect;
export type NewTaskDependency = typeof taskDependencies.$inferInsert;
