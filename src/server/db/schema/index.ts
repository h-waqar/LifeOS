import { relations } from "drizzle-orm";
import {
  user,
  session,
  account,
  verification,
  passkey,
  users,
  sessions,
  accounts,
  verifications,
  passkeys,
} from "./auth";
import { userPreferences, preferences } from "./preferences";
import { auditLog, auditLogs } from "./audit";
import { projects, project } from "./projects";
import { tasks, task } from "./tasks";

// Table re-exports
export {
  user,
  session,
  account,
  verification,
  passkey,
  users,
  sessions,
  accounts,
  verifications,
  passkeys,
  userPreferences,
  preferences,
  auditLog,
  auditLogs,
  projects,
  project,
  tasks,
  task,
};

// Drizzle Relations
export const userRelations = relations(user, ({ one, many }) => ({
  preferences: one(userPreferences, {
    fields: [user.id],
    references: [userPreferences.userId],
  }),
  sessions: many(session),
  accounts: many(account),
  passkeys: many(passkey),
  auditLogs: many(auditLog),
  projects: many(projects),
  tasks: many(tasks),
}));

export const userPreferencesRelations = relations(
  userPreferences,
  ({ one }) => ({
    user: one(user, {
      fields: [userPreferences.userId],
      references: [user.id],
    }),
  })
);

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const passkeyRelations = relations(passkey, ({ one }) => ({
  user: one(user, {
    fields: [passkey.userId],
    references: [user.id],
  }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  user: one(user, {
    fields: [auditLog.userId],
    references: [user.id],
  }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(user, {
    fields: [projects.userId],
    references: [user.id],
  }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  user: one(user, {
    fields: [tasks.userId],
    references: [user.id],
  }),
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  parentTask: one(tasks, {
    fields: [tasks.parentTaskId],
    references: [tasks.id],
    relationName: "subtasks",
  }),
  subtasks: many(tasks, {
    relationName: "subtasks",
  }),
}));

// Inferred TypeScript Model Types
export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;

export type Session = typeof session.$inferSelect;
export type NewSession = typeof session.$inferInsert;

export type Account = typeof account.$inferSelect;
export type NewAccount = typeof account.$inferInsert;

export type Verification = typeof verification.$inferSelect;
export type NewVerification = typeof verification.$inferInsert;

export type Passkey = typeof passkey.$inferSelect;
export type NewPasskey = typeof passkey.$inferInsert;

export type UserPreferences = typeof userPreferences.$inferSelect;
export type NewUserPreferences = typeof userPreferences.$inferInsert;

export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

/**
 * Explicit list of foundational table names.
 * Used by tests to assert vertical-slice schema boundaries.
 */
export const FOUNDATIONAL_TABLE_NAMES = [
  "user",
  "session",
  "account",
  "verification",
  "passkey",
  "user_preferences",
  "audit_log",
] as const;

/**
 * Explicit list of approved Phase 1 Core Domain table names (Plan 01-07).
 */
export const CORE_DOMAIN_TABLE_NAMES = [
  "projects",
  "tasks",
] as const;
