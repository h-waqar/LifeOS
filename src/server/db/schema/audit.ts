import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * Audit Log Table
 * Immutable audit log capturing security, authentication, and mutating events.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    category: text("category", {
      enum: ["auth", "security", "mutation", "system"],
    }).notNull(),
    action: text("action").notNull(),
    status: text("status", { enum: ["success", "failure"] }).notNull(),
    actor: text("actor"),
    details: jsonb("details"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_log_category_idx").on(table.category),
    index("audit_log_action_idx").on(table.action),
    index("audit_log_created_at_idx").on(table.createdAt),
    index("audit_log_user_id_idx").on(table.userId),
  ]
);

export const auditLogs = auditLog;
