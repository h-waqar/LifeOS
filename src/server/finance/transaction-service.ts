import { eq, and, desc, sql, or, count, ilike, gte, lte, inArray, asc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/server/db";
import {
  financeAccounts,
  financeCategories,
  financeTransactions,
  goals,
  type FinanceTransaction,
} from "@/server/db/schema";
import { createAuditLog } from "@/server/audit";
import { recalculateGoalProgress } from "@/server/goals/service";
import {
  eventBus,
  createDomainEvent,
  type AnyDomainEvent,
} from "@/server/events";
import {
  createTransactionSchema,
  updateTransactionSchema,
  listTransactionsQuerySchema,
  type CreateTransactionInput,
  type UpdateTransactionInput,
  type ListTransactionsQuery,
} from "./validation";
import { NotFoundError, InvariantViolationError } from "./errors";
import { guardFinancialMutation } from "@/server/agents/finance-shield";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Finance Transaction service cannot be initialized in the browser."
  );
}

export { NotFoundError, InvariantViolationError };

export interface EnrichedTransaction extends FinanceTransaction {
  accountName?: string;
  accountType?: string;
  toAccountName?: string | null;
  toAccountType?: string | null;
  categoryName?: string | null;
  categoryIcon?: string | null;
  categoryColor?: string | null;
  goalTitle?: string | null;
}

/**
 * Synchronizes a linked goal's progress by aggregating all transaction amounts.
 */
export async function syncGoalProgress(
  userId: string,
  goalId: string,
  txContext?: any
): Promise<void> {
  const runner = txContext || db;

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

  const totalNumber = parseFloat(totalRow?.total ?? "0");

  await runner
    .update(goals)
    .set({
      currentValue: totalNumber,
      updatedAt: new Date(),
    })
    .where(and(eq(goals.userId, userId), eq(goals.id, goalId)));

  await recalculateGoalProgress(userId, goalId, runner);

  await createAuditLog(
    {
      userId,
      category: "mutation",
      action: "finance.goal.progress_synced",
      status: "success",
      details: {
        goalId,
        aggregatedTotal: totalNumber,
      },
    },
    runner
  );
}

/**
 * Applies balance modification on affected accounts based on transaction type and account types.
 *
 * Coherent Signed Debt Convention:
 * - Asset accounts (checking, savings, investment, cash):
 *     income: balance + amount (cash increases)
 *     expense: balance - amount (cash decreases)
 *     transfer source: balance - amount (funds sent)
 *     transfer dest: balance + amount (funds received)
 * - Liability accounts (credit_card):
 *     income: balance - amount (refund / debt decreases)
 *     expense: balance + amount (charge / debt increases)
 *     transfer source: balance + amount (cash advance / debt increases)
 *     transfer dest: balance - amount (card payment / debt decreases)
 */
async function applyBalanceEffect(
  tx: any,
  userId: string,
  type: "income" | "expense" | "transfer",
  sourceAccount: { id: string; accountType: string },
  destAccount: { id: string; accountType: string } | null | undefined,
  amount: string
): Promise<void> {
  const isSourceCC = sourceAccount.accountType === "credit_card";

  if (type === "income") {
    const op = isSourceCC ? sql`-` : sql`+`;
    await tx
      .update(financeAccounts)
      .set({
        balance: sql`${financeAccounts.balance} ${op} ${amount}::numeric`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(financeAccounts.userId, userId),
          eq(financeAccounts.id, sourceAccount.id)
        )
      );
  } else if (type === "expense") {
    const op = isSourceCC ? sql`+` : sql`-`;
    await tx
      .update(financeAccounts)
      .set({
        balance: sql`${financeAccounts.balance} ${op} ${amount}::numeric`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(financeAccounts.userId, userId),
          eq(financeAccounts.id, sourceAccount.id)
        )
      );
  } else if (type === "transfer" && destAccount) {
    const isDestCC = destAccount.accountType === "credit_card";

    // Source account adjustment
    const sourceOp = isSourceCC ? sql`+` : sql`-`;
    await tx
      .update(financeAccounts)
      .set({
        balance: sql`${financeAccounts.balance} ${sourceOp} ${amount}::numeric`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(financeAccounts.userId, userId),
          eq(financeAccounts.id, sourceAccount.id)
        )
      );

    // Destination account adjustment
    const destOp = isDestCC ? sql`-` : sql`+`;
    await tx
      .update(financeAccounts)
      .set({
        balance: sql`${financeAccounts.balance} ${destOp} ${amount}::numeric`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(financeAccounts.userId, userId),
          eq(financeAccounts.id, destAccount.id)
        )
      );
  }
}

