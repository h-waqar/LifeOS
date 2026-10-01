import { z } from "zod";
import { type LifeOSTool } from "./types";
import { getFinanceSummary } from "@/server/finance/reports-service";
import { createTransaction } from "@/server/finance/transaction-service";
import { assertFinancialShield } from "@/server/agents/finance-shield";

export const financeGetSummaryTool: LifeOSTool = {
  id: "finance_get_summary",
  name: "finance_get_summary",
  description: "Get monthly financial summary report including net worth, income, expenses, and savings rate.",
  category: "finance",
  riskTier: "tier1_readonly",
  schema: z.object({
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be in YYYY-MM format")
      .optional()
      .describe("Month in YYYY-MM format (defaults to current month)"),
  }),
  execute: async (ctx, args) => {
    const month = args.month ?? new Date().toISOString().slice(0, 7);
    return await getFinanceSummary(ctx.userId, month);
  },
};

export const financeCreateTransactionTool: LifeOSTool = {
  id: "finance_create_transaction",
  name: "finance_create_transaction",
  description: "Record a financial transaction (income, expense, or transfer between accounts). Highly consequential financial mutation.",
  category: "finance",
  riskTier: "tier4_destructive",
  schema: z.object({
    accountId: z.string().uuid("accountId must be a valid UUID"),
    toAccountId: z
      .string()
      .uuid("toAccountId must be a valid UUID")
      .optional()
      .describe("Required for transfers; target account UUID"),
    transactionType: z.enum(["income", "expense", "transfer"]),
    amount: z.number().positive("Amount must be strictly positive"),
    currency: z.string().min(1).max(10).optional().default("PKR"),
    date: z
      .string()
      .optional()
      .describe("Transaction date (ISO datetime or YYYY-MM-DD, defaults to now)"),
    categoryId: z.string().uuid().optional().describe("Category UUID"),
    payee: z.string().trim().max(255).optional(),
    description: z.string().trim().max(1000).optional(),
    goalId: z.string().uuid().optional().describe("Linked savings goal UUID"),
    tags: z.array(z.string().trim().min(1)).optional().default([]),
  }),
  previewAction: (args) => ({
    summary: `Record ${args.transactionType} of ${args.amount} ${args.currency ?? "PKR"} on account ${args.accountId}`,
    affectedEntities: [
      { domain: "finance", id: args.accountId, name: "Source Account" },
      ...(args.toAccountId
        ? [{ domain: "finance", id: args.toAccountId, name: "Destination Account" }]
        : []),
    ],
    diff: {
      type: { after: args.transactionType },
      amount: { after: args.amount },
    },
    warning:
      "This financial transaction directly affects account balances, budget calculations, and net worth reports.",
  }),
  execute: async (ctx, args) => {
    // Universal Zero-Trust Financial Shield: AI-originated mutations are strictly blocked
    assertFinancialShield(
      {
        isAgent: true,
        user: {
          id: ctx.userId,
        },
        agent: {
          id: `ai-assistant-${ctx.userId}`,
          userId: ctx.userId,
          name: "AI Assistant",
          tokenPrefix: "ai_assistant...",
          provider: "ai_assistant",
          status: "active",
          expiresAt: null,
          capabilities: new Set(["READ"]),
          permissions: [],
        },
        provider: "ai_assistant",
        sessionId: ctx.conversationId,
      },
      "finance.createTransaction"
    );

    return await createTransaction(ctx.userId, {
      accountId: args.accountId,
      toAccountId: args.toAccountId,
      transactionType: args.transactionType,
      amount: args.amount,
      currency: args.currency ?? "PKR",
      date: args.date ? new Date(args.date) : new Date(),
      categoryId: args.categoryId,
      payee: args.payee,
      description: args.description,
      goalId: args.goalId,
      tags: args.tags ?? [],
    });
  },
};
