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
 * Project Milestones Table
 * Major checkpoints and key target dates within a Project.
 * Strictly user-owned, enforcing composite foreign keys to ensure cross-user isolation:
 * - (user_id, project_id) references projects(user_id, id) ON DELETE CASCADE
 */
export const projectMilestones = pgTable(
  "project_milestones",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectId: text("project_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    targetDate: timestamp("target_date", { withTimezone: true }),
    status: text("status", { enum: ["pending", "completed"] })
      .notNull()
      .default("pending"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("project_milestones_user_id_id_unique").on(table.userId, table.id),
    foreignKey({
      name: "project_milestones_project_fk",
      columns: [table.userId, table.projectId],
      foreignColumns: [projects.userId, projects.id],
    }).onDelete("cascade"),
    check(
      "project_milestones_title_non_empty",
      sql`length(trim(${table.title})) > 0`
    ),
    check(
      "project_milestones_title_max_length",
      sql`length(${table.title}) <= 255`
    ),
    check(
      "project_milestones_description_max_length",
      sql`${table.description} IS NULL OR length(${table.description}) <= 2000`
    ),
    check(
      "project_milestones_status_check",
      sql`${table.status} IN ('pending', 'completed')`
    ),
    check(
      "project_milestones_completed_at_invariant",
      sql`${table.status} != 'completed' OR ${table.completedAt} IS NOT NULL`
    ),
    index("project_milestones_user_idx").on(table.userId),
    index("project_milestones_user_project_idx").on(
      table.userId,
      table.projectId
    ),
  ]
);

export const projectMilestone = projectMilestones;
export type ProjectMilestone = typeof projectMilestones.$inferSelect;
export type NewProjectMilestone = typeof projectMilestones.$inferInsert;
