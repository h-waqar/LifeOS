import { describe, it, expect } from "vitest";
import {
  roundMoney,
  calculateNetWorth,
  calculateMonthlyCashFlow,
  calculateSavingsRate,
  calculateBudgetUtilization,
} from "@/server/finance/calculations";

describe("Phase 4 Plan 04-02: Pure Financial Calculations Engine Unit Tests", () => {
  describe("1. Net Worth Calculations", () => {
    it("computes net worth for pure asset accounts", () => {
      const accounts = [
        { accountType: "checking", balance: "100000.00" },
        { accountType: "savings", balance: "500000.00" },
      ];

      const result = calculateNetWorth(accounts);
      expect(result.totalAssets).toBe(600000);
      expect(result.totalLiabilities).toBe(0);
      expect(result.netWorth).toBe(600000);
    });

    it("subtracts credit card liabilities from assets", () => {
      const accounts = [
        { accountType: "checking", balance: 100000 },
        { accountType: "savings", balance: 500000 },
        { accountType: "credit_card", balance: 50000 },
      ];

      const result = calculateNetWorth(accounts);
      expect(result.totalAssets).toBe(600000);
      expect(result.totalLiabilities).toBe(50000);
      expect(result.netWorth).toBe(550000);
    });

    it("handles negative net worth when liabilities exceed assets", () => {
      const accounts = [
        { accountType: "cash", balance: 10000 },
        { accountType: "credit_card", balance: 100000 },
      ];

      const result = calculateNetWorth(accounts);
      expect(result.totalAssets).toBe(10000);
      expect(result.totalLiabilities).toBe(100000);
      expect(result.netWorth).toBe(-90000);
    });

    it("returns zero net worth when user has no accounts", () => {
      const result = calculateNetWorth([]);
      expect(result.totalAssets).toBe(0);
      expect(result.totalLiabilities).toBe(0);
      expect(result.netWorth).toBe(0);
    });

    it("excludes archived accounts by default and includes them when requested", () => {
      const accounts = [
        { accountType: "checking", balance: 50000, isArchived: false },
        { accountType: "savings", balance: 30000, isArchived: true },
      ];

      const defaultResult = calculateNetWorth(accounts);
      expect(defaultResult.netWorth).toBe(50000);

      const withArchived = calculateNetWorth(accounts, { includeArchived: true });
      expect(withArchived.netWorth).toBe(80000);
    });
  });

  describe("2. Monthly Cash Flow Calculations & Transfer Exclusion", () => {
    it("calculates surplus cash flow (Income > Expenses)", () => {
      const transactions = [
        { transactionType: "income", amount: 150000, date: "2026-09-05" },
        { transactionType: "expense", amount: 90000, date: "2026-09-12" },
      ];

      const result = calculateMonthlyCashFlow(transactions, "2026-09");
      expect(result.totalIncome).toBe(150000);
      expect(result.totalExpenses).toBe(90000);
      expect(result.cashFlow).toBe(60000);
    });

    it("calculates deficit cash flow (Expenses > Income)", () => {
      const transactions = [
        { transactionType: "income", amount: 50000, date: "2026-09-01" },
        { transactionType: "expense", amount: 80000, date: "2026-09-15" },
      ];

      const result = calculateMonthlyCashFlow(transactions, "2026-09");
      expect(result.totalIncome).toBe(50000);
      expect(result.totalExpenses).toBe(80000);
      expect(result.cashFlow).toBe(-30000);
    });

    it("STRICTLY EXCLUDES transfers from cash flow calculations", () => {
      const transactions = [
        { transactionType: "income", amount: 100000, date: "2026-09-01" },
        { transactionType: "expense", amount: 40000, date: "2026-09-10" },
        // Transfer of 50,000 between accounts must not impact cash flow
        { transactionType: "transfer", amount: 50000, date: "2026-09-15" },
      ];

      const result = calculateMonthlyCashFlow(transactions, "2026-09");
      expect(result.totalIncome).toBe(100000);
      expect(result.totalExpenses).toBe(40000);
      expect(result.cashFlow).toBe(60000);
    });

    it("filters transactions belonging only to the specified month", () => {
      const transactions = [
        { transactionType: "income", amount: 100000, date: "2026-08-31" },
        { transactionType: "income", amount: 50000, date: "2026-09-02" },
        { transactionType: "expense", amount: 20000, date: "2026-09-10" },
        { transactionType: "expense", amount: 15000, date: "2026-10-01" },
      ];

      const sepResult = calculateMonthlyCashFlow(transactions, "2026-09");
      expect(sepResult.totalIncome).toBe(50000);
      expect(sepResult.totalExpenses).toBe(20000);
      expect(sepResult.cashFlow).toBe(30000);
    });

    it("returns zero when no transactions exist for the month", () => {
      const result = calculateMonthlyCashFlow([], "2026-09");
      expect(result.totalIncome).toBe(0);
      expect(result.totalExpenses).toBe(0);
      expect(result.cashFlow).toBe(0);
    });
  });

  describe("3. Savings Rate Calculations", () => {
    it("calculates normal surplus savings rate", () => {
      // (100,000 - 40,000) / 100,000 = 60.00%
      expect(calculateSavingsRate(100000, 40000)).toBe(60);
    });

    it("calculates 100.00% savings rate when expenses are zero", () => {
      expect(calculateSavingsRate(100000, 0)).toBe(100);
    });

    it("calculates negative savings rate during budget deficit", () => {
      // (100,000 - 120,000) / 100,000 = -20.00%
      expect(calculateSavingsRate(100000, 120000)).toBe(-20);
    });

    it("guards against division by zero when income is 0.00", () => {
      expect(calculateSavingsRate(0, 10000)).toBe(0);
    });

    it("guards against non-positive / negative income", () => {
      expect(calculateSavingsRate(-5000, 10000)).toBe(0);
    });

    it("accurately rounds to 2 decimal places", () => {
      // Income 150,000, Expenses 43,210.50
      // (150,000 - 43,210.50) / 150,000 = 106,789.50 / 150,000 = 0.71193 -> 71.19%
      expect(calculateSavingsRate(150000, 43210.5)).toBe(71.19);
    });
  });

  describe("4. Category Budget Utilization", () => {
    it("calculates utilization percentage and remaining amount for on-track spending", () => {
      const result = calculateBudgetUtilization(20000, 10000);
      expect(result.spentAmount).toBe(10000);
      expect(result.remainingAmount).toBe(10000);
      expect(result.utilizationPercentage).toBe(50.0);
      expect(result.isOverBudget).toBe(false);
    });

    it("handles exact 100% budget utilization", () => {
      const result = calculateBudgetUtilization(20000, 20000);
      expect(result.spentAmount).toBe(20000);
      expect(result.remainingAmount).toBe(0);
      expect(result.utilizationPercentage).toBe(100.0);
      expect(result.isOverBudget).toBe(false);
    });

    it("flags over-budget spending and negative remaining balance", () => {
      const result = calculateBudgetUtilization(20000, 25000);
      expect(result.spentAmount).toBe(25000);
      expect(result.remainingAmount).toBe(-5000);
      expect(result.utilizationPercentage).toBe(125.0);
      expect(result.isOverBudget).toBe(true);
    });

    it("handles targetAmount = 0 gracefully without NaN", () => {
      const result = calculateBudgetUtilization(0, 5000);
      expect(result.spentAmount).toBe(5000);
      expect(result.remainingAmount).toBe(-5000);
      expect(result.utilizationPercentage).toBe(0);
      expect(result.isOverBudget).toBe(true);
    });
  });

  describe("5. Deterministic Monetary Rounding", () => {
    it("rounds standard floating-point precision edge cases deterministically", () => {
      expect(roundMoney(10.005)).toBe(10.01);
      expect(roundMoney(10.004)).toBe(10);
      expect(roundMoney(0.1 + 0.2)).toBe(0.3);
      expect(roundMoney(1234567.891)).toBe(1234567.89);
    });
  });
});
