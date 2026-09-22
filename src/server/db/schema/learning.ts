import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  unique,
  foreignKey,
  check,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";
import { goals } from "./goals";
import { projects } from "./projects";

/**
 * Learning Items Table
 * Defines books, courses, articles, podcasts, and skills.
 * Enforces composite multi-tenant isolation at the database level.
 */
export const learningItems = pgTable(
  "learning_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    type: text("type", {
      enum: [
        "book",
        "course",
        "article",
        "podcast",
        "skill",
        "documentation",
        "other",
      ],
    })
      .notNull()
      .default("book"),
    status: text("status", {
      enum: ["not_started", "in_progress", "completed", "archived"],
    })
      .notNull()
      .default("not_started"),
    author: text("author"),
    url: text("url"),
    rating: integer("rating"),
    progress: integer("progress").notNull().default(0),
    currentUnits: integer("current_units").default(0),
    totalUnits: integer("total_units"),
    unitType: text("unit_type"),
    summary: text("summary"),
    keyTakeaways: jsonb("key_takeaways")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    tags: jsonb("tags")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    goalId: text("goal_id"),
    projectId: text("project_id"),
    isArchived: boolean("is_archived").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("learning_items_user_id_id_unique").on(table.userId, table.id),
    check("learning_items_title_non_empty", sql`length(trim(${table.title})) > 0`),
    check("learning_items_title_max_length", sql`length(${table.title}) <= 255`),
    check(
      "learning_items_type_check",
      sql`${table.type} IN ('book', 'course', 'article', 'podcast', 'skill', 'documentation', 'other')`
    ),
    check(
      "learning_items_status_check",
      sql`${table.status} IN ('not_started', 'in_progress', 'completed', 'archived')`
    ),
    check(
      "learning_items_rating_check",
      sql`${table.rating} IS NULL OR (${table.rating} >= 1 AND ${table.rating} <= 5)`
    ),
    check(
      "learning_items_progress_check",
      sql`${table.progress} >= 0 AND ${table.progress} <= 100`
    ),
    check(
      "learning_items_current_units_check",
      sql`${table.currentUnits} IS NULL OR ${table.currentUnits} >= 0`
    ),
    check(
      "learning_items_total_units_check",
      sql`${table.totalUnits} IS NULL OR ${table.totalUnits} >= 0`
    ),
    foreignKey({
      name: "learning_items_user_goal_fk",
      columns: [table.userId, table.goalId],
      foreignColumns: [goals.userId, goals.id],
    }).onDelete("set null"),
    foreignKey({
      name: "learning_items_user_project_fk",
      columns: [table.userId, table.projectId],
      foreignColumns: [projects.userId, projects.id],
    }).onDelete("set null"),
    index("learning_items_user_id_idx").on(table.userId),
    index("learning_items_user_status_idx").on(table.userId, table.status),
    index("learning_items_user_type_idx").on(table.userId, table.type),
    index("learning_items_user_is_archived_idx").on(
      table.userId,
      table.isArchived
    ),
    index("learning_items_user_goal_idx").on(table.userId, table.goalId),
    index("learning_items_user_project_idx").on(table.userId, table.projectId),
  ]
);

export const learningItem = learningItems;

export type LearningItem = typeof learningItems.$inferSelect;
export type NewLearningItem = typeof learningItems.$inferInsert;
