import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  unique,
  foreignKey,
  check,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";

/**
 * People Table
 * Defines contacts for Relationships / People CRM.
 * Enforces composite multi-tenant isolation at the database level.
 */
export const people = pgTable(
  "people",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    relationshipType: text("relationship_type", {
      enum: [
        "client",
        "friend",
        "family",
        "colleague",
        "prospect",
        "mentor",
        "professional",
        "other",
      ],
    })
      .notNull()
      .default("colleague"),
    company: text("company"),
    role: text("role"),
    email: text("email"),
    phone: text("phone"),
    contactInfo: jsonb("contact_info")
      .$type<Record<string, any>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    tags: jsonb("tags")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    notes: text("notes"),
    isArchived: boolean("is_archived").notNull().default(false),
    lastInteractionDate: timestamp("last_interaction_date", {
      withTimezone: true,
    }),
    nextFollowUpDate: timestamp("next_follow_up_date", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("people_user_id_id_unique").on(table.userId, table.id),
    check("people_name_non_empty", sql`length(trim(${table.name})) > 0`),
    check("people_name_max_length", sql`length(${table.name}) <= 255`),
    check(
      "people_relationship_type_check",
      sql`${table.relationshipType} IN ('client', 'friend', 'family', 'colleague', 'prospect', 'mentor', 'professional', 'other')`
    ),
    index("people_user_id_idx").on(table.userId),
    index("people_user_relationship_type_idx").on(
      table.userId,
      table.relationshipType
    ),
    index("people_user_is_archived_idx").on(table.userId, table.isArchived),
    index("people_user_company_idx").on(table.userId, table.company),
    index("people_user_next_follow_up_idx").on(
      table.userId,
      table.nextFollowUpDate
    ),
    index("people_user_last_interaction_idx").on(
      table.userId,
      table.lastInteractionDate
    ),
  ]
);

/**
 * Interactions Table
 * Logs interactions (calls, meetings, emails, etc.) with contacts.
 */
export const interactions = pgTable(
  "interactions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    personId: text("person_id").notNull(),
    date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
    channel: text("channel", {
      enum: ["meeting", "call", "email", "message", "in_person", "other"],
    })
      .notNull()
      .default("call"),
    summary: text("summary").notNull(),
    nextFollowUpDate: timestamp("next_follow_up_date", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("interactions_user_id_id_unique").on(table.userId, table.id),
    foreignKey({
      name: "interactions_user_person_fk",
      columns: [table.userId, table.personId],
      foreignColumns: [people.userId, people.id],
    }).onDelete("cascade"),
    check(
      "interactions_summary_non_empty",
      sql`length(trim(${table.summary})) > 0`
    ),
    check(
      "interactions_channel_check",
      sql`${table.channel} IN ('meeting', 'call', 'email', 'message', 'in_person', 'other')`
    ),
    index("interactions_user_person_idx").on(table.userId, table.personId),
    index("interactions_user_date_idx").on(table.userId, table.date),
  ]
);

export const person = people;
export const interaction = interactions;

export type Person = typeof people.$inferSelect;
export type NewPerson = typeof people.$inferInsert;
export type Interaction = typeof interactions.$inferSelect;
export type NewInteraction = typeof interactions.$inferInsert;