/**
 * Reverses balance modification on affected accounts for transaction edits/deletions.
 * Exactly inverts applyBalanceEffect.
 */
async function reverseBalanceEffect(
  tx: any,
  userId: string,
  type: "income" | "expense" | "transfer",
  sourceAccount: { id: string; accountType: string },
  destAccount: { id: string; accountType: string } | null | undefined,
  amount: string
): Promise<void> {
  const isSourceCC = sourceAccount.accountType === "credit_card";

  if (type === "income") {
    const op = isSourceCC ? sql`+` : sql`-`;
    await tx
      .update(financeAccounts)
      .set({
        balance: sql`${financeAccounts.balance} ${op} ${amount}::numeric`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(financeAccounts.userId, userId),
          eq(financeAccounts.id, sourceAccount.id)
        )
      );
  } else if (type === "expense") {
    const op = isSourceCC ? sql`-` : sql`+`;
    await tx
      .update(financeAccounts)
      .set({
        balance: sql`${financeAccounts.balance} ${op} ${amount}::numeric`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(financeAccounts.userId, userId),
          eq(financeAccounts.id, sourceAccount.id)
        )
      );
  } else if (type === "transfer" && destAccount) {
    const isDestCC = destAccount.accountType === "credit_card";

    // Reverse source account adjustment
    const sourceOp = isSourceCC ? sql`-` : sql`+`;
    await tx
      .update(financeAccounts)
      .set({
        balance: sql`${financeAccounts.balance} ${sourceOp} ${amount}::numeric`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(financeAccounts.userId, userId),
          eq(financeAccounts.id, sourceAccount.id)
        )
      );

    // Reverse destination account adjustment
    const destOp = isDestCC ? sql`+` : sql`-`;
    await tx
      .update(financeAccounts)
      .set({
        balance: sql`${financeAccounts.balance} ${destOp} ${amount}::numeric`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(financeAccounts.userId, userId),
          eq(financeAccounts.id, destAccount.id)
        )
      );
  }
}

/**
 * Creates a financial transaction atomically with balance adjustments.
 */
