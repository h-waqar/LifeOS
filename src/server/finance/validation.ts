import { z } from "zod";

export const accountTypeEnum = z.enum([
  "checking",
  "savings",
  "investment",
  "credit_card",
  "cash",
]);

export const categoryTypeEnum = z.enum(["expense", "income"]);

export const transactionTypeEnum = z.enum(["income", "expense", "transfer"]);

/**
 * Creates a financial account.
 */
export const createAccountSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Account name is required")
    .max(100, "Account name cannot exceed 100 characters"),
  accountType: accountTypeEnum,
  currency: z.string().trim().min(1).max(10).default("PKR"),
  initialBalance: z
    .union([
      z.number().min(0, "Initial balance cannot be negative"),
      z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid balance format"),
    ])
    .default(0)
    .transform((val) => Number(val).toFixed(2)),
  color: z.string().trim().max(50).nullish(),
  icon: z.string().trim().max(50).nullish(),
});

/**
 * Updates a financial account.
 */
export const updateAccountSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Account name cannot be empty")
    .max(100, "Account name cannot exceed 100 characters")
    .optional(),
  accountType: accountTypeEnum.optional(),
  color: z.string().trim().max(50).nullish(),
  icon: z.string().trim().max(50).nullish(),
  isArchived: z.boolean().optional(),
});

/**
 * Creates a financial category.
 */
export const createCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Category name is required")
    .max(100, "Category name cannot exceed 100 characters"),
  categoryType: categoryTypeEnum,
  icon: z.string().trim().max(50).nullish(),
  color: z.string().trim().max(50).nullish(),
});

/**
 * Updates a financial category.
 */
export const updateCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Category name cannot be empty")
    .max(100, "Category name cannot exceed 100 characters")
    .optional(),
  icon: z.string().trim().max(50).nullish(),
  color: z.string().trim().max(50).nullish(),
  isArchived: z.boolean().optional(),
});

/**
 * Base transaction validation fields.
 */
const baseTransactionSchema = z.object({
  accountId: z.string().trim().min(1, "Account ID is required"),
  toAccountId: z.string().trim().nullish(),
  transactionType: transactionTypeEnum,
  amount: z
    .union([
      z.number().positive("Amount must be strictly positive"),
      z.string().regex(/^(?!0(\.0{1,2})?$)(\d+(\.\d{1,2})?)$/, "Amount must be strictly positive"),
    ])
    .transform((val) => Number(val).toFixed(2)),
  currency: z.string().trim().min(1).max(10).default("PKR"),
  date: z
    .union([z.string().datetime(), z.string().regex(/^\d{4}-\d{2}-\d{2}/), z.date()])
    .transform((val) => (typeof val === "string" ? new Date(val) : val)),
  categoryId: z.string().trim().nullish(),
  payee: z.string().trim().max(255).nullish(),
  description: z.string().trim().max(1000).nullish(),
  goalId: z.string().trim().nullish(),
  tags: z.array(z.string().trim().min(1)).default([]),
});

export const createTransactionSchema = baseTransactionSchema.superRefine(
  (data, ctx) => {
    if (data.transactionType === "transfer") {
      if (!data.toAccountId || data.toAccountId.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Transfer requires a destination account (toAccountId)",
          path: ["toAccountId"],
        });
      } else if (data.toAccountId === data.accountId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Transfer destination cannot be the same as the source account",
          path: ["toAccountId"],
        });
      }
    } else {
      if (data.toAccountId != null && data.toAccountId !== "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Only transfer transactions can have a destination account",
          path: ["toAccountId"],
        });
      }
    }
  }
);

export const updateTransactionSchema = z
  .object({
    accountId: z.string().trim().min(1).optional(),
    toAccountId: z.string().trim().nullish(),
    transactionType: transactionTypeEnum.optional(),
    amount: z
      .union([
        z.number().positive("Amount must be strictly positive"),
        z.string().regex(/^(?!0(\.0{1,2})?$)(\d+(\.\d{1,2})?)$/, "Amount must be strictly positive"),
      ])
      .transform((val) => Number(val).toFixed(2))
      .optional(),
    currency: z.string().trim().min(1).max(10).optional(),
    date: z
      .union([z.string().datetime(), z.string().regex(/^\d{4}-\d{2}-\d{2}/), z.date()])
      .transform((val) => (typeof val === "string" ? new Date(val) : val))
      .optional(),
    categoryId: z.string().trim().nullish(),
    payee: z.string().trim().max(255).nullish(),
    description: z.string().trim().max(1000).nullish(),
    goalId: z.string().trim().nullish(),
    tags: z.array(z.string().trim().min(1)).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.transactionType === "transfer") {
      if (!data.toAccountId || data.toAccountId.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Transfer requires a destination account (toAccountId)",
          path: ["toAccountId"],
        });
      } else if (data.accountId && data.toAccountId === data.accountId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Transfer destination cannot be the same as the source account",
          path: ["toAccountId"],
        });
      }
    } else if (data.transactionType) {
      if (data.toAccountId != null && data.toAccountId !== "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Only transfer transactions can have a destination account",
          path: ["toAccountId"],
        });
      }
    }
  });

export const listTransactionsQuerySchema = z.object({
  accountId: z.string().trim().optional(),
  categoryId: z.string().trim().optional(),
  transactionType: transactionTypeEnum.optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  search: z.string().trim().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export const upsertBudgetSchema = z.object({
  categoryId: z.string().trim().min(1, "Category ID is required"),
  month: z
    .string()
    .trim()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must be in YYYY-MM format"),
  targetAmount: z
    .union([
      z.number().positive("Target amount must be strictly positive"),
      z.string().regex(/^(?!0(\.0{1,2})?$)(\d+(\.\d{1,2})?)$/, "Target amount must be strictly positive"),
    ])
    .transform((val) => Number(val).toFixed(2)),
  currency: z.string().trim().min(1).max(10).default("PKR"),
  notes: z.string().trim().max(1000).nullish(),
});

export const copyPreviousBudgetsSchema = z.object({
  targetMonth: z
    .string()
    .trim()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Target month must be in YYYY-MM format"),
});

export type CreateAccountInput = z.input<typeof createAccountSchema>;
export type UpdateAccountInput = z.input<typeof updateAccountSchema>;
export type CreateCategoryInput = z.input<typeof createCategorySchema>;
export type UpdateCategoryInput = z.input<typeof updateCategorySchema>;
export type CreateTransactionInput = z.input<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.input<typeof updateTransactionSchema>;
export type ListTransactionsQuery = z.input<typeof listTransactionsQuerySchema>;
export type UpsertBudgetInput = z.input<typeof upsertBudgetSchema>;
export type CopyPreviousBudgetsInput = z.input<typeof copyPreviousBudgetsSchema>;


