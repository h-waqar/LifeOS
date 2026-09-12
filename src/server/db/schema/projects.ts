import {
  pgTable,
  text,
  timestamp,
  unique,
  check,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";

/**
 * Projects Table
 * High-level outcomes and groupings requiring multiple tasks.
 * Strictly user-owned, enforcing query and storage level isolation.
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Unique composite key required as foreign key target for tasks(user_id, project_id)
    unique("projects_user_id_id_unique").on(table.userId, table.id),
    check("projects_name_non_empty", sql`length(trim(${table.name})) > 0`),
    check("projects_name_max_length", sql`length(${table.name}) <= 255`),
    check(
      "projects_description_max_length",
      sql`${table.description} IS NULL OR length(${table.description}) <= 2000`
    ),
    index("projects_user_id_idx").on(table.userId),
    index("projects_user_status_idx").on(table.userId, table.status),
    index("projects_user_priority_idx").on(table.userId, table.priority),
  ]
);

export const project = projects;
