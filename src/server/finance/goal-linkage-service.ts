import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  goals,
  financeTransactions,
  type Goal,
} from "@/server/db/schema";
import { createAuditLog } from "@/server/audit";
import { recalculateGoalProgress } from "@/server/goals/service";
import { NotFoundError, InvariantViolationError } from "./errors";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Financial Goal Linkage service cannot be initialized in the browser."
  );
}

export { NotFoundError, InvariantViolationError };

export interface FinancialGoalSummary {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  metricType: string;
  targetValue: number | null;
  currentValue: number;
  progress: number;
  unit?: string | null;
  targetDate?: Date | null;
  recentTransactions: Array<{
    id: string;
    amount: string;
    currency: string;
    date: Date;
    description?: string | null;
    payee?: string | null;
  }>;
}

/**
 * Synchronizes financial goal progress from linked transactions and triggers Phase 2 progress rollup.
 */
export async function syncFinancialGoalProgress(
  userId: string,
  goalId: string,
  txContext?: any
): Promise<void> {
  const runner = txContext || db;

  // 1. Verify goal exists and belongs to user
  const [goal] = await runner
    .select()
    .from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.id, goalId)))
    .limit(1);

  if (!goal) {
    throw new NotFoundError(`Goal not found: ${goalId}`);
  }

  if (goal.area !== "finance") {
    throw new InvariantViolationError(
      `Financial goal progress can only be synced for goals in the 'finance' area. Found: '${goal.area}'`
    );
  }

  // 2. Aggregate transaction contributions
  const [totalRow] = await runner
    .select({
      total: sql<string>`coalesce(sum(${financeTransactions.amount}), 0)`,
    })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financeTransactions.goalId, goalId)
      )
    );

  const totalContributed = parseFloat(totalRow?.total ?? "0");

  // 3. Update goal currentValue
  await runner
    .update(goals)
    .set({
      currentValue: totalContributed,
      updatedAt: new Date(),
    })
    .where(and(eq(goals.userId, userId), eq(goals.id, goalId)));

  // 4. Cascade recalculate progress via Phase 2 engine
  await recalculateGoalProgress(userId, goalId, runner);

  // 5. Emit audit log
  await createAuditLog(
    {
      userId,
      category: "mutation",
      action: "finance.goal.progress_synced",
      status: "success",
      details: {
        goalId,
        aggregatedTotal: totalContributed,
      },
    },
    runner
  );
}

/**
 * Lists all financial goals (area = 'finance') for the user with contribution summaries and recent transactions.
 */
export async function listFinancialGoals(
  userId: string
): Promise<FinancialGoalSummary[]> {
  const goalRows = await db
    .select()
    .from(goals)
    .where(
      and(
        eq(goals.userId, userId),
        eq(goals.area, "finance")
      )
    )
    .orderBy(desc(goals.createdAt));

  const summaries: FinancialGoalSummary[] = [];

  for (const g of goalRows) {
    const txs = await db
      .select({
        id: financeTransactions.id,
        amount: financeTransactions.amount,
        currency: financeTransactions.currency,
        date: financeTransactions.date,
        description: financeTransactions.description,
        payee: financeTransactions.payee,
      })
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          eq(financeTransactions.goalId, g.id)
        )
      )
      .orderBy(desc(financeTransactions.date))
      .limit(5);

    summaries.push({
      id: g.id,
      title: g.title,
      description: g.description,
      status: g.status,
      priority: g.priority,
      metricType: g.metricType,
      targetValue: g.targetValue,
      currentValue: g.currentValue ?? 0,
      progress: g.progress,
      unit: g.unit,
      targetDate: g.targetDate,
      recentTransactions: txs,
    });
  }

  return summaries;
}
