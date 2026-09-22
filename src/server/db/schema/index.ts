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
import { goals, goal } from "./goals";
import { projectMilestones, projectMilestone } from "./milestones";
import {
  habits,
  habit,
  habitEntries,
  habitEntry,
} from "./habits";
import {
  tasks,
  task,
  taskDependencies,
  taskDependency,
  type RecurrenceRule,
  type TaskDependency,
  type NewTaskDependency,
} from "./tasks";
import {
  timeBlocks,
  timeBlock,
} from "./time-blocks";
import {
  dailyPlans,
  dailyPlan,
  eveningReviews,
  eveningReview,
  type DailyPlan,
  type NewDailyPlan,
  type EveningReview,
  type NewEveningReview,
} from "./daily-plans";
import {
  notes,
  noteLinks,
  type Note,
  type NewNote,
  type NoteLink,
  type NewNoteLink,
} from "./notes";
import {
  people,
  person,
  interactions,
  interaction,
  type Person,
  type NewPerson,
  type Interaction,
  type NewInteraction,
} from "./people";
import {
  learningItems,
  learningItem,
  type LearningItem,
  type NewLearningItem,
} from "./learning";
import {
  financeAccounts,
  financeAccount,
  financeCategories,
  financeCategory,
  financeTransactions,
  financeTransaction,
  financeBudgets,
  financeBudget,
  type FinanceAccount,
  type NewFinanceAccount,
  type FinanceCategory,
  type NewFinanceCategory,
  type FinanceTransaction,
  type NewFinanceTransaction,
  type FinanceBudget,
  type NewFinanceBudget,
} from "./finance";
import {
  contentItems,
  contentItem,
  contentVariants,
  contentVariant,
  type ContentItem,
  type NewContentItem,
  type ContentVariant,
  type NewContentVariant,
} from "./content";

const note = notes;
const noteLink = noteLinks;

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
  goals,
  goal,
  projectMilestones,
  projectMilestone,
  habits,
  habit,
  habitEntries,
  habitEntry,
  tasks,
  task,
  taskDependencies,
  taskDependency,
  timeBlocks,
  timeBlock,
  dailyPlans,
  dailyPlan,
  eveningReviews,
  eveningReview,
  notes,
  note,
  noteLinks,
  noteLink,
  people,
  person,
  interactions,
  interaction,
  learningItems,
  learningItem,
  financeAccounts,
  financeAccount,
  financeCategories,
  financeCategory,
  financeTransactions,
  financeTransaction,
  financeBudgets,
  financeBudget,
  contentItems,
  contentItem,
  contentVariants,
  contentVariant,
};

// Drizzle Relations Declarations
export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  passkeys: many(passkey),
  projects: many(projects),
  goals: many(goals),
  projectMilestones: many(projectMilestones),
  habits: many(habits),
  habitEntries: many(habitEntries),
  tasks: many(tasks),
  taskDependencies: many(taskDependencies),
  timeBlocks: many(timeBlocks),
  dailyPlans: many(dailyPlans),
  eveningReviews: many(eveningReviews),
  notes: many(notes),
  noteLinks: many(noteLinks),
  people: many(people),
  interactions: many(interactions),
  learningItems: many(learningItems),
  financeAccounts: many(financeAccounts),
  financeCategories: many(financeCategories),
  financeTransactions: many(financeTransactions),
  financeBudgets: many(financeBudgets),
  contentItems: many(contentItems),
  contentVariants: many(contentVariants),
  auditLogs: many(auditLog),
}));

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

export const goalsRelations = relations(goals, ({ one, many }) => ({
  user: one(user, {
    fields: [goals.userId],
    references: [user.id],
  }),
  parentGoal: one(goals, {
    fields: [goals.parentGoalId],
    references: [goals.id],
    relationName: "goalHierarchy",
  }),
  childGoals: many(goals, {
    relationName: "goalHierarchy",
  }),
  projects: many(projects),
  habits: many(habits),
  tasks: many(tasks),
  timeBlocks: many(timeBlocks),
  learningItems: many(learningItems),
  financeTransactions: many(financeTransactions),
  contentItems: many(contentItems),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(user, {
    fields: [projects.userId],
    references: [user.id],
  }),
  goal: one(goals, {
    fields: [projects.goalId],
    references: [goals.id],
  }),
  tasks: many(tasks),
  milestones: many(projectMilestones),
  timeBlocks: many(timeBlocks),
  learningItems: many(learningItems),
  contentItems: many(contentItems),
}));

export const projectMilestonesRelations = relations(
  projectMilestones,
  ({ one, many }) => ({
    user: one(user, {
      fields: [projectMilestones.userId],
      references: [user.id],
    }),
    project: one(projects, {
      fields: [projectMilestones.projectId],
      references: [projects.id],
    }),
    tasks: many(tasks),
  })
);

