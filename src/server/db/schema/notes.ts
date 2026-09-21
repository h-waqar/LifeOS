import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  unique,
  foreignKey,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";
import { projects } from "./projects";
import { goals } from "./goals";
import { tasks } from "./tasks";

/**
 * Notes Table
 * Defines Markdown knowledge notes with tags, life-area categorization,
 * note types, and direct entity associations (projects, goals, tasks).
 *
 * Enforces strict composite isolation across users via composite foreign keys.
 */
export const notes = pgTable(
  "notes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    content: text("content").notNull().default(""),
    noteType: text("note_type", {
      enum: [
        "quick",
        "meeting",
        "research",
        "idea",
        "journal",
        "documentation",
        "reference",
        "learning",
      ],
    })
      .notNull()
      .default("quick"),
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
    tags: jsonb("tags")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    isPinned: boolean("is_pinned").notNull().default(false),
    isArchived: boolean("is_archived").notNull().default(false),
    // Entity links (composite foreign keys to existing tables)
    projectId: text("project_id"),
    goalId: text("goal_id"),
    taskId: text("task_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("notes_user_id_id_unique").on(table.userId, table.id),
    unique("notes_user_id_slug_unique").on(table.userId, table.slug),
    foreignKey({
      name: "notes_user_project_fk",
      columns: [table.userId, table.projectId],
      foreignColumns: [projects.userId, projects.id],
    }).onDelete("set null"),
    foreignKey({
      name: "notes_user_goal_fk",
      columns: [table.userId, table.goalId],
      foreignColumns: [goals.userId, goals.id],
    }).onDelete("set null"),
    foreignKey({
      name: "notes_user_task_fk",
      columns: [table.userId, table.taskId],
      foreignColumns: [tasks.userId, tasks.id],
    }).onDelete("set null"),
    index("notes_user_id_idx").on(table.userId),
    index("notes_user_area_idx").on(table.userId, table.area),
    index("notes_user_note_type_idx").on(table.userId, table.noteType),
    index("notes_user_updated_at_idx").on(table.userId, table.updatedAt),
  ]
);

/**
 * Note Links Table
 * Tracks parsed bidirectional wikilinks between notes for fast O(1) backlink graph traversal.
 */
export const noteLinks = pgTable(
  "note_links",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sourceNoteId: text("source_note_id").notNull(),
    targetNoteId: text("target_note_id"),
    targetTitle: text("target_title").notNull(),
    displayText: text("display_text"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("note_links_unique").on(
      table.userId,
      table.sourceNoteId,
      table.targetTitle
    ),
    foreignKey({
      name: "note_links_source_note_fk",
      columns: [table.userId, table.sourceNoteId],
      foreignColumns: [notes.userId, notes.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "note_links_target_note_fk",
      columns: [table.userId, table.targetNoteId],
      foreignColumns: [notes.userId, notes.id],
    }).onDelete("set null"),
    index("note_links_source_idx").on(table.userId, table.sourceNoteId),
    index("note_links_target_idx").on(table.userId, table.targetNoteId),
    index("note_links_target_title_idx").on(table.userId, table.targetTitle),
  ]
);

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
export type NoteLink = typeof noteLinks.$inferSelect;
export type NewNoteLink = typeof noteLinks.$inferInsert;
