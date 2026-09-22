import { eq, and, desc, gte, lt, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  financeAccounts,
  financeCategories,
  financeTransactions,
  type FinanceAccount,
} from "@/server/db/schema";
import {
  calculateNetWorth,
  calculateMonthlyCashFlow,
  calculateSavingsRate,
  roundMoney,
  type NetWorthResult,
  type MonthlyCashFlowResult,
} from "./calculations";
import { getMonthDateBounds } from "./budget-service";
import { InvariantViolationError } from "./errors";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Finance Reports service cannot be initialized in the browser."
  );
}

export { InvariantViolationError };

export interface CategorySpendingItem {
  categoryId: string;
  categoryName: string;
  categoryIcon?: string | null;
  categoryColor?: string | null;
  spent: number;
  percentageOfTotal: number;
}

export interface FinanceSummaryReport extends NetWorthResult, MonthlyCashFlowResult {
  month: string;
  savingsRate: number;
  categorySpendingBreakdown: CategorySpendingItem[];
}

export interface NetWorthBreakdown extends NetWorthResult {
  accounts: FinanceAccount[];
}

/**
 * Computes a comprehensive monthly financial summary report for a user.
 */
export async function getFinanceSummary(
  userId: string,
  month: string
): Promise<FinanceSummaryReport> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new InvariantViolationError("Invalid month format. Expected YYYY-MM");
  }

  const { start, end } = getMonthDateBounds(month);

  // 1. Fetch active accounts for Net Worth
  const accounts = await db
    .select()
    .from(financeAccounts)
    .where(
      and(
        eq(financeAccounts.userId, userId),
        eq(financeAccounts.isArchived, false)
      )
    );

  const netWorthResult = calculateNetWorth(accounts);

  // 2. Fetch transactions within the month
  const monthTransactions = await db
    .select()
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        gte(financeTransactions.date, start),
        lt(financeTransactions.date, end)
      )
    );

  const cashFlowResult = calculateMonthlyCashFlow(monthTransactions, month);
  const savingsRate = calculateSavingsRate(
    cashFlowResult.totalIncome,
    cashFlowResult.totalExpenses
  );

  // 3. Category spending breakdown for expense transactions
  const expenseRows = await db
    .select({
      categoryId: financeTransactions.categoryId,
      categoryName: financeCategories.name,
      categoryIcon: financeCategories.icon,
      categoryColor: financeCategories.color,
      totalSpent: sql<string>`coalesce(sum(${financeTransactions.amount}), 0)`,
    })
    .from(financeTransactions)
    .leftJoin(
      financeCategories,
      eq(financeTransactions.categoryId, financeCategories.id)
    )
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financeTransactions.transactionType, "expense"),
        gte(financeTransactions.date, start),
        lt(financeTransactions.date, end)
      )
    )
    .groupBy(
      financeTransactions.categoryId,
      financeCategories.name,
      financeCategories.icon,
      financeCategories.color
    );

  const totalExp = cashFlowResult.totalExpenses;

  const categorySpendingBreakdown: CategorySpendingItem[] = expenseRows
    .map((row) => {
      const spent = parseFloat(row.totalSpent);
      const percentageOfTotal =
        totalExp > 0
          ? Math.round(((spent / totalExp) * 100 + Number.EPSILON) * 10) / 10
          : 0;

      return {
        categoryId: row.categoryId || "uncategorized",
        categoryName: row.categoryName || "Uncategorized",
        categoryIcon: row.categoryIcon || null,
        categoryColor: row.categoryColor || null,
        spent: roundMoney(spent),
        percentageOfTotal,
      };
    })
    .sort((a, b) => b.spent - a.spent);

  return {
    month,
    ...netWorthResult,
    ...cashFlowResult,
    savingsRate,
    categorySpendingBreakdown,
  };
}

/**
 * Returns net worth breakdown with accounts list.
 */
export async function getNetWorthBreakdown(
  userId: string
): Promise<NetWorthBreakdown> {
  const accounts = await db
    .select()
    .from(financeAccounts)
    .where(
      and(
        eq(financeAccounts.userId, userId),
        eq(financeAccounts.isArchived, false)
      )
    );

  const netWorthResult = calculateNetWorth(accounts);

  return {
    ...netWorthResult,
    accounts,
  };
}