export async function createTransaction(
  userId: string,
  input: CreateTransactionInput
): Promise<FinanceTransaction> {
  guardFinancialMutation("createTransaction");
  const validated = createTransactionSchema.parse(input);

  const pendingEvents: AnyDomainEvent[] = [];

  const createdTransaction = await db.transaction(async (tx) => {
    (tx as any).__pendingEvents = pendingEvents;
    // 1. Lock accounts deterministically in id ASC order
    const allAccountIds = Array.from(
      new Set(
        [validated.accountId, validated.toAccountId].filter(Boolean) as string[]
      )
    ).sort();

    const lockedAccounts = await tx
      .select()
      .from(financeAccounts)
      .where(
        and(
          eq(financeAccounts.userId, userId),
          inArray(financeAccounts.id, allAccountIds)
        )
      )
      .orderBy(asc(financeAccounts.id))
      .for("update");

    const sourceAccount = lockedAccounts.find((a) => a.id === validated.accountId);
    if (!sourceAccount) {
      throw new InvariantViolationError(
        `Source account not found or does not belong to user: ${validated.accountId}`
      );
    }

    if (sourceAccount.isArchived) {
      throw new InvariantViolationError("Cannot create transaction on an archived account");
    }

    let destAccount: (typeof financeAccounts.$inferSelect) | undefined;
    if (validated.transactionType === "transfer") {
      if (!validated.toAccountId) {
        throw new InvariantViolationError(
          "Transfer requires a destination account"
        );
      }
      destAccount = lockedAccounts.find((a) => a.id === validated.toAccountId);
      if (!destAccount) {
        throw new InvariantViolationError(
          `Destination account not found or does not belong to user: ${validated.toAccountId}`
        );
      }
      if (destAccount.isArchived) {
        throw new InvariantViolationError("Cannot transfer to an archived destination account");
      }
    }

    // 2. Verify category ownership and type match if provided
    if (validated.categoryId) {
      const [category] = await tx
        .select()
        .from(financeCategories)
        .where(
          and(
            eq(financeCategories.userId, userId),
            eq(financeCategories.id, validated.categoryId)
          )
        )
        .limit(1);

      if (!category) {
        throw new InvariantViolationError(
          `Category not found or does not belong to user: ${validated.categoryId}`
        );
      }

      if (category.categoryType !== validated.transactionType) {
        throw new InvariantViolationError(
          `Category type '${category.categoryType}' does not match transaction type '${validated.transactionType}'`
        );
      }
    }

    // 3. Verify goal ownership and area = 'finance' if provided
    if (validated.goalId) {
      const [goal] = await tx
        .select()
        .from(goals)
        .where(
          and(eq(goals.userId, userId), eq(goals.id, validated.goalId))
        )
        .limit(1);

      if (!goal) {
        throw new InvariantViolationError(
          `Goal not found or does not belong to user: ${validated.goalId}`
        );
      }

      if (goal.area !== "finance") {
        throw new InvariantViolationError(
          `Financial transactions may only link to goals in the 'finance' area. Found area: '${goal.area}'`
        );
      }
    }

    // 4. Insert transaction record
    const [created] = await tx
      .insert(financeTransactions)
      .values({
        userId,
        accountId: validated.accountId,
        toAccountId:
          validated.transactionType === "transfer"
            ? validated.toAccountId
            : null,
        transactionType: validated.transactionType,
        amount: validated.amount,
        currency: validated.currency,
        date: validated.date,
        categoryId: validated.categoryId ?? null,
        payee: validated.payee ?? null,
        description: validated.description ?? null,
        goalId: validated.goalId ?? null,
        tags: validated.tags ?? [],
      })
      .returning();

    // 5. Apply atomic balance effect
    await applyBalanceEffect(
      tx,
      userId,
      validated.transactionType,
      sourceAccount,
      destAccount,
      validated.amount
    );

    // 6. Sync goal progress if linked
    if (validated.goalId) {
      await syncGoalProgress(userId, validated.goalId, tx);
    }

    // 7. Audit log
    await createAuditLog(
      {
        userId,
        category: "mutation",
        action: "finance.transaction.created",
        status: "success",
        details: {
          transactionId: created.id,
          type: created.transactionType,
          amount: created.amount,
          accountId: created.accountId,
          toAccountId: created.toAccountId,
          goalId: created.goalId,
        },
      },
      tx
    );

    pendingEvents.push(
      createDomainEvent("finance.transaction_created", userId, {
        transaction: created,
      })
    );

    return created;
  });

  for (const event of pendingEvents) {
    void eventBus.publish(event);
  }

  return createdTransaction;
}

/**
 * Lists transactions with search, filters, pagination, and joined metadata.
 */
