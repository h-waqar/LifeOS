import {
  pgTable,
  text,
  timestamp,
  unique,
  check,
  foreignKey,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";
import { goals } from "./goals";

/**
 * Projects Table
 * High-level outcomes and groupings requiring multiple tasks.
 * Strictly user-owned, enforcing query and storage level isolation.
 * Connects to parent Goal via composite foreign key (user_id, goal_id).
 */
export const projects = pgTable(
  "projects",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
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
      enum: ["planning", "active", "paused", "completed", "archived"],
    })
      .notNull()
      .default("planning"),
    priority: text("priority", {
      enum: ["low", "medium", "high", "critical"],
    })
      .notNull()
      .default("medium"),
    startDate: timestamp("start_date", { withTimezone: true }),
    deadline: timestamp("deadline", { withTimezone: true }),
    goalId: text("goal_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Unique composite key required as foreign key target for tasks(user_id, project_id) and milestones
    unique("projects_user_id_id_unique").on(table.userId, table.id),

    // Composite FK to goals: prevents associating a project with another user's goal
    foreignKey({
      name: "projects_user_goal_fk",
      columns: [table.userId, table.goalId],
      foreignColumns: [goals.userId, goals.id],
    }).onDelete("set null"),

    check("projects_name_non_empty", sql`length(trim(${table.name})) > 0`),
    check("projects_name_max_length", sql`length(${table.name}) <= 255`),
    check(
      "projects_description_max_length",
      sql`${table.description} IS NULL OR length(${table.description}) <= 2000`
    ),
    check(
      "projects_area_check",
      sql`${table.area} IN ('health', 'career', 'finance', 'personal_development', 'relationships', 'general')`
    ),
    index("projects_user_id_idx").on(table.userId),
    index("projects_user_status_idx").on(table.userId, table.status),
    index("projects_user_priority_idx").on(table.userId, table.priority),
    index("projects_user_goal_idx").on(table.userId, table.goalId),
    index("projects_user_area_idx").on(table.userId, table.area),
  ]
);

export const project = projects;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
