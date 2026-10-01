/**
 * Phase 14 Plan 14-02: AI Action Zero-Trust Integration & Universal Financial Shield Suite
 *
 * Verifies:
 * - SEC-03: Elimination of AI action execution bypass (delegates through canonical executeAgentOperation)
 * - SEC-06: Universal Financial Shield on AI-originated mutations (100% blocked, no transactions created)
 * - Anti-Replay, Expiration, Tenant Isolation, and HTTP Route status contracts.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as confirmActionPost } from "@/app/api/ai/actions/[id]/confirm/route";
import { confirmAndExecuteAction } from "@/server/ai/hitl/action-executor";
import { interceptToolCall } from "@/server/ai/hitl/gate-service";
import {
  financeCreateTransactionTool,
  financeGetSummaryTool,
} from "@/server/ai/tools/finance-tools";
import { tasksCreateTool } from "@/server/ai/tools/task-tools";
import { FinancialShieldViolationError } from "@/server/agents/finance-shield";
import {
  ActionNotFoundError,
  ActionForbiddenError,
  ActionConflictError,
  ActionExpiredError,
} from "@/server/ai/hitl/types";

// Hoisted in-memory stores for AI actions, audit logs, and domain tables
const { mockDbState } = vi.hoisted(() => {
  return {
    mockDbState: {
      aiActions: new Map<string, any>(),
      agentAuditLog: [] as any[],
      auditLog: [] as any[],
      tasks: new Map<string, any>(),
      transactions: new Map<string, any>(),
      currentUser: { id: "user-owner-123", email: "user@example.com", name: "Legit User" },
    },
  };
});

vi.mock("@/server/auth/guard", () => ({
  requireAuthenticatedUser: vi.fn(async () => ({
    user: mockDbState.currentUser,
  })),
  AuthenticationError: class AuthenticationError extends Error {
    readonly code = "UNAUTHENTICATED";
  },
  AuthorizationError: class AuthorizationError extends Error {
    readonly code = "FORBIDDEN";
  },
}));

vi.mock("@/server/events", () => ({
  eventBus: {
    publish: vi.fn(async () => {}),
  },
  createDomainEvent: (type: string, userId: string, payload: any) => ({
    id: `ev-${Math.random().toString(36).slice(2)}`,
    name: type,
    userId,
    payload,
    timestamp: new Date().toISOString(),
  }),
}));

vi.mock("@/server/audit", () => ({
  createAuditLog: vi.fn(async (entry: any) => {
    mockDbState.auditLog.push(entry);
    return entry;
  }),
}));

vi.mock("@/server/finance/transaction-service", () => ({
  createTransaction: vi.fn(async (userId: string, input: any) => {
    const tx = { id: `tx-${Math.random().toString(36).slice(2)}`, userId, ...input };
    mockDbState.transactions.set(tx.id, tx);
    return tx;
  }),
}));

vi.mock("@/server/tasks/service", () => ({
  createTask: vi.fn(async (userId: string, input: any) => {
    const task = {
      id: `task-${Math.random().toString(36).slice(2)}`,
      userId,
      title: input.title,
      status: input.status || "todo",
      priority: input.priority || "medium",
      tags: input.tags || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockDbState.tasks.set(task.id, task);
    return task;
  }),
  toTaskDTO: vi.fn((row: any) => row),
}));

vi.mock("@/server/db", () => {
  const fakeDb: any = {
    transaction: async (callback: any) => {
      const tx = {
        select: (fields?: any) => ({
          from: (table: any) => ({
            where: (condition: any) => ({
              for: (mode: string) => {
                // In pessimistic lock, return matched action
                return Array.from(mockDbState.aiActions.values());
              },
              limit: async () => Array.from(mockDbState.aiActions.values()),
            }),
          }),
        }),
        update: (table: any) => ({
          set: (data: any) => ({
            where: (condition: any) => ({
              returning: async () => {
                const actionId = Array.from(mockDbState.aiActions.keys())[0];
                const existing = mockDbState.aiActions.get(actionId);
                if (existing) {
                  const updated = { ...existing, ...data };
                  mockDbState.aiActions.set(actionId, updated);
                  return [updated];
                }
                return [];
              },
              then: (resolve: any) => {
                const actionId = Array.from(mockDbState.aiActions.keys())[0];
                const existing = mockDbState.aiActions.get(actionId);
                if (existing) {
                  const updated = { ...existing, ...data };
                  mockDbState.aiActions.set(actionId, updated);
                }
                resolve([data]);
              },
            }),
          }),
        }),
        insert: (table: any) => ({
          values: (data: any) => {
            if (data.toolName && data.status) {
              // Agent audit log
              mockDbState.agentAuditLog.push(data);
            }
            return {
              returning: async () => [data],
            };
          },
        }),
      };
      return await callback(tx);
    },
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => Array.from(mockDbState.aiActions.values()),
          for: () => Array.from(mockDbState.aiActions.values()),
        }),
      }),
    }),
    insert: (table: any) => ({
      values: (data: any) => ({
        returning: async () => {
          const record = { id: data.id || `act-${Math.random().toString(36).slice(2)}`, ...data };
          mockDbState.aiActions.set(record.id, record);
          return [record];
        },
      }),
    }),
    update: (table: any) => ({
      set: (data: any) => ({
        where: () => ({
          returning: async () => [data],
        }),
      }),
    }),
  };

  return { db: fakeDb };
});

describe("Phase 14 Plan 14-02: AI Action Zero-Trust & Financial Shield Security Suite", () => {
  const legitimateUserId = "user-owner-123";
  const foreignUserId = "foreign-tenant-456";

  beforeEach(() => {
    mockDbState.aiActions.clear();
    mockDbState.agentAuditLog.length = 0;
    mockDbState.auditLog.length = 0;
    mockDbState.tasks.clear();
    mockDbState.transactions.clear();
    mockDbState.currentUser = { id: legitimateUserId, email: "user@example.com", name: "Legit User" };
    vi.clearAllMocks();
  });

  describe("1. Universal Zero-Trust Financial Shield on AI Actions", () => {
    it("strictly blocks financeCreateTransactionTool.execute with FinancialShieldViolationError", async () => {
      await expect(
        financeCreateTransactionTool.execute(
          { userId: legitimateUserId, conversationId: "conv-1" },
          {
            accountId: "00000000-0000-0000-0000-000000000001",
            transactionType: "expense",
            amount: 500,
          }
        )
      ).rejects.toThrow(FinancialShieldViolationError);

      expect(mockDbState.transactions.size).toBe(0);
    });

    it("strictly blocks interceptToolCall from queuing or executing financial mutations", async () => {
      await expect(
        interceptToolCall(
          { userId: legitimateUserId, conversationId: "conv-1" },
          financeCreateTransactionTool,
          {
            accountId: "00000000-0000-0000-0000-000000000001",
            transactionType: "transfer",
            amount: 1000,
          }
        )
      ).rejects.toThrow(FinancialShieldViolationError);

      expect(mockDbState.transactions.size).toBe(0);
      expect(mockDbState.aiActions.size).toBe(0);
    });

    it("strictly blocks confirmAndExecuteAction when action row is a financial transaction", async () => {
      const actionId = "action-finance-malicious";
      mockDbState.aiActions.set(actionId, {
        id: actionId,
        userId: legitimateUserId,
        conversationId: "conv-1",
        toolName: "finance_create_transaction",
        riskLevel: "destructive",
        status: "pending",
        parameters: {
          accountId: "00000000-0000-0000-0000-000000000001",
          transactionType: "income",
          amount: 50000,
        },
        previewData: { summary: "Drain account" },
        expiresAt: new Date(Date.now() + 300000),
        createdAt: new Date(),
      });

      await expect(
        confirmAndExecuteAction(legitimateUserId, actionId)
      ).rejects.toThrow(FinancialShieldViolationError);

      // Verify ZERO transactions were created
      expect(mockDbState.transactions.size).toBe(0);

      // Verify action was marked failed
      const updated = mockDbState.aiActions.get(actionId);
      expect(updated.status).toBe("failed");
      expect(updated.errorMessage).toContain("Financial shield violation");
    });

    it("HTTP route POST /api/ai/actions/[id]/confirm returns 403 Forbidden for financial mutations", async () => {
      const actionId = "action-finance-http";
      mockDbState.aiActions.set(actionId, {
        id: actionId,
        userId: legitimateUserId,
        conversationId: "conv-1",
        toolName: "finance_create_transaction",
        riskLevel: "destructive",
        status: "pending",
        parameters: {
          accountId: "00000000-0000-0000-0000-000000000001",
          transactionType: "expense",
          amount: 100,
        },
        previewData: { summary: "Expense" },
        expiresAt: new Date(Date.now() + 300000),
        createdAt: new Date(),
      });

      const req = new NextRequest(`http://localhost:3000/api/ai/actions/${actionId}/confirm`, {
        method: "POST",
      });

      const res = await confirmActionPost(req, { params: Promise.resolve({ id: actionId }) });
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.code).toBe("FINANCIAL_SHIELD_VIOLATION");
      expect(json.error).toContain("Financial shield violation");
      expect(mockDbState.transactions.size).toBe(0);
    });
  });

  describe("2. AI Action Zero-Trust Execution & Audit Persistence", () => {
    it("successfully confirms and executes an AI task creation tool and writes to agent_audit_log", async () => {
      const actionId = "action-task-legit";
      mockDbState.aiActions.set(actionId, {
        id: actionId,
        userId: legitimateUserId,
        conversationId: "conv-tasks-1",
        toolName: "tasks_create",
        riskLevel: "consequential",
        status: "pending",
        parameters: {
          title: "Buy groceries for home",
          priority: "high",
        },
        previewData: { summary: "Create task" },
        expiresAt: new Date(Date.now() + 300000),
        createdAt: new Date(),
      });

      const result = await confirmAndExecuteAction(legitimateUserId, actionId, {
        ipAddress: "127.0.0.1",
        userAgent: "LifeOS-Client",
      });

      expect(result.action.status).toBe("executed");
      expect(mockDbState.tasks.size).toBe(1);

      // Verify agent_audit_log entry was created
      expect(mockDbState.agentAuditLog.length).toBeGreaterThan(0);
      const auditEntry = mockDbState.agentAuditLog.find((a) => a.toolName === "tasks_create");
      expect(auditEntry).toBeDefined();
      expect(auditEntry.userId).toBe(legitimateUserId);
      expect(auditEntry.agentName).toBe("AI Assistant");
      expect(auditEntry.provider).toBe("ai_assistant");
      expect(auditEntry.status).toBe("EXECUTED");
    });

    it("rejects confirmation when action belongs to a different tenant with ActionForbiddenError (403)", async () => {
      const actionId = "action-cross-tenant";
      mockDbState.aiActions.set(actionId, {
        id: actionId,
        userId: foreignUserId, // owned by foreign user
        conversationId: "conv-foreign",
        toolName: "tasks_create",
        riskLevel: "low",
        status: "pending",
        parameters: { title: "Victim task" },
        expiresAt: new Date(Date.now() + 300000),
        createdAt: new Date(),
      });

      // Legitimate user attempts to confirm foreign action
      await expect(
        confirmAndExecuteAction(legitimateUserId, actionId)
      ).rejects.toThrow(ActionForbiddenError);

      const req = new NextRequest(`http://localhost:3000/api/ai/actions/${actionId}/confirm`, {
        method: "POST",
      });

      const res = await confirmActionPost(req, { params: Promise.resolve({ id: actionId }) });
      expect(res.status).toBe(403);
    });

    it("rejects replay of an already-executed action with ActionConflictError (409)", async () => {
      const actionId = "action-already-executed";
      mockDbState.aiActions.set(actionId, {
        id: actionId,
        userId: legitimateUserId,
        conversationId: "conv-1",
        toolName: "tasks_create",
        riskLevel: "low",
        status: "executed", // already executed!
        parameters: { title: "Duplicate task" },
        expiresAt: new Date(Date.now() + 300000),
        createdAt: new Date(),
      });

      await expect(
        confirmAndExecuteAction(legitimateUserId, actionId)
      ).rejects.toThrow(ActionConflictError);

      const req = new NextRequest(`http://localhost:3000/api/ai/actions/${actionId}/confirm`, {
        method: "POST",
      });

      const res = await confirmActionPost(req, { params: Promise.resolve({ id: actionId }) });
      expect(res.status).toBe(409);
    });

    it("rejects confirmation of an expired action with ActionExpiredError (410)", async () => {
      const actionId = "action-expired";
      mockDbState.aiActions.set(actionId, {
        id: actionId,
        userId: legitimateUserId,
        conversationId: "conv-1",
        toolName: "tasks_create",
        riskLevel: "consequential",
        status: "pending",
        parameters: { title: "Expired task" },
        expiresAt: new Date(Date.now() - 10000), // expired 10 seconds ago
        createdAt: new Date(Date.now() - 310000),
      });

      await expect(
        confirmAndExecuteAction(legitimateUserId, actionId)
      ).rejects.toThrow(ActionExpiredError);

      const req = new NextRequest(`http://localhost:3000/api/ai/actions/${actionId}/confirm`, {
        method: "POST",
      });

      const res = await confirmActionPost(req, { params: Promise.resolve({ id: actionId }) });
      expect(res.status).toBe(410);
    });

    it("rejects non-existent action with ActionNotFoundError (404)", async () => {
      await expect(
        confirmAndExecuteAction(legitimateUserId, "non-existent-action-id")
      ).rejects.toThrow(ActionNotFoundError);

      const req = new NextRequest("http://localhost:3000/api/ai/actions/non-existent-id/confirm", {
        method: "POST",
      });

      const res = await confirmActionPost(req, { params: Promise.resolve({ id: "non-existent-id" }) });
      expect(res.status).toBe(404);
    });
  });
});
