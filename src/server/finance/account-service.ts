import { eq, and, asc, or, count } from "drizzle-orm";
import { db } from "@/server/db";
import {
  financeAccounts,
  financeTransactions,
  type FinanceAccount,
} from "@/server/db/schema";
import { createAuditLog } from "@/server/audit";
import {
  createAccountSchema,
  updateAccountSchema,
  type CreateAccountInput,
  type UpdateAccountInput,
} from "./validation";
import { NotFoundError, InvariantViolationError } from "./errors";
import { guardFinancialMutation } from "@/server/agents/finance-shield";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Finance Account service cannot be initialized in the browser."
  );
}

export { NotFoundError, InvariantViolationError };

/**
 * Creates a new financial account.
 * Initial balance sets both initialBalance and current balance.
 */
export async function createAccount(
  userId: string,
  input: CreateAccountInput
): Promise<FinanceAccount> {
  guardFinancialMutation("createAccount");
  const validated = createAccountSchema.parse(input);

  const [created] = await db
    .insert(financeAccounts)
    .values({
      userId,
      name: validated.name,
      accountType: validated.accountType,
      currency: validated.currency,
      initialBalance: validated.initialBalance,
      balance: validated.initialBalance,
      color: validated.color ?? null,
      icon: validated.icon ?? null,
      isArchived: false,
    })
    .returning();

  await createAuditLog({
    userId,
    category: "mutation",
    action: "finance.account.created",
    status: "success",
    details: {
      accountId: created.id,
      name: created.name,
      accountType: created.accountType,
      currency: created.currency,
      initialBalance: created.initialBalance,
      balance: created.balance,
    },
  });

  return created;
}

/**
 * Lists accounts owned by the user.
 * Ordered by isArchived ASC, createdAt ASC.
 */
export async function listAccounts(
  userId: string,
  options?: { includeArchived?: boolean }
): Promise<FinanceAccount[]> {
  const includeArchived = options?.includeArchived ?? false;

  const conditions = [eq(financeAccounts.userId, userId)];
  if (!includeArchived) {
    conditions.push(eq(financeAccounts.isArchived, false));
  }

  const rows = await db
    .select()
    .from(financeAccounts)
    .where(and(...conditions))
    .orderBy(asc(financeAccounts.isArchived), asc(financeAccounts.createdAt));

  return rows;
}

/**
 * Fetches an account by ID ensuring user ownership.
 */
export async function getAccountById(
  userId: string,
  accountId: string
): Promise<FinanceAccount | null> {
  const [account] = await db
    .select()
    .from(financeAccounts)
    .where(
      and(
        eq(financeAccounts.userId, userId),
        eq(financeAccounts.id, accountId)
      )
    )
    .limit(1);

  return account ?? null;
}

/**
 * Updates an account's mutable metadata (name, type, color, icon, isArchived).
 */
export async function updateAccount(
  userId: string,
  accountId: string,
  input: UpdateAccountInput
): Promise<FinanceAccount> {
  guardFinancialMutation("updateAccount");
  const validated = updateAccountSchema.parse(input);

  const existing = await getAccountById(userId, accountId);
  if (!existing) {
    throw new NotFoundError(`Account not found: ${accountId}`);
  }

  const updatePayload: Partial<typeof financeAccounts.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (validated.name !== undefined) updatePayload.name = validated.name;
  if (validated.accountType !== undefined)
    updatePayload.accountType = validated.accountType;
  if (validated.color !== undefined) updatePayload.color = validated.color;
  if (validated.icon !== undefined) updatePayload.icon = validated.icon;
  if (validated.isArchived !== undefined)
    updatePayload.isArchived = validated.isArchived;

  const [updated] = await db
    .update(financeAccounts)
    .set(updatePayload)
    .where(
      and(
        eq(financeAccounts.userId, userId),
        eq(financeAccounts.id, accountId)
      )
    )
    .returning();

  await createAuditLog({
    userId,
    category: "mutation",
    action: "finance.account.updated",
    status: "success",
    details: {
      accountId: updated.id,
      changes: validated,
    },
  });

  return updated;
}

/**
 * Soft-archives an account.
 */
export async function archiveAccount(
  userId: string,
  accountId: string
): Promise<FinanceAccount> {
  guardFinancialMutation("archiveAccount");
  return updateAccount(userId, accountId, { isArchived: true });
}

/**
 * Deletes an account only if zero transactions reference it.
 * Otherwise throws an InvariantViolationError recommending archival.
 */
export async function deleteAccount(
  userId: string,
  accountId: string
): Promise<void> {
  guardFinancialMutation("deleteAccount");
  const existing = await getAccountById(userId, accountId);
  if (!existing) {
    throw new NotFoundError(`Account not found: ${accountId}`);
  }

  const [{ count: txCount }] = await db
    .select({ count: count() })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        or(
          eq(financeTransactions.accountId, accountId),
          eq(financeTransactions.toAccountId, accountId)
        )
      )
    );

  if (Number(txCount) > 0) {
    throw new InvariantViolationError(
      "Cannot delete account with existing transactions. Please archive it instead."
    );
  }

  await db
    .delete(financeAccounts)
    .where(
      and(
        eq(financeAccounts.userId, userId),
        eq(financeAccounts.id, accountId)
      )
    );

  await createAuditLog({
    userId,
    category: "mutation",
    action: "finance.account.deleted",
    status: "success",
    details: {
      accountId,
      accountName: existing.name,
    },
  });
}