export async function listTransactions(
  userId: string,
  query?: ListTransactionsQuery
): Promise<{ transactions: EnrichedTransaction[]; total: number }> {
  const validated = listTransactionsQuerySchema.parse(query ?? {});

  const toAccounts = alias(financeAccounts, "to_accounts");

  const conditions = [eq(financeTransactions.userId, userId)];

  if (validated.accountId) {
    conditions.push(
      or(
        eq(financeTransactions.accountId, validated.accountId),
        eq(financeTransactions.toAccountId, validated.accountId)
      )!
    );
  }

  if (validated.categoryId) {
    conditions.push(eq(financeTransactions.categoryId, validated.categoryId));
  }

  if (validated.transactionType) {
    conditions.push(
      eq(financeTransactions.transactionType, validated.transactionType)
    );
  }

  if (validated.startDate) {
    conditions.push(
      gte(financeTransactions.date, new Date(validated.startDate))
    );
  }

  if (validated.endDate) {
    // Include end of day
    const end = new Date(validated.endDate);
    if (!validated.endDate.includes("T")) {
      end.setHours(23, 59, 59, 999);
    }
    conditions.push(lte(financeTransactions.date, end));
  }

  if (validated.search) {
    const term = `%${validated.search.trim()}%`;
    conditions.push(
      or(
        ilike(financeTransactions.payee, term),
        ilike(financeTransactions.description, term)
      )!
    );
  }

  const whereClause = and(...conditions);

  // Total count
  const [{ count: totalCount }] = await db
    .select({ count: count() })
    .from(financeTransactions)
    .where(whereClause);

  // Rows with joined metadata
  const rows = await db
    .select({
      transaction: financeTransactions,
      accountName: financeAccounts.name,
      accountType: financeAccounts.accountType,
      toAccountName: toAccounts.name,
      toAccountType: toAccounts.accountType,
      categoryName: financeCategories.name,
      categoryIcon: financeCategories.icon,
      categoryColor: financeCategories.color,
      goalTitle: goals.title,
    })
    .from(financeTransactions)
    .leftJoin(
      financeAccounts,
      eq(financeTransactions.accountId, financeAccounts.id)
    )
    .leftJoin(
      toAccounts,
      eq(financeTransactions.toAccountId, toAccounts.id)
    )
    .leftJoin(
      financeCategories,
      eq(financeTransactions.categoryId, financeCategories.id)
    )
    .leftJoin(goals, eq(financeTransactions.goalId, goals.id))
    .where(whereClause)
    .orderBy(
      desc(financeTransactions.date),
      desc(financeTransactions.createdAt)
    )
    .limit(validated.limit)
    .offset(validated.offset);

  const enriched: EnrichedTransaction[] = rows.map((r) => ({
    ...r.transaction,
    accountName: r.accountName ?? undefined,
    accountType: r.accountType ?? undefined,
    toAccountName: r.toAccountName ?? null,
    toAccountType: r.toAccountType ?? null,
    categoryName: r.categoryName ?? null,
    categoryIcon: r.categoryIcon ?? null,
    categoryColor: r.categoryColor ?? null,
    goalTitle: r.goalTitle ?? null,
  }));

  return {
    transactions: enriched,
    total: Number(totalCount),
  };
}

/**
 * Gets a single transaction by ID.
 */
export async function getTransactionById(
  userId: string,
  transactionId: string
): Promise<FinanceTransaction | null> {
  const [tx] = await db
    .select()
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financeTransactions.id, transactionId)
      )
    )
    .limit(1);

  return tx ?? null;
}

/**
 * Updates a transaction atomically: reverses prior balance effect and applies new effect.
 */