export const habitsRelations = relations(habits, ({ one, many }) => ({
  user: one(user, {
    fields: [habits.userId],
    references: [user.id],
  }),
  goal: one(goals, {
    fields: [habits.goalId],
    references: [goals.id],
  }),
  entries: many(habitEntries),
  tasks: many(tasks),
  timeBlocks: many(timeBlocks),
}));

export const habitEntriesRelations = relations(habitEntries, ({ one }) => ({
  user: one(user, {
    fields: [habitEntries.userId],
    references: [user.id],
  }),
  habit: one(habits, {
    fields: [habitEntries.habitId],
    references: [habits.id],
  }),
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
  goal: one(goals, {
    fields: [tasks.goalId],
    references: [goals.id],
  }),
  milestone: one(projectMilestones, {
    fields: [tasks.milestoneId],
    references: [projectMilestones.id],
  }),
  habit: one(habits, {
    fields: [tasks.habitId],
    references: [habits.id],
  }),
  person: one(people, {
    fields: [tasks.personId],
    references: [people.id],
  }),
  parentTask: one(tasks, {
    fields: [tasks.parentTaskId],
    references: [tasks.id],
    relationName: "subtasks",
  }),
  subtasks: many(tasks, {
    relationName: "subtasks",
  }),
  dependencies: many(taskDependencies, {
    relationName: "taskBlockedBy",
  }),
  dependents: many(taskDependencies, {
    relationName: "taskBlocks",
  }),
  timeBlocks: many(timeBlocks),
}));

export const taskDependenciesRelations = relations(
  taskDependencies,
  ({ one }) => ({
    user: one(user, {
      fields: [taskDependencies.userId],
      references: [user.id],
    }),
    task: one(tasks, {
      fields: [taskDependencies.taskId],
      references: [tasks.id],
      relationName: "taskBlockedBy",
    }),
    dependsOnTask: one(tasks, {
      fields: [taskDependencies.dependsOnTaskId],
      references: [tasks.id],
      relationName: "taskBlocks",
    }),
  })
);

export const timeBlocksRelations = relations(timeBlocks, ({ one }) => ({
  user: one(user, {
    fields: [timeBlocks.userId],
    references: [user.id],
  }),
  task: one(tasks, {
    fields: [timeBlocks.taskId],
    references: [tasks.id],
  }),
  project: one(projects, {
    fields: [timeBlocks.projectId],
    references: [projects.id],
  }),
  goal: one(goals, {
    fields: [timeBlocks.goalId],
    references: [goals.id],
  }),
  habit: one(habits, {
    fields: [timeBlocks.habitId],
    references: [habits.id],
  }),
}));

export const dailyPlansRelations = relations(dailyPlans, ({ one, many }) => ({
  user: one(user, {
    fields: [dailyPlans.userId],
    references: [user.id],
  }),
  eveningReview: one(eveningReviews),
}));

export const eveningReviewsRelations = relations(eveningReviews, ({ one }) => ({
  user: one(user, {
    fields: [eveningReviews.userId],
    references: [user.id],
  }),
  dailyPlan: one(dailyPlans, {
    fields: [eveningReviews.dailyPlanId],
    references: [dailyPlans.id],
  }),
}));

export const notesRelations = relations(notes, ({ one, many }) => ({
  user: one(user, {
    fields: [notes.userId],
    references: [user.id],
  }),
  project: one(projects, {
    fields: [notes.projectId],
    references: [projects.id],
  }),
  goal: one(goals, {
    fields: [notes.goalId],
    references: [goals.id],
  }),
  task: one(tasks, {
    fields: [notes.taskId],
    references: [tasks.id],
  }),
  person: one(people, {
    fields: [notes.personId],
    references: [people.id],
  }),
  learningItem: one(learningItems, {
    fields: [notes.learningId],
    references: [learningItems.id],
  }),
  outgoingLinks: many(noteLinks, { relationName: "sourceNote" }),
  incomingLinks: many(noteLinks, { relationName: "targetNote" }),
  contentItems: many(contentItems),
}));

export const learningItemsRelations = relations(learningItems, ({ one, many }) => ({
  user: one(user, {
    fields: [learningItems.userId],
    references: [user.id],
  }),
  goal: one(goals, {
    fields: [learningItems.goalId],
    references: [goals.id],
  }),
  project: one(projects, {
    fields: [learningItems.projectId],
    references: [projects.id],
  }),
  notes: many(notes),
}));

export const noteLinksRelations = relations(noteLinks, ({ one }) => ({
  user: one(user, {
    fields: [noteLinks.userId],
    references: [user.id],
  }),
  sourceNote: one(notes, {
    fields: [noteLinks.sourceNoteId],
    references: [notes.id],
    relationName: "sourceNote",
  }),
  targetNote: one(notes, {
    fields: [noteLinks.targetNoteId],
    references: [notes.id],
    relationName: "targetNote",
  }),
}));

export const peopleRelations = relations(people, ({ one, many }) => ({
  user: one(user, {
    fields: [people.userId],
    references: [user.id],
  }),
  interactions: many(interactions),
  tasks: many(tasks),
  notes: many(notes),
}));

