// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { auth } from "@/server/auth";
import { eq } from "drizzle-orm";
import {
  createAccount,
} from "@/server/finance/account-service";
import {
  createCategory,
} from "@/server/finance/category-service";
import {
  createTransaction,
} from "@/server/finance/transaction-service";
import {
  getFinanceSummary,
  getNetWorthBreakdown,
  InvariantViolationError,
} from "@/server/finance/reports-service";

describe("Phase 4 Plan 04-02: Financial Reports & Summary (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p04_reports@example.com",
    name: "Finance Reports User",
    password: "Password123!",
  };

  let testUserId: string;
  let checkingId: string;
  let savingsId: string;
  let creditCardId: string;
  let salaryCatId: string;
  let rentCatId: string;
  let groceriesCatId: string;

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) {
      console.warn("PostgreSQL not available. Skipping integration test.");
      return;
    }

    // Clean prior runs
    await db.delete(user).where(eq(user.email, testUser.email));

    // Create user via Better Auth
    const authRes = await auth.api.signUpEmail({
      body: {
        email: testUser.email,
        password: testUser.password,
        name: testUser.name,
      },
    });

    if (!authRes || !authRes.user) {
      throw new Error("Failed to create test user via Better Auth");
    }
    testUserId = authRes.user.id;

    // Create 3 accounts: Checking (100k), Savings (500k), Credit Card (50k liability)
    const checking = await createAccount(testUserId, {
      name: "Main Checking",
      accountType: "checking",
      currency: "PKR",
      initialBalance: 100000,
    });
    checkingId = checking.id;

    const savings = await createAccount(testUserId, {
      name: "High Yield Savings",
      accountType: "savings",
      currency: "PKR",
      initialBalance: 500000,
    });
    savingsId = savings.id;

    const cc = await createAccount(testUserId, {
      name: "Rewards Credit Card",
      accountType: "credit_card",
      currency: "PKR",
      initialBalance: 50000,
    });
    creditCardId = cc.id;

    // Create categories
    const salaryCat = await createCategory(testUserId, {
      name: "Employment Salary",
      categoryType: "income",
      icon: "Briefcase",
    });
    salaryCatId = salaryCat.id;

    const rentCat = await createCategory(testUserId, {
      name: "Housing Rent",
      categoryType: "expense",
      icon: "Home",
    });
    rentCatId = rentCat.id;

    const groceriesCat = await createCategory(testUserId, {
      name: "Monthly Groceries",
      categoryType: "expense",
      icon: "ShoppingCart",
    });
    groceriesCatId = groceriesCat.id;
  });

  afterAll(async () => {
    if (probe.isAvailable) {
      await db.delete(user).where(eq(user.email, testUser.email));
      await closeDatabase();
    }
  });

  it("1. Accurately calculates Net Worth breakdown with assets and liabilities", async () => {
    if (!probe.isAvailable) return;

    const breakdown = await getNetWorthBreakdown(testUserId);

    expect(breakdown.totalAssets).toBe(600000); // 100,000 + 500,000
    expect(breakdown.totalLiabilities).toBe(50000); // 50,000 CC debt
    expect(breakdown.netWorth).toBe(550000); // 600,000 - 50,000
    expect(breakdown.accounts.length).toBe(3);
  });

  it("2. Accurately calculates Monthly Cash Flow, Savings Rate, and Category Breakdown for target month", async () => {
    if (!probe.isAvailable) return;

    const targetDate = new Date("2026-09-15T12:00:00Z");

    // Income: 150,000 PKR
    await createTransaction(testUserId, {
      accountId: checkingId,
      categoryId: salaryCatId,
      transactionType: "income",
      amount: 150000,
      currency: "PKR",
      date: targetDate,
      description: "September Paycheck",
    });

    // Expense: 40,000 PKR (Rent)
    await createTransaction(testUserId, {
      accountId: checkingId,
      categoryId: rentCatId,
      transactionType: "expense",
      amount: 40000,
      currency: "PKR",
      date: targetDate,
      description: "September Rent",
    });

    // Expense: 20,000 PKR (Groceries)
    await createTransaction(testUserId, {
      accountId: checkingId,
      categoryId: groceriesCatId,
      transactionType: "expense",
      amount: 20000,
      currency: "PKR",
      date: targetDate,
      description: "Supermarket run",
    });

    // Transfer: 30,000 PKR (Checking -> Savings)
    await createTransaction(testUserId, {
      accountId: checkingId,
      toAccountId: savingsId,
      transactionType: "transfer",
      amount: 30000,
      currency: "PKR",
      date: targetDate,
      description: "Transfer to Savings",
    });

    const summary = await getFinanceSummary(testUserId, "2026-09");

    expect(summary.month).toBe("2026-09");
    expect(summary.totalIncome).toBe(150000);
    expect(summary.totalExpenses).toBe(60000); // Rent 40k + Groceries 20k
    expect(summary.cashFlow).toBe(90000); // 150,000 - 60,000

    // Savings rate: (150,000 - 60,000) / 150,000 * 100 = 60.00%
    expect(summary.savingsRate).toBe(60);

    // Category Spending Breakdown sorted descending
    expect(summary.categorySpendingBreakdown.length).toBe(2);
    expect(summary.categorySpendingBreakdown[0].categoryName).toBe("Housing Rent");
    expect(summary.categorySpendingBreakdown[0].spent).toBe(40000);
    expect(summary.categorySpendingBreakdown[0].percentageOfTotal).toBe(66.7);

    expect(summary.categorySpendingBreakdown[1].categoryName).toBe("Monthly Groceries");
    expect(summary.categorySpendingBreakdown[1].spent).toBe(20000);
    expect(summary.categorySpendingBreakdown[1].percentageOfTotal).toBe(33.3);
  });

  it("3. Verifies transfer did NOT change Net Worth", async () => {
    if (!probe.isAvailable) return;

    // Before transactions: Checking was 100k, Savings was 500k, CC was 50k. Total net worth = 550,000.
    // Income +150k -> Checking becomes 250k.
    // Expense -40k -> Checking becomes 210k.
    // Expense -20k -> Checking becomes 190k.
    // Transfer 30k from Checking to Savings -> Checking becomes 160k, Savings becomes 530k.
    // Total Assets = 160k + 530k = 690k. CC debt = 50k. Net worth = 640k.
    const breakdown = await getNetWorthBreakdown(testUserId);
    expect(breakdown.totalAssets).toBe(690000);
    expect(breakdown.totalLiabilities).toBe(50000);
    expect(breakdown.netWorth).toBe(640000);
  });

  it("4. Enforces strict month temporal isolation", async () => {
    if (!probe.isAvailable) return;

    // Record an income transaction in October 2026
    const octDate = new Date("2026-10-05T10:00:00Z");
    await createTransaction(testUserId, {
      accountId: checkingId,
      categoryId: salaryCatId,
      transactionType: "income",
      amount: 80000,
      currency: "PKR",
      date: octDate,
      description: "October Bonus",
    });

    // September summary should NOT include October's 80,000
    const sepSummary = await getFinanceSummary(testUserId, "2026-09");
    expect(sepSummary.totalIncome).toBe(150000);

    // October summary should reflect only October transactions
    const octSummary = await getFinanceSummary(testUserId, "2026-10");
    expect(octSummary.totalIncome).toBe(80000);
    expect(octSummary.totalExpenses).toBe(0);
    expect(octSummary.cashFlow).toBe(80000);
    expect(octSummary.savingsRate).toBe(100);
  });

  it("5. Rejects invalid month format", async () => {
    if (!probe.isAvailable) return;

    await expect(getFinanceSummary(testUserId, "invalid-month")).rejects.toThrow(
      InvariantViolationError
    );
    await expect(getFinanceSummary(testUserId, "2026-13")).rejects.toThrow(
      InvariantViolationError
    );
  });
});
