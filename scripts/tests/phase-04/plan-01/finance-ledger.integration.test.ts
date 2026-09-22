// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { auditLog } from "@/server/db/schema";
import { auth } from "@/server/auth";
import { eq, and } from "drizzle-orm";
import {
  createAccount,
  listAccounts,
  updateAccount,
  archiveAccount,
  deleteAccount,
  getAccountById,
  InvariantViolationError,
  NotFoundError,
} from "@/server/finance/account-service";
import { calculateNetWorth } from "@/server/finance/calculations";
import {
  seedDefaultCategories,
  listCategories,
  createCategory,
} from "@/server/finance/category-service";
import {
  createTransaction,
  listTransactions,
  getTransactionById,
  updateTransaction,
  deleteTransaction,
} from "@/server/finance/transaction-service";

describe("Phase 4 Plan 04-01: Finance Ledger & Atomic Balances (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p04_finance_ledger@example.com",
    password: "Plan04LedgerPassword123!",
    name: "Finance Ledger Tester",
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

  it("1. Seeds default categories and creates custom categories", async () => {
    if (!probe.isAvailable) return;

    const initialCategories = await listCategories(testUserId);
    expect(initialCategories.length).toBeGreaterThanOrEqual(14); // 9 expense + 5 income

    const expenseNames = initialCategories
      .filter((c) => c.categoryType === "expense")
      .map((c) => c.name);
    expect(expenseNames).toContain("Food");
    expect(expenseNames).toContain("Transport");
    expect(expenseNames).toContain("Bills");

    const incomeNames = initialCategories
      .filter((c) => c.categoryType === "income")
      .map((c) => c.name);
    expect(incomeNames).toContain("Salary");
    expect(incomeNames).toContain("Freelance");

    // Create custom category
    const custom = await createCategory(testUserId, {
      name: "Hobbies",
      categoryType: "expense",
      icon: "Gamepad",
      color: "#ec4899",
    });
    expect(custom.id).toBeDefined();
    expect(custom.name).toBe("Hobbies");
    expect(custom.isSystem).toBe(false);
  });

  it("2. Creates financial accounts with opening balances", async () => {
    if (!probe.isAvailable) return;

    const checking = await createAccount(testUserId, {
      name: "Meezan Checking",
      accountType: "checking",
      currency: "PKR",
      initialBalance: 100000,
      color: "#3b82f6",
    });
    expect(checking.id).toBeDefined();
    expect(checking.initialBalance).toBe("100000.00");
    expect(checking.balance).toBe("100000.00");

    const savings = await createAccount(testUserId, {
      name: "Meezan Savings",
      accountType: "savings",
      currency: "PKR",
      initialBalance: 250000,
      color: "#10b981",
    });
    expect(savings.id).toBeDefined();
    expect(savings.balance).toBe("250000.00");

    const creditCard = await createAccount(testUserId, {
      name: "Standard Chartered Card",
      accountType: "credit_card",
      currency: "PKR",
      initialBalance: 0,
      color: "#f43f5e",
    });
    expect(creditCard.id).toBeDefined();
    expect(creditCard.balance).toBe("0.00");

    const accounts = await listAccounts(testUserId);
    expect(accounts.length).toBe(3);
  });

  it("3. Records income and verifies atomic balance increment", async () => {
    if (!probe.isAvailable) return;

    const accounts = await listAccounts(testUserId);
    const checking = accounts.find((a) => a.name === "Meezan Checking")!;
    const initialBalance = parseFloat(checking.balance);

    const categories = await listCategories(testUserId, { type: "income" });
    const salaryCat = categories.find((c) => c.name === "Salary");

    const tx = await createTransaction(testUserId, {
      accountId: checking.id,
      transactionType: "income",
      amount: 50000,
      date: new Date(),
      categoryId: salaryCat?.id,
      payee: "Acme Corp",
      description: "Monthly Salary Deposit",
    });

    expect(tx.id).toBeDefined();
    expect(tx.amount).toBe("50000.00");

    const updatedChecking = await getAccountById(testUserId, checking.id);
    expect(parseFloat(updatedChecking!.balance)).toBe(initialBalance + 50000);
  });

  it("4. Records expense and verifies atomic balance decrement", async () => {
    if (!probe.isAvailable) return;

    const accounts = await listAccounts(testUserId);
    const checking = accounts.find((a) => a.name === "Meezan Checking")!;
    const initialBalance = parseFloat(checking.balance);

    const categories = await listCategories(testUserId, { type: "expense" });
    const foodCat = categories.find((c) => c.name === "Food");

    const tx = await createTransaction(testUserId, {
      accountId: checking.id,
      transactionType: "expense",
      amount: 15000,
      date: new Date(),
      categoryId: foodCat?.id,
      payee: "Hypermarket",
      description: "Groceries",
    });

    expect(tx.id).toBeDefined();

    const updatedChecking = await getAccountById(testUserId, checking.id);
    expect(parseFloat(updatedChecking!.balance)).toBe(initialBalance - 15000);
  });

  it("5. Records transfer: atomically debits source, credits destination, preserves net worth", async () => {
    if (!probe.isAvailable) return;

    const accounts = await listAccounts(testUserId);
    const checking = accounts.find((a) => a.name === "Meezan Checking")!;
    const savings = accounts.find((a) => a.name === "Meezan Savings")!;

    const initialChecking = parseFloat(checking.balance);
    const initialSavings = parseFloat(savings.balance);
    const transferAmount = 30000;

    const transferTx = await createTransaction(testUserId, {
      accountId: checking.id,
      toAccountId: savings.id,
      transactionType: "transfer",
      amount: transferAmount,
      date: new Date(),
      description: "Transfer to emergency fund",
    });

    expect(transferTx.id).toBeDefined();
    expect(transferTx.transactionType).toBe("transfer");

    const afterChecking = await getAccountById(testUserId, checking.id);
    const afterSavings = await getAccountById(testUserId, savings.id);

    expect(parseFloat(afterChecking!.balance)).toBe(initialChecking - transferAmount);
    expect(parseFloat(afterSavings!.balance)).toBe(initialSavings + transferAmount);

    // Sum is perfectly preserved
    expect(parseFloat(afterChecking!.balance) + parseFloat(afterSavings!.balance)).toBe(
      initialChecking + initialSavings
    );
  });

  it("6. Updates a transaction atomically: reverses prior balance effect and applies new amount", async () => {
    if (!probe.isAvailable) return;

    const accounts = await listAccounts(testUserId);
    const checking = accounts.find((a) => a.name === "Meezan Checking")!;

    // Create a 5,000 PKR expense
    const tx = await createTransaction(testUserId, {
      accountId: checking.id,
      transactionType: "expense",
      amount: 5000,
      date: new Date(),
      payee: "Book Store",
    });

    const balanceAfterCreate = parseFloat((await getAccountById(testUserId, checking.id))!.balance);

    // Update amount from 5,000 to 8,000 (net difference: -3,000)
    const updatedTx = await updateTransaction(testUserId, tx.id, {
      amount: 8000,
    });
    expect(updatedTx.amount).toBe("8000.00");

    const balanceAfterUpdate = parseFloat((await getAccountById(testUserId, checking.id))!.balance);
    expect(balanceAfterUpdate).toBe(balanceAfterCreate - 3000);
  });

  it("7. Deletes a transaction atomically: restores prior balance", async () => {
    if (!probe.isAvailable) return;

    const accounts = await listAccounts(testUserId);
    const checking = accounts.find((a) => a.name === "Meezan Checking")!;
    const initialBalance = parseFloat(checking.balance);

    // Create a 12,000 PKR expense
    const tx = await createTransaction(testUserId, {
      accountId: checking.id,
      transactionType: "expense",
      amount: 12000,
      date: new Date(),
      payee: "Electronics Store",
    });

    const balanceAfterCreate = parseFloat((await getAccountById(testUserId, checking.id))!.balance);
    expect(balanceAfterCreate).toBe(initialBalance - 12000);

    // Delete the transaction
    await deleteTransaction(testUserId, tx.id);

    const balanceAfterDelete = parseFloat((await getAccountById(testUserId, checking.id))!.balance);
    expect(balanceAfterDelete).toBe(initialBalance);
  });

  it("8. Account deletion protection: prevents deletion when transactions exist; permits delete when empty", async () => {
    if (!probe.isAvailable) return;

    const accounts = await listAccounts(testUserId);
    const checking = accounts.find((a) => a.name === "Meezan Checking")!;

    // Attempting to delete account with transactions throws InvariantViolationError
    await expect(deleteAccount(testUserId, checking.id)).rejects.toThrow(
      InvariantViolationError
    );

    // Soft-archive succeeds
    const archived = await archiveAccount(testUserId, checking.id);
    expect(archived.isArchived).toBe(true);

    // Creating empty account and deleting it succeeds
    const emptyAcc = await createAccount(testUserId, {
      name: "Empty Temporary Account",
      accountType: "cash",
      initialBalance: 0,
    });

    await expect(deleteAccount(testUserId, emptyAcc.id)).resolves.toBeUndefined();
  });

  it("9. Verifies immutable audit log entries were created for mutations", async () => {
    if (!probe.isAvailable) return;

    const logs = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.userId, testUserId));

    const actions = logs.map((l) => l.action);
    expect(actions).toContain("finance.account.created");
    expect(actions).toContain("finance.transaction.created");
    expect(actions).toContain("finance.transaction.updated");
    expect(actions).toContain("finance.transaction.deleted");
    expect(actions).toContain("finance.account.deleted");
  });

  it("10. P0-2 Concurrency: Concurrent deletions reverse balance exactly once without corruption", async () => {
    if (!probe.isAvailable) return;

    // Create dedicated account starting with 50,000 PKR
    const acc = await createAccount(testUserId, {
      name: "Concurrency Deletion Account",
      accountType: "checking",
      initialBalance: 50000,
    });

    // Create a 10,000 PKR expense -> balance becomes 40,000 PKR
    const tx = await createTransaction(testUserId, {
      accountId: acc.id,
      transactionType: "expense",
      amount: 10000,
      date: new Date(),
      payee: "Concurrent Vendor",
    });

    const midAcc = await getAccountById(testUserId, acc.id);
    expect(parseFloat(midAcc!.balance)).toBe(40000);

    // Launch two concurrent deletions against the exact same transaction
    const results = await Promise.allSettled([
      deleteTransaction(testUserId, tx.id),
      deleteTransaction(testUserId, tx.id),
    ]);

    // Exactly one deletion must succeed and exactly one must fail with NotFoundError
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const error = (rejected[0] as PromiseRejectedResult).reason;
    expect(error instanceof NotFoundError).toBe(true);

    // Final balance must be restored exactly once: 40,000 + 10,000 = 50,000 (NOT 60,000 double reversal!)
    const finalAcc = await getAccountById(testUserId, acc.id);
    expect(parseFloat(finalAcc!.balance)).toBe(50000);
  });

  it("11. P0-1 Credit Card Full Accounting Lifecycle & Net Worth Invariant", async () => {
    if (!probe.isAvailable) return;

    // Initial:
    // Checking = 100,000 PKR
    // Credit Card = 0 PKR
    // Net Worth = 100,000 PKR
    const checking = await createAccount(testUserId, {
      name: "CC Lifecycle Checking",
      accountType: "checking",
      initialBalance: 100000,
    });

    const cc = await createAccount(testUserId, {
      name: "CC Lifecycle Card",
      accountType: "credit_card",
      initialBalance: 0,
    });

    let accounts = [
      await getAccountById(testUserId, checking.id),
      await getAccountById(testUserId, cc.id),
    ];
    let nw = calculateNetWorth(accounts as any);
    expect(nw.totalAssets).toBe(100000);
    expect(nw.totalLiabilities).toBe(0);
    expect(nw.netWorth).toBe(100000);

    // Credit-card expense of 10,000 PKR
    // Credit card debt increases to 10,000 PKR
    // Net Worth reduces to 90,000 PKR
    await createTransaction(testUserId, {
      accountId: cc.id,
      transactionType: "expense",
      amount: 10000,
      date: new Date(),
      payee: "Airline Tickets",
    });

    accounts = [
      await getAccountById(testUserId, checking.id),
      await getAccountById(testUserId, cc.id),
    ];
    expect(parseFloat(accounts[1]!.balance)).toBe(10000); // 10,000 debt
    nw = calculateNetWorth(accounts as any);
    expect(nw.totalAssets).toBe(100000);
    expect(nw.totalLiabilities).toBe(10000);
    expect(nw.netWorth).toBe(90000);

    // Payment of 10,000 from Checking to Credit Card (transfer Checking -> CC)
    // Checking decreases by 10,000 to 90,000
    // Credit Card debt returns to 0
    // Net Worth remains 90,000
    await createTransaction(testUserId, {
      accountId: checking.id,
      toAccountId: cc.id,
      transactionType: "transfer",
      amount: 10000,
      date: new Date(),
      description: "Pay off credit card balance",
    });

    accounts = [
      await getAccountById(testUserId, checking.id),
      await getAccountById(testUserId, cc.id),
    ];
    expect(parseFloat(accounts[0]!.balance)).toBe(90000);
    expect(parseFloat(accounts[1]!.balance)).toBe(0);
    nw = calculateNetWorth(accounts as any);
    expect(nw.totalAssets).toBe(90000);
    expect(nw.totalLiabilities).toBe(0);
    expect(nw.netWorth).toBe(90000);

    // Credit-card refund / income of 2,500 PKR
    await createTransaction(testUserId, {
      accountId: cc.id,
      transactionType: "income",
      amount: 2500,
      date: new Date(),
      payee: "Merchant Refund",
    });

    accounts = [
      await getAccountById(testUserId, checking.id),
      await getAccountById(testUserId, cc.id),
    ];
    // Credit card balance is now -2500 (credit surplus)
    expect(parseFloat(accounts[1]!.balance)).toBe(-2500);
    nw = calculateNetWorth(accounts as any);
    expect(nw.totalAssets).toBe(92500); // 90,000 checking + 2,500 CC surplus
    expect(nw.totalLiabilities).toBe(0);
    expect(nw.netWorth).toBe(92500);
  });

  it("12. P2-1 Category Type Mismatch: Enforces categoryType matches transactionType", async () => {
    if (!probe.isAvailable) return;

    const acc = await createAccount(testUserId, {
      name: "Category Invariant Checking",
      accountType: "checking",
      initialBalance: 50000,
    });

    const expCat = await createCategory(testUserId, {
      name: "Food & Dining",
      categoryType: "expense",
    });

    const incCat = await createCategory(testUserId, {
      name: "Client Honorarium",
      categoryType: "income",
    });

    // 1. Expense + Expense Category -> Accepted
    const tx1 = await createTransaction(testUserId, {
      accountId: acc.id,
      transactionType: "expense",
      amount: 500,
      categoryId: expCat.id,
      date: new Date(),
    });
    expect(tx1.id).toBeDefined();

    // 2. Income + Income Category -> Accepted
    const tx2 = await createTransaction(testUserId, {
      accountId: acc.id,
      transactionType: "income",
      amount: 2500,
      categoryId: incCat.id,
      date: new Date(),
    });
    expect(tx2.id).toBeDefined();

    // 3. Expense + Income Category -> Rejected
    await expect(
      createTransaction(testUserId, {
        accountId: acc.id,
        transactionType: "expense",
        amount: 300,
        categoryId: incCat.id,
        date: new Date(),
      })
    ).rejects.toThrow(InvariantViolationError);

    // 4. Income + Expense Category -> Rejected
    await expect(
      createTransaction(testUserId, {
        accountId: acc.id,
        transactionType: "income",
        amount: 800,
        categoryId: expCat.id,
        date: new Date(),
      })
    ).rejects.toThrow(InvariantViolationError);

    // 5. Update transaction to mismatched category -> Rejected
    await expect(
      updateTransaction(testUserId, tx1.id, {
        categoryId: incCat.id, // tx1 is expense, incCat is income
      })
    ).rejects.toThrow(InvariantViolationError);
  });

  it("13. P2-2 Archived Account Immutability: Rejects mutations on archived accounts", async () => {
    if (!probe.isAvailable) return;

    const activeAcc = await createAccount(testUserId, {
      name: "Active Account",
      accountType: "checking",
      initialBalance: 10000,
    });

    const archivedAcc = await createAccount(testUserId, {
      name: "Archived Old Account",
      accountType: "savings",
      initialBalance: 5000,
    });
    await archiveAccount(testUserId, archivedAcc.id);

    // 1. Expense on archived account -> Rejected
    await expect(
      createTransaction(testUserId, {
        accountId: archivedAcc.id,
        transactionType: "expense",
        amount: 1000,
        date: new Date(),
      })
    ).rejects.toThrow("Cannot create transaction on an archived account");

    // 2. Income on archived account -> Rejected
    await expect(
      createTransaction(testUserId, {
        accountId: archivedAcc.id,
        transactionType: "income",
        amount: 2000,
        date: new Date(),
      })
    ).rejects.toThrow("Cannot create transaction on an archived account");

    // 3. Transfer from archived account -> Rejected
    await expect(
      createTransaction(testUserId, {
        accountId: archivedAcc.id,
        toAccountId: activeAcc.id,
        transactionType: "transfer",
        amount: 500,
        date: new Date(),
      })
    ).rejects.toThrow("Cannot create transaction on an archived account");

    // 4. Transfer to archived account -> Rejected
    await expect(
      createTransaction(testUserId, {
        accountId: activeAcc.id,
        toAccountId: archivedAcc.id,
        transactionType: "transfer",
        amount: 500,
        date: new Date(),
      })
    ).rejects.toThrow("Cannot transfer to an archived destination account");

    // 5. Update existing transaction onto an archived account -> Rejected
    const activeTx = await createTransaction(testUserId, {
      accountId: activeAcc.id,
      transactionType: "expense",
      amount: 200,
      date: new Date(),
    });

    await expect(
      updateTransaction(testUserId, activeTx.id, {
        accountId: archivedAcc.id,
      })
    ).rejects.toThrow("Cannot assign transaction to an archived account");
  });
});
