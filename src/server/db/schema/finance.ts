import {
  pgTable,
  text,
  timestamp,
  numeric,
  boolean,
  unique,
  check,
  foreignKey,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";
import { goals } from "./goals";

/**
 * Financial Accounts Table
 * Represents user accounts: checking, savings, investment, credit_card, cash.
 */
export const financeAccounts = pgTable(
  "finance_accounts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    accountType: text("account_type", {
      enum: ["checking", "savings", "investment", "credit_card", "cash"],
    }).notNull(),
    currency: text("currency").notNull().default("PKR"),
    initialBalance: numeric("initial_balance", { precision: 14, scale: 2 })
      .notNull()
      .default("0.00"),
    balance: numeric("balance", { precision: 14, scale: 2 })
      .notNull()
      .default("0.00"),
    color: text("color"),
    icon: text("icon"),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("finance_accounts_user_id_id_unique").on(table.userId, table.id),
    check(
      "finance_accounts_name_non_empty",
      sql`length(trim(${table.name})) > 0`
    ),
    check(
      "finance_accounts_type_check",
      sql`${table.accountType} IN ('checking', 'savings', 'investment', 'credit_card', 'cash')`
    ),
    index("finance_accounts_user_idx").on(table.userId),
    index("finance_accounts_user_archived_idx").on(
      table.userId,
      table.isArchived
    ),
  ]
);

/**
 * Financial Categories Table
 * Income and expense categories.
 */
export const financeCategories = pgTable(
  "finance_categories",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    categoryType: text("category_type", {
      enum: ["expense", "income"],
    }).notNull(),
    icon: text("icon"),
    color: text("color"),
    isArchived: boolean("is_archived").notNull().default(false),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("finance_categories_user_id_id_unique").on(table.userId, table.id),
    unique("finance_categories_user_name_type_unique").on(
      table.userId,
      table.name,
      table.categoryType
    ),
    check(
      "finance_categories_name_non_empty",
      sql`length(trim(${table.name})) > 0`
    ),
    check(
      "finance_categories_type_check",
      sql`${table.categoryType} IN ('expense', 'income')`
    ),
    index("finance_categories_user_idx").on(table.userId),
    index("finance_categories_user_type_idx").on(
      table.userId,
      table.categoryType
    ),
  ]
);

/**
 * Financial Transactions Table
 * Income, expense, and transfer records.
 */
export const financeTransactions = pgTable(
  "finance_transactions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    toAccountId: text("to_account_id"),
    transactionType: text("transaction_type", {
      enum: ["income", "expense", "transfer"],
    }).notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("PKR"),
    date: timestamp("date", { withTimezone: true }).notNull(),
    categoryId: text("category_id"),
    payee: text("payee"),
    description: text("description"),
    goalId: text("goal_id"),
    tags: jsonb("tags")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("finance_transactions_user_id_id_unique").on(table.userId, table.id),
    foreignKey({
      name: "finance_transactions_user_account_fk",
      columns: [table.userId, table.accountId],
      foreignColumns: [financeAccounts.userId, financeAccounts.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_transactions_user_to_account_fk",
      columns: [table.userId, table.toAccountId],
      foreignColumns: [financeAccounts.userId, financeAccounts.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_transactions_user_category_fk",
      columns: [table.userId, table.categoryId],
      foreignColumns: [financeCategories.userId, financeCategories.id],
    }).onDelete("set null"),
    foreignKey({
      name: "finance_transactions_user_goal_fk",
      columns: [table.userId, table.goalId],
      foreignColumns: [goals.userId, goals.id],
    }).onDelete("set null"),
    check("finance_transactions_amount_positive", sql`${table.amount} > 0`),
    check(
      "finance_transactions_type_check",
      sql`${table.transactionType} IN ('income', 'expense', 'transfer')`
    ),
    check(
      "finance_transactions_transfer_invariants",
      sql`(${table.transactionType} != 'transfer' AND ${table.toAccountId} IS NULL) OR (${table.transactionType} = 'transfer' AND ${table.toAccountId} IS NOT NULL AND ${table.toAccountId} != ${table.accountId})`
    ),
    index("finance_transactions_user_date_idx").on(table.userId, table.date),
    index("finance_transactions_user_account_idx").on(
      table.userId,
      table.accountId
    ),
    index("finance_transactions_user_type_idx").on(
      table.userId,
      table.transactionType
    ),
    index("finance_transactions_user_category_idx").on(
      table.userId,
      table.categoryId
    ),
  ]
);

/**
 * Financial Budgets Table
 * Monthly spending targets per category.
 */
export const financeBudgets = pgTable(
  "finance_budgets",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    categoryId: text("category_id").notNull(),
    month: text("month").notNull(), // Format: 'YYYY-MM'
    targetAmount: numeric("target_amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("PKR"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("finance_budgets_user_id_id_unique").on(table.userId, table.id),
    unique("finance_budgets_user_category_month_unique").on(
      table.userId,
      table.categoryId,
      table.month
    ),
    foreignKey({
      name: "finance_budgets_user_category_fk",
      columns: [table.userId, table.categoryId],
      foreignColumns: [financeCategories.userId, financeCategories.id],
    }).onDelete("cascade"),
    check("finance_budgets_target_positive", sql`${table.targetAmount} > 0`),
    check(
      "finance_budgets_month_format",
      sql`${table.month} ~ '^\\d{4}-(0[1-9]|1[0-2])$'`
    ),
    index("finance_budgets_user_month_idx").on(table.userId, table.month),
    index("finance_budgets_user_category_idx").on(
      table.userId,
      table.categoryId
    ),
  ]
);

export const financeAccount = financeAccounts;
export const financeCategory = financeCategories;
export const financeTransaction = financeTransactions;
export const financeBudget = financeBudgets;

export type FinanceAccount = typeof financeAccounts.$inferSelect;
export type NewFinanceAccount = typeof financeAccounts.$inferInsert;
export type FinanceCategory = typeof financeCategories.$inferSelect;
export type NewFinanceCategory = typeof financeCategories.$inferInsert;
export type FinanceTransaction = typeof financeTransactions.$inferSelect;
export type NewFinanceTransaction = typeof financeTransactions.$inferInsert;
export type FinanceBudget = typeof financeBudgets.$inferSelect;
export type NewFinanceBudget = typeof financeBudgets.$inferInsert;

