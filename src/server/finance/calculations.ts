/**
 * Pure Deterministic Personal Finance Calculation Engine
 *
 * Implements 100% pure mathematical calculations for:
 * - Net worth (Assets - Liabilities)
 * - Monthly Cash Flow (Income - Expenses with Transfer exclusion)
 * - Savings Rate (Bounded division-by-zero guards)
 * - Category Budget Utilization & Over-Budget flags
 * - Financial Rounding (EPSILON 2-decimal precision)
 */

export interface AccountBalanceInput {
  accountType: string;
  balance: number | string;
  isArchived?: boolean;
}

export interface TransactionSummaryInput {
  transactionType: string;
  amount: number | string;
  date: Date | string;
  categoryId?: string | null;
}

export interface NetWorthResult {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
}

export interface MonthlyCashFlowResult {
  totalIncome: number;
  totalExpenses: number;
  cashFlow: number;
}

export interface BudgetUtilizationResult {
  spentAmount: number;
  remainingAmount: number;
  utilizationPercentage: number;
  isOverBudget: boolean;
}

/**
 * Deterministic monetary rounding to 2 decimal places using Number.EPSILON.
 */
export function roundMoney(amount: number): number {
  const sign = amount < 0 ? -1 : 1;
  return (sign * Math.round((Math.abs(amount) + Number.EPSILON) * 100)) / 100;
}

/**
 * Calculates Net Worth from a set of financial accounts.
 *
 * Assets: checking, savings, investment, cash.
 * Liabilities: credit_card.
 * Net Worth = Assets - Liabilities.
 */
export function calculateNetWorth(
  accounts: AccountBalanceInput[],
  options?: { includeArchived?: boolean }
): NetWorthResult {
  const includeArchived = options?.includeArchived ?? false;

  const activeAccounts = accounts.filter((a) => includeArchived || !a.isArchived);

  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const acc of activeAccounts) {
    const balance = typeof acc.balance === "number" ? acc.balance : parseFloat(acc.balance || "0");
    if (isNaN(balance)) continue;

    if (acc.accountType === "credit_card") {
      if (balance >= 0) {
        totalLiabilities += balance;
      } else {
        totalAssets += Math.abs(balance);
      }
    } else {
      if (balance >= 0) {
        totalAssets += balance;
      } else {
        totalLiabilities += Math.abs(balance);
      }
    }
  }

  totalAssets = roundMoney(totalAssets);
  totalLiabilities = roundMoney(totalLiabilities);
  const netWorth = roundMoney(totalAssets - totalLiabilities);

  return {
    netWorth,
    totalAssets,
    totalLiabilities,
  };
}

/**
 * Calculates Monthly Cash Flow for a specific month (YYYY-MM).
 *
 * Excludes transfers: Transactions with type = 'transfer' contribute 0 to both income and expense.
 * Cash Flow = Monthly Income - Monthly Expenses.
 */
export function calculateMonthlyCashFlow(
  transactions: TransactionSummaryInput[],
  month?: string
): MonthlyCashFlowResult {
  let totalIncome = 0;
  let totalExpenses = 0;

  for (const tx of transactions) {
    // Check month if specified
    if (month) {
      const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
      const txMonth = txDate.toISOString().slice(0, 7); // 'YYYY-MM'
      if (txMonth !== month) continue;
    }

    const amount = typeof tx.amount === "number" ? tx.amount : parseFloat(tx.amount || "0");
    if (isNaN(amount) || amount <= 0) continue;

    // Strict transfer exclusion
    if (tx.transactionType === "income") {
      totalIncome += amount;
    } else if (tx.transactionType === "expense") {
      totalExpenses += amount;
    }
    // 'transfer' transactions are completely ignored for cash flow
  }

  totalIncome = roundMoney(totalIncome);
  totalExpenses = roundMoney(totalExpenses);
  const cashFlow = roundMoney(totalIncome - totalExpenses);

  return {
    totalIncome,
    totalExpenses,
    cashFlow,
  };
}

/**
 * Calculates Savings Rate as percentage of monthly income.
 *
 * Formula: round(((Income - Expenses) / Income) * 100, 2)
 *
 * Invariants:
 * - If Income <= 0, returns 0.00% (guards against divide-by-zero or non-positive income).
 * - If Expenses > Income, returns negative percentage (e.g. -25.00%).
 * - If Expenses = 0 and Income > 0, returns 100.00%.
 */
export function calculateSavingsRate(
  income: number,
  expenses: number
): number {
  if (income <= 0) {
    return 0;
  }

  const rate = ((income - expenses) / income) * 100;
  return Math.round((rate + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates Category Budget Utilization given target and actual spent amounts.
 *
 * Utilization % rounded to 1 decimal place.
 * Remaining = Target - Spent.
 * isOverBudget = Spent > Target.
 */
export function calculateBudgetUtilization(
  targetAmount: number,
  spentAmount: number
): BudgetUtilizationResult {
  const roundedTarget = roundMoney(targetAmount);
  const roundedSpent = roundMoney(spentAmount);
  const remaining = roundMoney(roundedTarget - roundedSpent);

  let utilizationPercentage = 0;
  if (roundedTarget > 0) {
    const rawPct = (roundedSpent / roundedTarget) * 100;
    utilizationPercentage = Math.round((rawPct + Number.EPSILON) * 10) / 10;
  }

  return {
    spentAmount: roundedSpent,
    remainingAmount: remaining,
    utilizationPercentage,
    isOverBudget: roundedSpent > roundedTarget,
  };
}
