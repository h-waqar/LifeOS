// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import {
  financeAccounts,
  financeCategories,
  financeTransactions,
} from "@/server/db/schema";
import { auth } from "@/server/auth";
import { eq } from "drizzle-orm";

describe("Phase 4 Plan 04-01: Finance Schema Isolation & Database Invariants (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p04_finance_isolation@example.com",
    password: "Plan04PasswordFinance123!",
    name: "Finance Isolation Tester",
  };

  let testUserId: string;

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    await db.delete(user);

    const res = await auth.api.signUpEmail({
      body: testUser,
      asResponse: true,
    });
    expect(res.status).toBe(200);

    const [u] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testUser.email));
    testUserId = u.id;
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await db.delete(user);
      await closeDatabase();
    }
  });

  it("1. Enforces single_user_lock database invariant preventing unauthorized multi-tenancy", async () => {
    if (!probe.isAvailable) return;

    await expect(
      db.insert(user).values({
        id: "rogue_finance_user_" + crypto.randomUUID().slice(0, 8),
        email: "rogue_finance@example.com",
        name: "Rogue Finance User",
      })
    ).rejects.toThrow();
  });

  it("2. Rejects creating financial account for non-existent user via foreign key (user_id)", async () => {
    if (!probe.isAvailable) return;

    const fakeUserId = "fake_user_" + crypto.randomUUID().slice(0, 8);

    await expect(
      db.insert(financeAccounts).values({
        userId: fakeUserId,
        name: "Ghost Checking",
        accountType: "checking",
      })
    ).rejects.toThrow();
  });

  it("3. Creates valid accounts across all 5 supported types for authenticated user", async () => {
    if (!probe.isAvailable) return;

    const types = ["checking", "savings", "investment", "credit_card", "cash"] as const;

    for (const t of types) {
      const [acc] = await db
        .insert(financeAccounts)
        .values({
          userId: testUserId,
          name: `Test ${t} Account`,
          accountType: t,
          currency: "PKR",
          initialBalance: "50000.00",
          balance: "50000.00",
        })
        .returning();

      expect(acc).toBeDefined();
      expect(acc.accountType).toBe(t);
      expect(acc.userId).toBe(testUserId);
      expect(acc.currency).toBe("PKR");
      expect(acc.initialBalance).toBe("50000.00");
    }
  });

  it("4. Enforces check constraint: account name cannot be empty or whitespace only", async () => {
    if (!probe.isAvailable) return;

    await expect(
      db.insert(financeAccounts).values({
        userId: testUserId,
        name: "   ",
        accountType: "checking",
      })
    ).rejects.toThrow();
  });

  it("5. Enforces check constraint: account type must be one of the 5 allowed enums", async () => {
    if (!probe.isAvailable) return;

    await expect(
      db.insert(financeAccounts).values({
        userId: testUserId,
        name: "Bitcoin Wallet",
        accountType: "crypto" as any,
      })
    ).rejects.toThrow();
  });

  it("6. Rejects transaction with non-existent accountId via composite FK (user_id, account_id)", async () => {
    if (!probe.isAvailable) return;

    const fakeAccountId = crypto.randomUUID();

    await expect(
      db.insert(financeTransactions).values({
        userId: testUserId,
        accountId: fakeAccountId,
        transactionType: "expense",
        amount: "1000.00",
        date: new Date(),
      })
    ).rejects.toThrow();
  });

  it("7. Rejects transfer with non-existent toAccountId via composite FK (user_id, to_account_id)", async () => {
    if (!probe.isAvailable) return;

    const [realAccount] = await db
      .select({ id: financeAccounts.id })
      .from(financeAccounts)
      .where(eq(financeAccounts.userId, testUserId))
      .limit(1);

    const fakeAccountId = crypto.randomUUID();

    await expect(
      db.insert(financeTransactions).values({
        userId: testUserId,
        accountId: realAccount.id,
        toAccountId: fakeAccountId,
        transactionType: "transfer",
        amount: "500.00",
        date: new Date(),
      })
    ).rejects.toThrow();
  });

  it("8. Rejects transaction with amount <= 0 via check constraint", async () => {
    if (!probe.isAvailable) return;

    const [realAccount] = await db
      .select({ id: financeAccounts.id })
      .from(financeAccounts)
      .where(eq(financeAccounts.userId, testUserId))
      .limit(1);

    await expect(
      db.insert(financeTransactions).values({
        userId: testUserId,
        accountId: realAccount.id,
        transactionType: "income",
        amount: "0.00",
        date: new Date(),
      })
    ).rejects.toThrow();

    await expect(
      db.insert(financeTransactions).values({
        userId: testUserId,
        accountId: realAccount.id,
        transactionType: "income",
        amount: "-100.00",
        date: new Date(),
      })
    ).rejects.toThrow();
  });

  it("9. Enforces transfer check constraint: transfer requires distinct toAccountId", async () => {
    if (!probe.isAvailable) return;

    const [realAccount] = await db
      .select({ id: financeAccounts.id })
      .from(financeAccounts)
      .where(eq(financeAccounts.userId, testUserId))
      .limit(1);

    // Transfer without toAccountId
    await expect(
      db.insert(financeTransactions).values({
        userId: testUserId,
        accountId: realAccount.id,
        toAccountId: null,
        transactionType: "transfer",
        amount: "500.00",
        date: new Date(),
      })
    ).rejects.toThrow();

    // Transfer with same accountId and toAccountId
    await expect(
      db.insert(financeTransactions).values({
        userId: testUserId,
        accountId: realAccount.id,
        toAccountId: realAccount.id,
        transactionType: "transfer",
        amount: "500.00",
        date: new Date(),
      })
    ).rejects.toThrow();
  });

  it("10. Enforces non-transfer invariant: income and expense must not have toAccountId", async () => {
    if (!probe.isAvailable) return;

    const accounts = await db
      .select({ id: financeAccounts.id })
      .from(financeAccounts)
      .where(eq(financeAccounts.userId, testUserId))
      .limit(2);

    await expect(
      db.insert(financeTransactions).values({
        userId: testUserId,
        accountId: accounts[0].id,
        toAccountId: accounts[1].id,
        transactionType: "expense",
        amount: "250.00",
        date: new Date(),
      })
    ).rejects.toThrow();
  });

  it("11. Enforces database-level RESTRICT invariant preventing account deletion when transactions exist", async () => {
    if (!probe.isAvailable) return;

    const [tempAccount] = await db
      .insert(financeAccounts)
      .values({
        userId: testUserId,
        name: "Temporary Account for Restrict Test",
        accountType: "cash",
        initialBalance: "100.00",
        balance: "100.00",
      })
      .returning();

    const [tx] = await db
      .insert(financeTransactions)
      .values({
        userId: testUserId,
        accountId: tempAccount.id,
        transactionType: "income",
        amount: "50.00",
        date: new Date(),
      })
      .returning();

    expect(tx.id).toBeDefined();

    // Directly deleting the account in PostgreSQL must fail due to ON DELETE RESTRICT foreign key
    await expect(
      db
        .delete(financeAccounts)
        .where(eq(financeAccounts.id, tempAccount.id))
    ).rejects.toThrow();

    // Clean up transaction first, then delete account succeeds
    await db
      .delete(financeTransactions)
      .where(eq(financeTransactions.id, tx.id));

    await expect(
      db
        .delete(financeAccounts)
        .where(eq(financeAccounts.id, tempAccount.id))
    ).resolves.not.toThrow();
  });
});