export async function updateTransaction(
  userId: string,
  transactionId: string,
  input: UpdateTransactionInput
): Promise<FinanceTransaction> {
  guardFinancialMutation("updateTransaction");
  const validated = updateTransactionSchema.parse(input);

  return await db.transaction(async (tx) => {
    // 1. Lock existing transaction row FOR UPDATE to prevent race conditions
    const [existing] = await tx
      .select()
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          eq(financeTransactions.id, transactionId)
        )
      )
      .for("update")
      .limit(1);

    if (!existing) {
      throw new NotFoundError(`Transaction not found: ${transactionId}`);
    }

    const newType =
      (validated.transactionType ?? existing.transactionType) as
        | "income"
        | "expense"
        | "transfer";
    const newAccountId = validated.accountId ?? existing.accountId;
    let newToAccountId =
      validated.toAccountId !== undefined
        ? validated.toAccountId
        : existing.toAccountId;
    if (newType !== "transfer") {
      newToAccountId = null;
    }
    const newAmount = validated.amount ?? existing.amount;

    // 2. Lock all involved accounts deterministically in id ASC order FOR UPDATE
    const allAccountIds = Array.from(
      new Set(
        [
          existing.accountId,
          existing.toAccountId,
          newAccountId,
          newToAccountId,
        ].filter(Boolean) as string[]
      )
    ).sort();

    const lockedAccounts = await tx
      .select()
      .from(financeAccounts)
      .where(
        and(
          eq(financeAccounts.userId, userId),
          inArray(financeAccounts.id, allAccountIds)
        )
      )
      .orderBy(asc(financeAccounts.id))
      .for("update");

    const oldSourceAccount = lockedAccounts.find((a) => a.id === existing.accountId);
    const oldDestAccount = existing.toAccountId
      ? lockedAccounts.find((a) => a.id === existing.toAccountId)
      : undefined;

    const newSourceAccount = lockedAccounts.find((a) => a.id === newAccountId);
    if (!newSourceAccount) {
      throw new InvariantViolationError(
        `Source account not found or does not belong to user: ${newAccountId}`
      );
    }
    if (newSourceAccount.isArchived) {
      throw new InvariantViolationError("Cannot assign transaction to an archived account");
    }

    let newDestAccount: (typeof financeAccounts.$inferSelect) | undefined;
    if (newType === "transfer") {
      if (!newToAccountId) {
        throw new InvariantViolationError(
          "Transfer requires a destination account"
        );
      }
      if (newToAccountId === newAccountId) {
        throw new InvariantViolationError(
          "Transfer destination cannot be the same as source account"
        );
      }
      newDestAccount = lockedAccounts.find((a) => a.id === newToAccountId);
      if (!newDestAccount) {
        throw new InvariantViolationError(
          `Destination account not found or does not belong to user: ${newToAccountId}`
        );
      }
      if (newDestAccount.isArchived) {
        throw new InvariantViolationError("Cannot transfer to an archived destination account");
      }
    }

    // 3. Verify category ownership and type match if provided or retained
    const finalCategoryId =
      validated.categoryId !== undefined
        ? validated.categoryId
        : existing.categoryId;

    if (finalCategoryId) {
      const [cat] = await tx
        .select()
        .from(financeCategories)
        .where(
          and(
            eq(financeCategories.userId, userId),
            eq(financeCategories.id, finalCategoryId)
          )
        )
        .limit(1);

      if (!cat) {
        throw new InvariantViolationError(
          `Category not found: ${finalCategoryId}`
        );
      }

      if (cat.categoryType !== newType) {
        throw new InvariantViolationError(
          `Category type '${cat.categoryType}' does not match transaction type '${newType}'`
        );
      }
    }

    // 4. Verify goal ownership and area = 'finance' if provided or retained
    const finalGoalId =
      validated.goalId !== undefined ? validated.goalId : existing.goalId;

    if (finalGoalId) {
      const [goal] = await tx
        .select()
        .from(goals)
        .where(
          and(eq(goals.userId, userId), eq(goals.id, finalGoalId))
        )
        .limit(1);

      if (!goal) {
        throw new InvariantViolationError(
          `Goal not found: ${finalGoalId}`
        );
      }

      if (goal.area !== "finance") {
        throw new InvariantViolationError(
          `Financial transactions may only link to goals in the 'finance' area. Found area: '${goal.area}'`
        );
      }
    }

    if (!oldSourceAccount) {
      throw new InvariantViolationError(
        `Original source account not found: ${existing.accountId}`
      );
    }

    // 5. Reverse existing balance effect
    await reverseBalanceEffect(
      tx,
      userId,
      existing.transactionType as "income" | "expense" | "transfer",
      oldSourceAccount,
      oldDestAccount,
      existing.amount
    );

    // 6. Update database record
    const updatePayload: Partial<typeof financeTransactions.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (validated.accountId !== undefined) updatePayload.accountId = newAccountId;
    if (validated.toAccountId !== undefined || newType !== "transfer")
      updatePayload.toAccountId = newToAccountId;
    if (validated.transactionType !== undefined)
      updatePayload.transactionType = newType;
    if (validated.amount !== undefined) updatePayload.amount = newAmount;
    if (validated.currency !== undefined)
      updatePayload.currency = validated.currency;
    if (validated.date !== undefined) updatePayload.date = validated.date;
    if (validated.categoryId !== undefined)
      updatePayload.categoryId = validated.categoryId ?? null;
    if (validated.payee !== undefined)
      updatePayload.payee = validated.payee ?? null;
    if (validated.description !== undefined)
      updatePayload.description = validated.description ?? null;
    if (validated.goalId !== undefined)
      updatePayload.goalId = validated.goalId ?? null;
    if (validated.tags !== undefined) updatePayload.tags = validated.tags;

    const [updated] = await tx
      .update(financeTransactions)
      .set(updatePayload)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          eq(financeTransactions.id, transactionId)
        )
      )
      .returning();

    // 7. Apply new balance effect
    await applyBalanceEffect(
      tx,
      userId,
      newType,
      newSourceAccount,
      newDestAccount,
      newAmount
    );

    // 8. Goal progress synchronization
    if (existing.goalId && existing.goalId !== updated.goalId) {
      await syncGoalProgress(userId, existing.goalId, tx);
    }
    if (updated.goalId) {
      await syncGoalProgress(userId, updated.goalId, tx);
    }

    // 9. Audit log
    await createAuditLog(
      {
        userId,
        category: "mutation",
        action: "finance.transaction.updated",
        status: "success",
        details: {
          transactionId: updated.id,
          changes: validated,
        },
      },
      tx
    );

    return updated;
  });
}

