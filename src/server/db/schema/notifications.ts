import {
  pgTable,
  text,
  varchar,
  timestamp,
  boolean,
  jsonb,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";

/**
 * Notifications Table
 * Stores in-app user notifications, alerts, reminders, and automation notices.
 * Fully multi-tenant isolated via foreign key to user.id with ON DELETE CASCADE.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    message: text("message").notNull(),
    type: text("type", {
      enum: ["info", "warning", "success", "error", "reminder"],
    })
      .notNull()
      .default("info"),
    entityType: text("entity_type", {
      enum: ["task", "project", "goal", "habit", "finance", "content", "system"],
    }),
    entityId: text("entity_id"),
    linkUrl: text("link_url"),
    isRead: boolean("is_read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notifications_user_read_created_idx").on(
      table.userId,
      table.isRead,
      table.createdAt.desc()
    ),
    index("notifications_user_created_idx").on(
      table.userId,
      table.createdAt.desc()
    ),
    index("notifications_user_id_idx").on(table.userId),
    check(
      "notifications_type_check",
      sql`${table.type} IN ('info', 'warning', 'success', 'error', 'reminder')`
    ),
    check(
      "notifications_entity_type_check",
      sql`${table.entityType} IS NULL OR ${table.entityType} IN ('task', 'project', 'goal', 'habit', 'finance', 'content', 'system')`
    ),
  ]
);

export const notification = notifications;

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
