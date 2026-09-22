import {
  pgTable,
  text,
  timestamp,
  boolean,
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
import { notes } from "./notes";

/**
 * Content Items Table
 * Master entity for content ideas, drafts, and scheduled/published pieces.
 */
export const contentItems = pgTable(
  "content_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    contentType: text("content_type", {
      enum: [
        "post",
        "thread",
        "article",
        "short_video",
        "carousel",
        "newsletter",
        "other",
      ],
    })
      .notNull()
      .default("post"),
    status: text("status", {
      enum: [
        "idea",
        "draft",
        "in_review",
        "scheduled",
        "published",
        "archived",
      ],
    })
      .notNull()
      .default("idea"),
    topic: text("topic"),
    targetAudience: text("target_audience"),
    primaryPlatform: text("primary_platform"),
    targetChannels: jsonb("target_channels")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    tags: jsonb("tags")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    summary: text("summary"),
    mediaUrls: jsonb("media_urls")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    projectId: text("project_id"),
    goalId: text("goal_id"),
    noteId: text("note_id"),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("content_items_user_id_id_unique").on(table.userId, table.id),
    check(
      "content_items_title_non_empty",
      sql`length(trim(${table.title})) > 0`
    ),
    check(
      "content_items_title_max_length",
      sql`length(${table.title}) <= 255`
    ),
    check(
      "content_items_type_check",
      sql`${table.contentType} IN ('post', 'thread', 'article', 'short_video', 'carousel', 'newsletter', 'other')`
    ),
    check(
      "content_items_status_check",
      sql`${table.status} IN ('idea', 'draft', 'in_review', 'scheduled', 'published', 'archived')`
    ),
    foreignKey({
      name: "content_items_user_project_fk",
      columns: [table.userId, table.projectId],
      foreignColumns: [projects.userId, projects.id],
    }).onDelete("set null"),
    foreignKey({
      name: "content_items_user_goal_fk",
      columns: [table.userId, table.goalId],
      foreignColumns: [goals.userId, goals.id],
    }).onDelete("set null"),
    foreignKey({
      name: "content_items_user_note_fk",
      columns: [table.userId, table.noteId],
      foreignColumns: [notes.userId, notes.id],
    }).onDelete("set null"),
    index("content_items_user_id_idx").on(table.userId),
    index("content_items_user_status_idx").on(table.userId, table.status),
    index("content_items_user_type_idx").on(table.userId, table.contentType),
    index("content_items_user_scheduled_idx").on(
      table.userId,
      table.scheduledAt
    ),
    index("content_items_user_is_archived_idx").on(
      table.userId,
      table.isArchived
    ),
    index("content_items_user_project_idx").on(table.userId, table.projectId),
    index("content_items_user_goal_idx").on(table.userId, table.goalId),
  ]
);

/**
 * Content Variants Table
 * Platform-specific adaptations of a master content item (e.g. Twitter thread, LinkedIn post, Blog markdown).
 */
export const contentVariants = pgTable(
  "content_variants",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    contentItemId: text("content_item_id").notNull(),
    platform: text("platform", {
      enum: [
        "twitter",
        "linkedin",
        "blog",
        "instagram",
        "youtube",
        "newsletter",
        "other",
      ],
    }).notNull(),
    title: text("title"),
    body: text("body").notNull().default(""),
    threadItems: jsonb("thread_items")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    charCount: integer("char_count").notNull().default(0),
    status: text("status", {
      enum: ["draft", "ready", "published"],
    })
      .notNull()
      .default("draft"),
    customSettings: jsonb("custom_settings")
      .$type<{
        slug?: string;
        canonicalUrl?: string;
        metaDescription?: string;
        hashtags?: string[];
        threadNumbering?: boolean;
      }>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("content_variants_user_id_id_unique").on(table.userId, table.id),
    unique("content_variants_user_item_platform_unique").on(
      table.userId,
      table.contentItemId,
      table.platform
    ),
    foreignKey({
      name: "content_variants_user_item_fk",
      columns: [table.userId, table.contentItemId],
      foreignColumns: [contentItems.userId, contentItems.id],
    }).onDelete("cascade"),
    check(
      "content_variants_platform_check",
      sql`${table.platform} IN ('twitter', 'linkedin', 'blog', 'instagram', 'youtube', 'newsletter', 'other')`
    ),
    check(
      "content_variants_status_check",
      sql`${table.status} IN ('draft', 'ready', 'published')`
    ),
    check("content_variants_char_count_non_negative", sql`${table.charCount} >= 0`),
    index("content_variants_user_id_idx").on(table.userId),
    index("content_variants_user_item_idx").on(
      table.userId,
      table.contentItemId
    ),
    index("content_variants_user_platform_idx").on(
      table.userId,
      table.platform
    ),
  ]
);

export const contentItem = contentItems;
export const contentVariant = contentVariants;

export type ContentItem = typeof contentItems.$inferSelect;
export type NewContentItem = typeof contentItems.$inferInsert;
export type ContentVariant = typeof contentVariants.$inferSelect;
export type NewContentVariant = typeof contentVariants.$inferInsert;