/**
 * Deletes a transaction atomically and reverses its balance effects.
 * Concurrency-safe: locks transaction and affected accounts FOR UPDATE.
 */
export async function deleteTransaction(
  userId: string,
  transactionId: string
): Promise<void> {
  guardFinancialMutation("deleteTransaction");
  await db.transaction(async (tx) => {
    // 1. Lock transaction row FOR UPDATE to prevent double-deletion/reversal
    const [existing] = await tx
      .select()
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          eq(financeTransactions.id, transactionId)
        )
      )
      .for("update")
      .limit(1);

    if (!existing) {
      throw new NotFoundError(`Transaction not found: ${transactionId}`);
    }

    // 2. Lock affected accounts deterministically in id ASC order FOR UPDATE
    const accountIds = Array.from(
      new Set(
        [existing.accountId, existing.toAccountId].filter(Boolean) as string[]
      )
    ).sort();

    const lockedAccounts = await tx
      .select()
      .from(financeAccounts)
      .where(
        and(
          eq(financeAccounts.userId, userId),
          inArray(financeAccounts.id, accountIds)
        )
      )
      .orderBy(asc(financeAccounts.id))
      .for("update");

    const sourceAccount = lockedAccounts.find((a) => a.id === existing.accountId);
    const destAccount = existing.toAccountId
      ? lockedAccounts.find((a) => a.id === existing.toAccountId)
      : undefined;

    if (!sourceAccount) {
      throw new InvariantViolationError(
        `Source account not found: ${existing.accountId}`
      );
    }
    if (existing.transactionType === "transfer" && !destAccount) {
      throw new InvariantViolationError(
        `Destination account not found: ${existing.toAccountId}`
      );
    }

    // 3. Reverse balance effect
    await reverseBalanceEffect(
      tx,
      userId,
      existing.transactionType as "income" | "expense" | "transfer",
      sourceAccount,
      destAccount,
      existing.amount
    );

    // 4. Delete row
    await tx
      .delete(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          eq(financeTransactions.id, transactionId)
        )
      );

    // 5. Sync goal progress if was linked
    if (existing.goalId) {
      await syncGoalProgress(userId, existing.goalId, tx);
    }

    // 6. Audit log
    await createAuditLog(
      {
        userId,
        category: "mutation",
        action: "finance.transaction.deleted",
        status: "success",
        details: {
          transactionId: existing.id,
          type: existing.transactionType,
          amount: existing.amount,
          accountId: existing.accountId,
          toAccountId: existing.toAccountId,
          goalId: existing.goalId,
        },
      },
      tx
    );
  });
}
