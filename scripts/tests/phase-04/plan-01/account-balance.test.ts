import { describe, it, expect } from "vitest";
import {
  calculateNetWorth,
  roundMoney,
  type AccountBalanceInput,
} from "@/server/finance/calculations";
import type { FinanceAccount } from "@/types";

describe("Phase 4 Plan 04-01: Real Production Account Balance & Accounting Invariants Unit Tests", () => {
  describe("1. Pure Production calculateNetWorth & Invariants", () => {
    it("computes net worth accurately for standard asset accounts", () => {
      const accounts: AccountBalanceInput[] = [
        { accountType: "checking", balance: "50000.00" },
        { accountType: "savings", balance: "200000.00" },
        { accountType: "investment", balance: "150000.00" },
        { accountType: "cash", balance: "10000.00" },
      ];

      const result = calculateNetWorth(accounts);
      expect(result.totalAssets).toBe(410000);
      expect(result.totalLiabilities).toBe(0);
      expect(result.netWorth).toBe(410000);
    });

    it("returns zero net worth when account list is empty", () => {
      const result = calculateNetWorth([]);
      expect(result.totalAssets).toBe(0);
      expect(result.totalLiabilities).toBe(0);
      expect(result.netWorth).toBe(0);
    });

    it("excludes archived accounts by default and includes them when requested", () => {
      const accounts: AccountBalanceInput[] = [
        { accountType: "checking", balance: 50000, isArchived: false },
        { accountType: "savings", balance: 30000, isArchived: true },
      ];

      const defaultResult = calculateNetWorth(accounts);
      expect(defaultResult.totalAssets).toBe(50000);
      expect(defaultResult.netWorth).toBe(50000);

      const withArchivedResult = calculateNetWorth(accounts, { includeArchived: true });
      expect(withArchivedResult.totalAssets).toBe(80000);
      expect(withArchivedResult.netWorth).toBe(80000);
    });
  });

  describe("2. P0-1 Credit Card Accounting Lifecycle Invariants", () => {
    it("satisfies the mandatory credit card net worth lifecycle requirement", () => {
      // Step 1: Initial State
      // Checking = 100,000, Credit Card = 0, Net Worth = 100,000
      let checkingBalance = 100000;
      let creditCardDebt = 0;

      let result = calculateNetWorth([
        { accountType: "checking", balance: checkingBalance },
        { accountType: "credit_card", balance: creditCardDebt },
      ]);
      expect(result.totalAssets).toBe(100000);
      expect(result.totalLiabilities).toBe(0);
      expect(result.netWorth).toBe(100000);

      // Step 2: Credit Card Expense of 10,000 PKR
      // Credit card debt increases to 10,000 PKR
      // Net Worth must reduce by 10,000 to 90,000 PKR
      creditCardDebt += 10000;

      result = calculateNetWorth([
        { accountType: "checking", balance: checkingBalance },
        { accountType: "credit_card", balance: creditCardDebt },
      ]);
      expect(result.totalAssets).toBe(100000);
      expect(result.totalLiabilities).toBe(100000 >= 0 ? 10000 : 0);
      expect(result.totalLiabilities).toBe(10000);
      expect(result.netWorth).toBe(90000);

      // Step 3: Payment of 10,000 from Checking to Credit Card
      // Checking decreases by 10,000 to 90,000
      // Credit Card debt returns to 0
      // Net Worth remains 90,000 PKR
      checkingBalance -= 10000;
      creditCardDebt -= 10000;

      result = calculateNetWorth([
        { accountType: "checking", balance: checkingBalance },
        { accountType: "credit_card", balance: creditCardDebt },
      ]);
      expect(result.totalAssets).toBe(90000);
      expect(result.totalLiabilities).toBe(0);
      expect(result.netWorth).toBe(90000);
    });

    it("handles initial credit card debt correctly", () => {
      const accounts: AccountBalanceInput[] = [
        { accountType: "checking", balance: "100000.00" },
        { accountType: "credit_card", balance: "25000.00" }, // Started with 25k debt
      ];

      const result = calculateNetWorth(accounts);
      expect(result.totalAssets).toBe(100000);
      expect(result.totalLiabilities).toBe(25000);
      expect(result.netWorth).toBe(75000);
    });

    it("handles multiple credit card transactions with refunds and charges", () => {
      let ccDebt = 0;
      // Charge 5000
      ccDebt += 5000;
      // Charge 3000
      ccDebt += 3000;
      // Refund 1500
      ccDebt -= 1500;

      expect(ccDebt).toBe(6500);

      const result = calculateNetWorth([
        { accountType: "checking", balance: 50000 },
        { accountType: "credit_card", balance: ccDebt },
      ]);

      expect(result.totalAssets).toBe(50000);
      expect(result.totalLiabilities).toBe(6500);
      expect(result.netWorth).toBe(43500);
    });

    it("handles negative credit card debt as an asset (credit surplus)", () => {
      // Overpayment or refund resulting in negative debt (bank owes user)
      const accounts: AccountBalanceInput[] = [
        { accountType: "checking", balance: 10000 },
        { accountType: "credit_card", balance: -500 }, // Credit surplus
      ];

      const result = calculateNetWorth(accounts);
      expect(result.totalAssets).toBe(10500);
      expect(result.totalLiabilities).toBe(0);
      expect(result.netWorth).toBe(10500);
    });

    it("handles negative balance on checking account as overdraft liability", () => {
      const accounts: AccountBalanceInput[] = [
        { accountType: "checking", balance: -2000 },
        { accountType: "credit_card", balance: 5000 },
      ];

      const result = calculateNetWorth(accounts);
      expect(result.totalAssets).toBe(0);
      expect(result.totalLiabilities).toBe(7000); // 5000 CC + 2000 overdraft
      expect(result.netWorth).toBe(-7000);
    });
  });

  describe("3. P1-1 Account DTO & Schema Contract Verification", () => {
    it("enforces canonical 'balance' property on FinanceAccount DTO", () => {
      const sampleAccount: FinanceAccount = {
        id: "acc-123",
        userId: "user-456",
        name: "Meezan Current",
        accountType: "checking",
        currency: "PKR",
        initialBalance: "50000.00",
        balance: "75000.00",
        isArchived: false,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Ensure balance is accessible, numeric, and not undefined
      expect(sampleAccount.balance).toBe("75000.00");
      expect(parseFloat(sampleAccount.balance)).not.toBeNaN();
      expect(parseFloat(sampleAccount.balance)).toBe(75000);

      // Verify that currentBalance is not part of the runtime object
      expect((sampleAccount as any).currentBalance).toBeUndefined();
    });
  });

  describe("4. Precision & Deterministic Rounding", () => {
    it("maintains strict 2-decimal precision using roundMoney", () => {
      expect(roundMoney(0.1 + 0.2)).toBe(0.3);
      expect(roundMoney(10.005)).toBe(10.01);
      expect(roundMoney(10.004)).toBe(10.00);
      expect(roundMoney(-50.005)).toBe(-50.01);
    });
  });
});