export const interactionsRelations = relations(interactions, ({ one }) => ({
  user: one(user, {
    fields: [interactions.userId],
    references: [user.id],
  }),
  person: one(people, {
    fields: [interactions.personId],
    references: [people.id],
  }),
}));

export const financeAccountsRelations = relations(
  financeAccounts,
  ({ one, many }) => ({
    user: one(user, {
      fields: [financeAccounts.userId],
      references: [user.id],
    }),
    transactions: many(financeTransactions, {
      relationName: "accountTransactions",
    }),
    incomingTransfers: many(financeTransactions, {
      relationName: "transferDestinationTransactions",
    }),
  })
);

export const financeCategoriesRelations = relations(
  financeCategories,
  ({ one, many }) => ({
    user: one(user, {
      fields: [financeCategories.userId],
      references: [user.id],
    }),
    transactions: many(financeTransactions),
    budgets: many(financeBudgets),
  })
);

export const financeBudgetsRelations = relations(
  financeBudgets,
  ({ one }) => ({
    user: one(user, {
      fields: [financeBudgets.userId],
      references: [user.id],
    }),
    category: one(financeCategories, {
      fields: [financeBudgets.categoryId],
      references: [financeCategories.id],
    }),
  })
);

export const financeTransactionsRelations = relations(
  financeTransactions,
  ({ one }) => ({
    user: one(user, {
      fields: [financeTransactions.userId],
      references: [user.id],
    }),
    account: one(financeAccounts, {
      fields: [financeTransactions.accountId],
      references: [financeAccounts.id],
      relationName: "accountTransactions",
    }),
    toAccount: one(financeAccounts, {
      fields: [financeTransactions.toAccountId],
      references: [financeAccounts.id],
      relationName: "transferDestinationTransactions",
    }),
    category: one(financeCategories, {
      fields: [financeTransactions.categoryId],
      references: [financeCategories.id],
    }),
    goal: one(goals, {
      fields: [financeTransactions.goalId],
      references: [goals.id],
    }),
  })
);

export const contentItemsRelations = relations(contentItems, ({ one, many }) => ({
  user: one(user, {
    fields: [contentItems.userId],
    references: [user.id],
  }),
  project: one(projects, {
    fields: [contentItems.projectId],
    references: [projects.id],
  }),
  goal: one(goals, {
    fields: [contentItems.goalId],
    references: [goals.id],
  }),
  note: one(notes, {
    fields: [contentItems.noteId],
    references: [notes.id],
  }),
  variants: many(contentVariants),
}));

export const contentVariantsRelations = relations(contentVariants, ({ one }) => ({
  user: one(user, {
    fields: [contentVariants.userId],
    references: [user.id],
  }),
  contentItem: one(contentItems, {
    fields: [contentVariants.contentItemId],
    references: [contentItems.id],
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

export type Goal = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type ProjectMilestone = typeof projectMilestones.$inferSelect;
export type NewProjectMilestone = typeof projectMilestones.$inferInsert;

export type Habit = typeof habits.$inferSelect;
export type NewHabit = typeof habits.$inferInsert;

export type HabitEntry = typeof habitEntries.$inferSelect;
export type NewHabitEntry = typeof habitEntries.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export type TimeBlock = typeof timeBlocks.$inferSelect;
export type NewTimeBlock = typeof timeBlocks.$inferInsert;

export type { DailyPlan, NewDailyPlan, EveningReview, NewEveningReview };
export type { TaskDependency, NewTaskDependency, RecurrenceRule };
export type { Note, NewNote, NoteLink, NewNoteLink };
export type { Person, NewPerson, Interaction, NewInteraction };
export type { LearningItem, NewLearningItem };
export type {
  FinanceAccount,
  NewFinanceAccount,
  FinanceCategory,
  NewFinanceCategory,
  FinanceTransaction,
  NewFinanceTransaction,
  FinanceBudget,
  NewFinanceBudget,
};
export type {
  ContentItem,
  NewContentItem,
  ContentVariant,
  NewContentVariant,
};

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

/**
 * Approved Phase 2 table names.
 */
export const PHASE_2_TABLE_NAMES = [
  "task_dependencies",
  "goals",
  "project_milestones",
  "habits",
  "habit_entries",
  "time_blocks",
  "daily_plans",
  "evening_reviews",
] as const;

/**
 * Approved Phase 3 table names.
 */
export const PHASE_3_TABLE_NAMES = [
  "notes",
  "note_links",
  "people",
  "interactions",
  "learning_items",
] as const;

/**
 * Approved Phase 4 table names.
 */
export const PHASE_4_TABLE_NAMES = [
  "finance_accounts",
  "finance_categories",
  "finance_transactions",
  "finance_budgets",
] as const;

/**
 * Approved Phase 5 table names (Plan 05-01).
 */
export const PHASE_5_PLAN_1_TABLE_NAMES = [
  "content_items",
  "content_variants",
] as const;

export const PHASE_5_TABLE_NAMES = [
  "content_items",
  "content_variants",
] as const;




