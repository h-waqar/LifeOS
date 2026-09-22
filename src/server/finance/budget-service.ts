import { eq, and, asc, gte, lt, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  financeBudgets,
  financeCategories,
  financeTransactions,
  type FinanceBudget,
} from "@/server/db/schema";
import { createAuditLog } from "@/server/audit";
import {
  upsertBudgetSchema,
  copyPreviousBudgetsSchema,
  type UpsertBudgetInput,
  type CopyPreviousBudgetsInput,
} from "./validation";
import {
  calculateBudgetUtilization,
  type BudgetUtilizationResult,
} from "./calculations";
import { NotFoundError, InvariantViolationError } from "./errors";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Budget service cannot be initialized in the browser."
  );
}

export { NotFoundError, InvariantViolationError };

export interface CategoryBudgetProgress extends BudgetUtilizationResult {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryIcon?: string | null;
  categoryColor?: string | null;
  month: string;
  targetAmount: number;
  currency: string;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Computes the UTC start and end bounds for a given YYYY-MM month string.
 */
export function getMonthDateBounds(month: string): { start: Date; end: Date } {
  const [yearStr, monthStr] = month.split("-");
  const year = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);
  const start = new Date(Date.UTC(year, m - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, m, 1, 0, 0, 0, 0));
  return { start, end };
}

/**
 * Returns the predecessor month string in YYYY-MM format.
 */
export function getPreviousMonth(month: string): string {
  const [yearStr, monthStr] = month.split("-");
  let year = parseInt(yearStr, 10);
  let m = parseInt(monthStr, 10) - 1;
  if (m === 0) {
    m = 12;
    year -= 1;
  }
  return `${year}-${String(m).padStart(2, "0")}`;
}

/**
 * Inserts or updates a monthly budget target for a category.
 */
export async function upsertBudget(
  userId: string,
  input: UpsertBudgetInput
): Promise<FinanceBudget> {
  const validated = upsertBudgetSchema.parse(input);

  // Verify category belongs to user
  const [cat] = await db
    .select()
    .from(financeCategories)
    .where(
      and(
        eq(financeCategories.userId, userId),
        eq(financeCategories.id, validated.categoryId)
      )
    )
    .limit(1);

  if (!cat) {
    throw new InvariantViolationError(
      `Category not found or does not belong to user: ${validated.categoryId}`
    );
  }

  const [upserted] = await db
    .insert(financeBudgets)
    .values({
      userId,
      categoryId: validated.categoryId,
      month: validated.month,
      targetAmount: validated.targetAmount,
      currency: validated.currency,
      notes: validated.notes ?? null,
    })
    .onConflictDoUpdate({
      target: [
        financeBudgets.userId,
        financeBudgets.categoryId,
        financeBudgets.month,
      ],
      set: {
        targetAmount: validated.targetAmount,
        currency: validated.currency,
        notes: validated.notes ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  await createAuditLog({
    userId,
    category: "mutation",
    action: "finance.budget.upserted",
    status: "success",
    details: {
      budgetId: upserted.id,
      categoryId: upserted.categoryId,
      month: upserted.month,
      targetAmount: upserted.targetAmount,
    },
  });

  return upserted;
}

/**
 * Lists all budgets for a given month with real-time actual spending and utilization.
 */
export async function listBudgetsForMonth(
  userId: string,
  month: string
): Promise<CategoryBudgetProgress[]> {
  // Validate month format
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new InvariantViolationError("Invalid month format. Expected YYYY-MM");
  }

  const { start, end } = getMonthDateBounds(month);

  // 1. Fetch all budgets for the month joined with category info
  const budgetRows = await db
    .select({
      budget: financeBudgets,
      categoryName: financeCategories.name,
      categoryIcon: financeCategories.icon,
      categoryColor: financeCategories.color,
    })
    .from(financeBudgets)
    .innerJoin(
      financeCategories,
      eq(financeBudgets.categoryId, financeCategories.id)
    )
    .where(
      and(
        eq(financeBudgets.userId, userId),
        eq(financeBudgets.month, month)
      )
    )
    .orderBy(asc(financeCategories.name));

  // 2. Aggregate actual spending for this month (expenses only)
  const spentRows = await db
    .select({
      categoryId: financeTransactions.categoryId,
      totalSpent: sql<string>`coalesce(sum(${financeTransactions.amount}), 0)`,
    })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financeTransactions.transactionType, "expense"),
        gte(financeTransactions.date, start),
        lt(financeTransactions.date, end)
      )
    )
    .groupBy(financeTransactions.categoryId);

  const spentMap = new Map<string, number>();
  for (const r of spentRows) {
    if (r.categoryId) {
      spentMap.set(r.categoryId, parseFloat(r.totalSpent));
    }
  }

  // 3. Compute utilization metrics for each budget
  return budgetRows.map((r) => {
    const targetAmount = parseFloat(r.budget.targetAmount);
    const spentAmount = spentMap.get(r.budget.categoryId) ?? 0;
    const util = calculateBudgetUtilization(targetAmount, spentAmount);

    return {
      id: r.budget.id,
      categoryId: r.budget.categoryId,
      categoryName: r.categoryName,
      categoryIcon: r.categoryIcon,
      categoryColor: r.categoryColor,
      month: r.budget.month,
      targetAmount,
      currency: r.budget.currency,
      notes: r.budget.notes,
      createdAt: r.budget.createdAt,
      updatedAt: r.budget.updatedAt,
      ...util,
    };
  });
}

