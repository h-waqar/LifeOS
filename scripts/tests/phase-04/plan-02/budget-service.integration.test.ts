// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { auth } from "@/server/auth";
import { eq } from "drizzle-orm";
import {
  createAccount,
  listAccounts,
} from "@/server/finance/account-service";
import {
  createCategory,
  listCategories,
} from "@/server/finance/category-service";
import {
  createTransaction,
} from "@/server/finance/transaction-service";
import {
  upsertBudget,
  listBudgetsForMonth,
  copyBudgetsFromPreviousMonth,
  deleteBudget,
  InvariantViolationError,
} from "@/server/finance/budget-service";

describe("Phase 4 Plan 04-02: Category Budgets Service & Spending Aggregation (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p04_budgets@example.com",
    password: "Plan04BudgetsPassword123!",
    name: "Budgets Tester",
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

  it("1. Upserts monthly budget target for a category in YYYY-MM", async () => {
    if (!probe.isAvailable) return;

    const categories = await listCategories(testUserId, { type: "expense" });
    const foodCat = categories.find((c) => c.name === "Food")!;

    const budget = await upsertBudget(testUserId, {
      categoryId: foodCat.id,
      month: "2026-09",
      targetAmount: 30000,
      notes: "Food budget for September 2026",
    });

    expect(budget.id).toBeDefined();
    expect(budget.month).toBe("2026-09");
    expect(budget.targetAmount).toBe("30000.00");
    expect(budget.categoryId).toBe(foodCat.id);

    // Update targetAmount for the same month and category (upsert semantics)
    const updated = await upsertBudget(testUserId, {
      categoryId: foodCat.id,
      month: "2026-09",
      targetAmount: 35000,
    });

    expect(updated.id).toBe(budget.id);
    expect(updated.targetAmount).toBe("35000.00");
  });

  it("2. Aggregates real-time actual spending and calculates utilization", async () => {
    if (!probe.isAvailable) return;

    const account = await createAccount(testUserId, {
      name: "Primary Checking",
      accountType: "checking",
      initialBalance: 100000,
    });

    const categories = await listCategories(testUserId, { type: "expense" });
    const foodCat = categories.find((c) => c.name === "Food")!;

    // Record an expense in September 2026 of 14,000 PKR
    await createTransaction(testUserId, {
      accountId: account.id,
      transactionType: "expense",
      amount: 14000,
      date: new Date("2026-09-10T12:00:00Z"),
      categoryId: foodCat.id,
      payee: "Grocery Store",
    });

    // Record an expense in August 2026 (should NOT count towards September budget)
    await createTransaction(testUserId, {
      accountId: account.id,
      transactionType: "expense",
      amount: 8000,
      date: new Date("2026-08-25T12:00:00Z"),
      categoryId: foodCat.id,
      payee: "Old Store",
    });

    const list = await listBudgetsForMonth(testUserId, "2026-09");
    const foodBudget = list.find((b) => b.categoryId === foodCat.id);

    expect(foodBudget).toBeDefined();
    expect(foodBudget!.targetAmount).toBe(35000);
    expect(foodBudget!.spentAmount).toBe(14000);
    expect(foodBudget!.remainingAmount).toBe(21000);
    expect(foodBudget!.utilizationPercentage).toBe(40.0);
    expect(foodBudget!.isOverBudget).toBe(false);
  });

  it("3. STRICTLY EXCLUDES transfers from category budget spending", async () => {
    if (!probe.isAvailable) return;

    const accounts = await listAccounts(testUserId);
    const checking = accounts[0];
    const savings = await createAccount(testUserId, {
      name: "Reserve Savings",
      accountType: "savings",
      initialBalance: 50000,
    });

    const categories = await listCategories(testUserId, { type: "expense" });
    const foodCat = categories.find((c) => c.name === "Food")!;

    // Create a transfer in September 2026
    await createTransaction(testUserId, {
      accountId: checking.id,
      toAccountId: savings.id,
      transactionType: "transfer",
      amount: 25000,
      date: new Date("2026-09-15T12:00:00Z"),
      description: "Transfer funds to savings",
    });

    // Verify budget spending has not changed (remains 14,000 PKR)
    const list = await listBudgetsForMonth(testUserId, "2026-09");
    const foodBudget = list.find((b) => b.categoryId === foodCat.id);

    expect(foodBudget!.spentAmount).toBe(14000);
  });

  it("4. Copies budget targets from previous month to target month", async () => {
    if (!probe.isAvailable) return;

    const categories = await listCategories(testUserId, { type: "expense" });
    const billsCat = categories.find((c) => c.name === "Bills")!;

    // Set budget for Bills in September 2026
    await upsertBudget(testUserId, {
      categoryId: billsCat.id,
      month: "2026-09",
      targetAmount: 20000,
    });

    // Copy from September 2026 to October 2026
    const result = await copyBudgetsFromPreviousMonth(testUserId, {
      targetMonth: "2026-10",
    });

    // Should copy both Food (35,000) and Bills (20,000)
    expect(result.copiedCount).toBe(2);

    const octBudgets = await listBudgetsForMonth(testUserId, "2026-10");
    expect(octBudgets.length).toBe(2);

    const octFood = octBudgets.find((b) => b.categoryId === categories.find((c) => c.name === "Food")!.id);
    expect(octFood!.targetAmount).toBe(35000);

    const octBills = octBudgets.find((b) => b.categoryId === billsCat.id);
    expect(octBills!.targetAmount).toBe(20000);
  });

  it("5. Rejects non-existent category in budget upsert", async () => {
    if (!probe.isAvailable) return;

    const fakeCatId = crypto.randomUUID();

    await expect(
      upsertBudget(testUserId, {
        categoryId: fakeCatId,
        month: "2026-09",
        targetAmount: 10000,
      })
    ).rejects.toThrow(InvariantViolationError);
  });

  it("6. Deletes a monthly budget", async () => {
    if (!probe.isAvailable) return;

    const octBudgets = await listBudgetsForMonth(testUserId, "2026-10");
    expect(octBudgets.length).toBe(2);

    await deleteBudget(testUserId, octBudgets[0].id);

    const remaining = await listBudgetsForMonth(testUserId, "2026-10");
    expect(remaining.length).toBe(1);
  });
});
