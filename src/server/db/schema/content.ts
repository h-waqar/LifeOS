import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  numeric,
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

/**
 * Content Publications Table
 * Represents an individual distribution instance of a content item on a specific platform.
 */
export const contentPublications = pgTable(
  "content_publications",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    contentItemId: text("content_item_id").notNull(),
    variantId: text("variant_id"),
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
    status: text("status", {
      enum: ["scheduled", "published", "failed", "cancelled"],
    })
      .notNull()
      .default("scheduled"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    postUrl: text("post_url"),
    externalPostId: text("external_post_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("content_publications_user_id_id_unique").on(table.userId, table.id),
    foreignKey({
      name: "content_publications_user_item_fk",
      columns: [table.userId, table.contentItemId],
      foreignColumns: [contentItems.userId, contentItems.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "content_publications_user_variant_fk",
      columns: [table.userId, table.variantId],
      foreignColumns: [contentVariants.userId, contentVariants.id],
    }).onDelete("set null"),
    check(
      "content_publications_platform_check",
      sql`${table.platform} IN ('twitter', 'linkedin', 'blog', 'instagram', 'youtube', 'newsletter', 'other')`
    ),
    check(
      "content_publications_status_check",
      sql`${table.status} IN ('scheduled', 'published', 'failed', 'cancelled')`
    ),
    index("content_publications_user_id_idx").on(table.userId),
    index("content_publications_user_item_idx").on(
      table.userId,
      table.contentItemId
    ),
    index("content_publications_user_scheduled_idx").on(
      table.userId,
      table.scheduledFor
    ),
    index("content_publications_user_status_idx").on(
      table.userId,
      table.status
    ),
  ]
);

/**
 * Content Metrics Table
 * Timestamped performance snapshots (impressions, likes, shares, engagement rate) for publications.
 */
export const contentMetrics = pgTable(
  "content_metrics",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    publicationId: text("publication_id").notNull(),
    contentItemId: text("content_item_id").notNull(),
    views: integer("views").notNull().default(0),
    likes: integer("likes").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    shares: integer("shares").notNull().default(0),
    saves: integer("saves").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    engagementRate: numeric("engagement_rate", { precision: 5, scale: 2 })
      .notNull()
      .default("0.00"),
    notes: text("notes"),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("content_metrics_user_id_id_unique").on(table.userId, table.id),
    foreignKey({
      name: "content_metrics_user_publication_fk",
      columns: [table.userId, table.publicationId],
      foreignColumns: [contentPublications.userId, contentPublications.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "content_metrics_user_item_fk",
      columns: [table.userId, table.contentItemId],
      foreignColumns: [contentItems.userId, contentItems.id],
    }).onDelete("cascade"),
    check("content_metrics_views_non_negative", sql`${table.views} >= 0`),
    check("content_metrics_likes_non_negative", sql`${table.likes} >= 0`),
    check("content_metrics_comments_non_negative", sql`${table.comments} >= 0`),
    check("content_metrics_shares_non_negative", sql`${table.shares} >= 0`),
    check("content_metrics_saves_non_negative", sql`${table.saves} >= 0`),
    check("content_metrics_clicks_non_negative", sql`${table.clicks} >= 0`),
    check("content_metrics_engagement_rate_non_negative", sql`${table.engagementRate} >= 0`),
    index("content_metrics_user_id_idx").on(table.userId),
    index("content_metrics_user_publication_idx").on(
      table.userId,
      table.publicationId
    ),
    index("content_metrics_user_item_idx").on(
      table.userId,
      table.contentItemId
    ),
    index("content_metrics_user_recorded_idx").on(
      table.userId,
      table.recordedAt
    ),
  ]
);

export const contentPublication = contentPublications;
export const contentMetric = contentMetrics;

export type ContentPublication = typeof contentPublications.$inferSelect;
export type NewContentPublication = typeof contentPublications.$inferInsert;
export type ContentMetric = typeof contentMetrics.$inferSelect;
export type NewContentMetric = typeof contentMetrics.$inferInsert;