/**
 * Copies budget targets from previous month to target month for categories that don't have one set.
 */
export async function copyBudgetsFromPreviousMonth(
  userId: string,
  input: CopyPreviousBudgetsInput
): Promise<{ copiedCount: number }> {
  const validated = copyPreviousBudgetsSchema.parse(input);
  const prevMonth = getPreviousMonth(validated.targetMonth);

  // 1. Fetch previous month budgets
  const prevBudgets = await db
    .select()
    .from(financeBudgets)
    .where(
      and(
        eq(financeBudgets.userId, userId),
        eq(financeBudgets.month, prevMonth)
      )
    );

  if (prevBudgets.length === 0) {
    return { copiedCount: 0 };
  }

  // 2. Fetch target month existing budgets
  const existingBudgets = await db
    .select({ categoryId: financeBudgets.categoryId })
    .from(financeBudgets)
    .where(
      and(
        eq(financeBudgets.userId, userId),
        eq(financeBudgets.month, validated.targetMonth)
      )
    );

  const existingCategoryIds = new Set(existingBudgets.map((b) => b.categoryId));

  // 3. Filter candidates to copy
  const toCopy = prevBudgets.filter((b) => !existingCategoryIds.has(b.categoryId));
  if (toCopy.length === 0) {
    return { copiedCount: 0 };
  }

  // 4. Batch insert
  const insertPayload = toCopy.map((b) => ({
    userId,
    categoryId: b.categoryId,
    month: validated.targetMonth,
    targetAmount: b.targetAmount,
    currency: b.currency,
    notes: b.notes,
  }));

  await db.insert(financeBudgets).values(insertPayload);

  await createAuditLog({
    userId,
    category: "mutation",
    action: "finance.budget.copied",
    status: "success",
    details: {
      fromMonth: prevMonth,
      toMonth: validated.targetMonth,
      copiedCount: toCopy.length,
    },
  });

  return { copiedCount: toCopy.length };
}

/**
 * Deletes a monthly budget by ID.
 */
export async function deleteBudget(
  userId: string,
  budgetId: string
): Promise<void> {
  const [existing] = await db
    .select()
    .from(financeBudgets)
    .where(
      and(
        eq(financeBudgets.userId, userId),
        eq(financeBudgets.id, budgetId)
      )
    )
    .limit(1);

  if (!existing) {
    throw new NotFoundError(`Budget not found: ${budgetId}`);
  }

  await db
    .delete(financeBudgets)
    .where(
      and(
        eq(financeBudgets.userId, userId),
        eq(financeBudgets.id, budgetId)
      )
    );

  await createAuditLog({
    userId,
    category: "mutation",
    action: "finance.budget.deleted",
    status: "success",
    details: {
      budgetId,
      categoryId: existing.categoryId,
      month: existing.month,
    },
  });
}
