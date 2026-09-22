import { describe, it, expect } from "vitest";
import {
  createAccountSchema,
  updateAccountSchema,
  createCategorySchema,
  updateCategorySchema,
  createTransactionSchema,
  updateTransactionSchema,
  listTransactionsQuerySchema,
} from "@/server/finance/validation";

describe("Phase 4 Plan 04-01: Finance Validation Schemas Unit Tests", () => {
  describe("createAccountSchema", () => {
    it("accepts valid account with defaults", () => {
      const parsed = createAccountSchema.parse({
        name: "Standard Checking",
        accountType: "checking",
      });

      expect(parsed.name).toBe("Standard Checking");
      expect(parsed.accountType).toBe("checking");
      expect(parsed.currency).toBe("PKR");
      expect(parsed.initialBalance).toBe("0.00");
    });

    it("rejects empty account name", () => {
      expect(() =>
        createAccountSchema.parse({
          name: "   ",
          accountType: "savings",
        })
      ).toThrow("Account name is required");
    });

    it("accepts all 5 valid account types", () => {
      const types = ["checking", "savings", "investment", "credit_card", "cash"] as const;
      for (const t of types) {
        const parsed = createAccountSchema.parse({
          name: `${t} account`,
          accountType: t,
        });
        expect(parsed.accountType).toBe(t);
      }
    });

    it("rejects invalid account type", () => {
      expect(() =>
        createAccountSchema.parse({
          name: "Crypto Wallet",
          accountType: "crypto",
        })
      ).toThrow();
    });

    it("rejects negative initial balance", () => {
      expect(() =>
        createAccountSchema.parse({
          name: "Overdraft",
          accountType: "checking",
          initialBalance: -500,
        })
      ).toThrow("Initial balance cannot be negative");
    });
  });

  describe("createCategorySchema", () => {
    it("validates expense category", () => {
      const parsed = createCategorySchema.parse({
        name: "Groceries",
        categoryType: "expense",
        icon: "ShoppingCart",
        color: "#f97316",
      });
      expect(parsed.name).toBe("Groceries");
      expect(parsed.categoryType).toBe("expense");
    });

    it("validates income category", () => {
      const parsed = createCategorySchema.parse({
        name: "Consulting",
        categoryType: "income",
      });
      expect(parsed.name).toBe("Consulting");
      expect(parsed.categoryType).toBe("income");
    });

    it("rejects invalid category type", () => {
      expect(() =>
        createCategorySchema.parse({
          name: "Dividend",
          categoryType: "asset",
        })
      ).toThrow();
    });
  });

  describe("createTransactionSchema", () => {
    const validDate = new Date().toISOString();

    it("validates valid expense transaction", () => {
      const parsed = createTransactionSchema.parse({
        accountId: "acc-123",
        transactionType: "expense",
        amount: 2500,
        date: validDate,
        payee: "Grocery Mart",
      });

      expect(parsed.amount).toBe("2500.00");
      expect(parsed.transactionType).toBe("expense");
      expect(parsed.toAccountId).toBeUndefined();
    });

    it("validates valid income transaction", () => {
      const parsed = createTransactionSchema.parse({
        accountId: "acc-123",
        transactionType: "income",
        amount: "150000.50",
        date: validDate,
        payee: "Employer Inc.",
      });

      expect(parsed.amount).toBe("150000.50");
      expect(parsed.transactionType).toBe("income");
    });

    it("validates valid transfer transaction", () => {
      const parsed = createTransactionSchema.parse({
        accountId: "acc-source",
        toAccountId: "acc-dest",
        transactionType: "transfer",
        amount: 50000,
        date: validDate,
      });

      expect(parsed.transactionType).toBe("transfer");
      expect(parsed.accountId).toBe("acc-source");
      expect(parsed.toAccountId).toBe("acc-dest");
    });

    it("rejects zero amount", () => {
      expect(() =>
        createTransactionSchema.parse({
          accountId: "acc-1",
          transactionType: "expense",
          amount: 0,
          date: validDate,
        })
      ).toThrow("Amount must be strictly positive");
    });

    it("rejects negative amount", () => {
      expect(() =>
        createTransactionSchema.parse({
          accountId: "acc-1",
          transactionType: "income",
          amount: -100,
          date: validDate,
        })
      ).toThrow("Amount must be strictly positive");
    });

    it("rejects transfer when toAccountId is missing", () => {
      expect(() =>
        createTransactionSchema.parse({
          accountId: "acc-source",
          transactionType: "transfer",
          amount: 1000,
          date: validDate,
        })
      ).toThrow("Transfer requires a destination account");
    });

    it("rejects transfer where toAccountId equals accountId", () => {
      expect(() =>
        createTransactionSchema.parse({
          accountId: "acc-same",
          toAccountId: "acc-same",
          transactionType: "transfer",
          amount: 1000,
          date: validDate,
        })
      ).toThrow("Transfer destination cannot be the same as the source account");
    });

    it("rejects expense with toAccountId specified", () => {
      expect(() =>
        createTransactionSchema.parse({
          accountId: "acc-1",
          toAccountId: "acc-2",
          transactionType: "expense",
          amount: 500,
          date: validDate,
        })
      ).toThrow("Only transfer transactions can have a destination account");
    });

    it("rejects income with toAccountId specified", () => {
      expect(() =>
        createTransactionSchema.parse({
          accountId: "acc-1",
          toAccountId: "acc-2",
          transactionType: "income",
          amount: 500,
          date: validDate,
        })
      ).toThrow("Only transfer transactions can have a destination account");
    });
  });

  describe("listTransactionsQuerySchema", () => {
    it("applies default pagination limit and offset", () => {
      const parsed = listTransactionsQuerySchema.parse({});
      expect(parsed.limit).toBe(50);
      expect(parsed.offset).toBe(0);
    });

    it("coerces string limits to numbers and bounds them", () => {
      const parsed = listTransactionsQuerySchema.parse({
        limit: "25",
        offset: "50",
      });
      expect(parsed.limit).toBe(25);
      expect(parsed.offset).toBe(50);
    });
  });
});
