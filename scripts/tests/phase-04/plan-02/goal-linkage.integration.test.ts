// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { goals } from "@/server/db/schema/goals";
import { auth } from "@/server/auth";
import { eq, and } from "drizzle-orm";
import {
  createAccount,
} from "@/server/finance/account-service";
import {
  createCategory,
} from "@/server/finance/category-service";
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from "@/server/finance/transaction-service";
import {
  syncFinancialGoalProgress,
  listFinancialGoals,
} from "@/server/finance/goal-linkage-service";
import { InvariantViolationError } from "@/server/finance/errors";

describe("Phase 4 Plan 04-02: Financial Goal Linkage & Progress Rollup (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p04_goals@example.com",
    name: "Finance Goal User",
    password: "Password123!",
  };

  let testUserId: string;
  let testAccountId: string;
  let testCategoryId: string;
  let testGoalId: string;

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) {
      console.warn("PostgreSQL not available. Skipping integration test.");
      return;
    }

    // Clean any prior run
    await db.delete(user);

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

    // Create a checking account
    const account = await createAccount(testUserId, {
      name: "Goal Savings Checking",
      accountType: "checking",
      currency: "PKR",
      initialBalance: 500000,
    });
    testAccountId = account.id;

    // Create an income category
    const cat = await createCategory(testUserId, {
      name: "Emergency Fund Allocation",
      categoryType: "income",
      icon: "Shield",
    });
    testCategoryId = cat.id;

    // Insert a financial goal in goals table
    const [insertedGoal] = await db
      .insert(goals)
      .values({
        userId: testUserId,
        title: "Emergency Fund (100k PKR)",
        area: "finance",
        horizon: "short_term",
        metricType: "currency",
        targetValue: 100000,
        currentValue: 0,
        progress: 0,
        status: "in_progress",
      })
      .returning();
    testGoalId = insertedGoal.id;
  });

  afterAll(async () => {
    if (probe.isAvailable) {
      await db.delete(user);
      await closeDatabase();
    }
  });

  it("1. Verifies initial goal state (0 currentValue and 0% progress)", async () => {
    if (!probe.isAvailable) return;

    const [goal] = await db
      .select()
      .from(goals)
      .where(and(eq(goals.userId, testUserId), eq(goals.id, testGoalId)));

    expect(goal).toBeDefined();
    expect(goal.currentValue).toBe(0);
    expect(goal.progress).toBe(0);
  });

  it("2. Creating transaction with goalId automatically synchronizes goal currentValue and progress", async () => {
    if (!probe.isAvailable) return;

    // Create first transaction of 25,000 PKR linked to goal
    const tx1 = await createTransaction(testUserId, {
      accountId: testAccountId,
      categoryId: testCategoryId,
      goalId: testGoalId,
      transactionType: "income",
      amount: 25000,
      currency: "PKR",
      date: new Date(),
      description: "First deposit to emergency fund",
    });

    expect(tx1.goalId).toBe(testGoalId);

    // Verify goal progress updated
    const [goal] = await db
      .select()
      .from(goals)
      .where(and(eq(goals.userId, testUserId), eq(goals.id, testGoalId)));

    expect(goal.currentValue).toBe(25000);
    expect(goal.progress).toBe(25); // 25,000 / 100,000 = 25%
  });

  it("3. Adding second transaction rolls up cumulative goal progress to 100%", async () => {
    if (!probe.isAvailable) return;

    // Create second transaction of 75,000 PKR linked to goal
    await createTransaction(testUserId, {
      accountId: testAccountId,
      categoryId: testCategoryId,
      goalId: testGoalId,
      transactionType: "income",
      amount: 75000,
      currency: "PKR",
      date: new Date(),
      description: "Second deposit completing fund",
    });

    const [goal] = await db
      .select()
      .from(goals)
      .where(and(eq(goals.userId, testUserId), eq(goals.id, testGoalId)));

    expect(goal.currentValue).toBe(100000);
    expect(goal.progress).toBe(100); // 100,000 / 100,000 = 100%
  });

  it("4. Editing transaction amount automatically recalculates goal progress", async () => {
    if (!probe.isAvailable) return;

    // Query the transactions
    const financialGoals = await listFinancialGoals(testUserId);
    expect(financialGoals.length).toBeGreaterThan(0);
    const goalSummary = financialGoals.find((g) => g.id === testGoalId)!;
    expect(goalSummary).toBeDefined();
    expect(goalSummary.recentTransactions.length).toBe(2);

    const txToEdit = goalSummary.recentTransactions[0]; // the 75k one or 25k one

    // Edit amount to 50,000
    await updateTransaction(testUserId, txToEdit.id, {
      amount: 50000,
    });

    const [goal] = await db
      .select()
      .from(goals)
      .where(and(eq(goals.userId, testUserId), eq(goals.id, testGoalId)));

    // Total should now be 25,000 + 50,000 = 75,000
    expect(goal.currentValue).toBe(75000);
    expect(goal.progress).toBe(75);
  });

  it("5. Deleting a transaction rolls back goal progress dynamically", async () => {
    if (!probe.isAvailable) return;

    const financialGoals = await listFinancialGoals(testUserId);
    const goalSummary = financialGoals.find((g) => g.id === testGoalId)!;
    const txToDelete = goalSummary.recentTransactions[0];

    await deleteTransaction(testUserId, txToDelete.id);

    const [goal] = await db
      .select()
      .from(goals)
      .where(and(eq(goals.userId, testUserId), eq(goals.id, testGoalId)));

    // Either 25,000 or 50,000 remains depending on which was deleted
    expect(goal.currentValue).toBeGreaterThan(0);
    expect(goal.currentValue).toBeLessThan(75000);
    expect(goal.progress).toBe(goal.currentValue! / 1000); // % of 100,000
  });

  it("6. Rejects linking a transaction to a non-existent goal", async () => {
    if (!probe.isAvailable) return;

    const fakeGoalId = "00000000-0000-0000-0000-000000000000";

    await expect(
      createTransaction(testUserId, {
        accountId: testAccountId,
        categoryId: testCategoryId,
        goalId: fakeGoalId,
        transactionType: "income",
        amount: 5000,
        currency: "PKR",
        date: new Date(),
        description: "Invalid goal tx",
      })
    ).rejects.toThrow();
  });

  it("7. listFinancialGoals retrieves goals with correct metadata and recent transaction details", async () => {
    if (!probe.isAvailable) return;

    const list = await listFinancialGoals(testUserId);
    expect(list).toBeInstanceOf(Array);
    const targetGoal = list.find((g) => g.id === testGoalId);
    expect(targetGoal).toBeDefined();
    expect(targetGoal?.title).toBe("Emergency Fund (100k PKR)");
    expect(targetGoal?.metricType).toBe("currency");
    expect(targetGoal?.targetValue).toBe(100000);
    expect(targetGoal?.recentTransactions.length).toBeGreaterThanOrEqual(1);
    expect(targetGoal?.recentTransactions[0].currency).toBe("PKR");
  });

  it("8. P1-2 Finance Goal Boundary: Rejects linking transactions to non-finance goals", async () => {
    if (!probe.isAvailable) return;

    // Create non-finance goals (health, career, relationships)
    const [healthGoal] = await db
      .insert(goals)
      .values({
        userId: testUserId,
        title: "Run 5km Daily",
        area: "health",
        metricType: "numeric",
        targetValue: 5,
        currentValue: 0,
        progress: 0,
        status: "in_progress",
      })
      .returning();

    const [careerGoal] = await db
      .insert(goals)
      .values({
        userId: testUserId,
        title: "Deliver Q3 Roadmap",
        area: "career",
        metricType: "boolean",
        targetValue: 1,
        currentValue: 0,
        progress: 0,
        status: "in_progress",
      })
      .returning();

    const [relGoal] = await db
      .insert(goals)
      .values({
        userId: testUserId,
        title: "Call Parents Weekly",
        area: "relationships",
        metricType: "numeric",
        targetValue: 52,
        currentValue: 0,
        progress: 0,
        status: "in_progress",
      })
      .returning();

    // 1. Linking to health goal must be rejected
    await expect(
      createTransaction(testUserId, {
        accountId: testAccountId,
        categoryId: testCategoryId,
        goalId: healthGoal.id,
        transactionType: "income",
        amount: 1000,
        date: new Date(),
      })
    ).rejects.toThrow(InvariantViolationError);

    // 2. Linking to career goal must be rejected
    await expect(
      createTransaction(testUserId, {
        accountId: testAccountId,
        categoryId: testCategoryId,
        goalId: careerGoal.id,
        transactionType: "income",
        amount: 1000,
        date: new Date(),
      })
    ).rejects.toThrow(InvariantViolationError);

    // 3. Linking to relationships goal must be rejected
    await expect(
      createTransaction(testUserId, {
        accountId: testAccountId,
        categoryId: testCategoryId,
        goalId: relGoal.id,
        transactionType: "income",
        amount: 1000,
        date: new Date(),
      })
    ).rejects.toThrow(InvariantViolationError);

    // 4. Updating an existing transaction to link to health goal must be rejected
    const validTx = await createTransaction(testUserId, {
      accountId: testAccountId,
      categoryId: testCategoryId,
      goalId: testGoalId, // finance goal
      transactionType: "income",
      amount: 500,
      date: new Date(),
    });

    await expect(
      updateTransaction(testUserId, validTx.id, {
        goalId: healthGoal.id,
      })
    ).rejects.toThrow(InvariantViolationError);

    // Verify non-finance goal progress remained 0 and unmutated
    const [freshHealthGoal] = await db
      .select()
      .from(goals)
      .where(eq(goals.id, healthGoal.id));
    expect(freshHealthGoal.currentValue).toBe(0);
    expect(freshHealthGoal.progress).toBe(0);
  });

  it("9. P1-2 Cross-User Isolation: Rejects linking to unowned or foreign financial goal", async () => {
    if (!probe.isAvailable) return;

    // Foreign goal ID not owned by testUserId
    const foreignGoalId = crypto.randomUUID();

    // Current user trying to link to foreign/unowned goal must fail
    await expect(
      createTransaction(testUserId, {
        accountId: testAccountId,
        categoryId: testCategoryId,
        goalId: foreignGoalId,
        transactionType: "income",
        amount: 2000,
        date: new Date(),
      })
    ).rejects.toThrow(InvariantViolationError);

    // Also verify updateTransaction rejects linking to foreign/unowned goal
    const validTx = await createTransaction(testUserId, {
      accountId: testAccountId,
      categoryId: testCategoryId,
      goalId: testGoalId,
      transactionType: "income",
      amount: 1000,
      date: new Date(),
    });

    await expect(
      updateTransaction(testUserId, validTx.id, {
        goalId: foreignGoalId,
      })
    ).rejects.toThrow(InvariantViolationError);
  });
});
