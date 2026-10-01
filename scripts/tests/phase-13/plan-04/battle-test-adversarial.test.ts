/**
 * Phase 13 Final Battle-Test: Comprehensive Adversarial Security Suite
 *
 * Hostile verification of Zero-Trust Agent Safety, Permissions & Attribution:
 * - SAFE-01: Zero-Trust Agent Authorization & Anti-Spoofing
 * - SAFE-02: Mandatory Human Approval (HITL Challenge Lifecycle & Replay Defense)
 * - SAFE-03: Canonical Financial Shield (Budget, Category, Account, Transaction)
 * - SAFE-04: Authoritative Attribution & Audit Logging
 * - SAFE-05: Secret Scrubbing (Embedded tokens, credentials, nested objects, errors)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// In-Memory Database for Adversarial Testing with vi.hoisted
const { mockDb } = vi.hoisted(() => {
  class MockSecurityDb {
    public challenges = new Map<string, any>();
    public auditLogs: any[] = [];

    insert(table: any) {
      return {
        values: (val: any) => ({
          returning: async () => {
            if (val.toolName) {
              const auditRecord = {
                id: `audit-${Math.random().toString(36).slice(2)}`,
                userId: val.userId,
                agentTokenId: val.agentTokenId ?? null,
                agentName: val.agentName ?? null,
                provider: val.provider ?? null,
                sessionId: val.sessionId ?? null,
                toolName: val.toolName,
                capability: val.capability,
                operation: val.operation,
                resource: val.resource ?? null,
                arguments: val.arguments,
                argumentsHash: val.argumentsHash ?? null,
                challengeId: val.challengeId ?? null,
                challengeStatus: val.challengeStatus ?? null,
                status: val.status,
                beforeState: val.beforeState ?? null,
                afterState: val.afterState ?? null,
                stateDiff: val.stateDiff ?? null,
                durationMs: val.durationMs ?? null,
                errorMessage: val.errorMessage ?? null,
                ipAddress: val.ipAddress ?? null,
                userAgent: val.userAgent ?? null,
                createdAt: new Date(),
              };
              this.auditLogs.push(auditRecord);
              return [auditRecord];
            }

            const record = {
              id: val.id,
              userId: val.userId,
              agentTokenId: val.agentTokenId,
              operation: val.operation,
              capability: val.capability,
              resource: val.resource,
              resourceId: val.resourceId ?? null,
              arguments: val.arguments,
              argumentsHash: val.argumentsHash,
              status: val.status ?? "PENDING",
              expiresAt: val.expiresAt,
              approvedAt: val.approvedAt ?? null,
              consumedAt: val.consumedAt ?? null,
              rejectedAt: val.rejectedAt ?? null,
              rejectionReason: val.rejectionReason ?? null,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            this.challenges.set(record.id, record);
            return [record];
          },
        }),
      };
    }

    select() {
      return {
        from: (table: any) => ({
          where: (condition: any) => ({
            limit: async () => {
              const id = this.extractIdFromCondition(condition);
              if (id && this.challenges.has(id)) {
                return [this.challenges.get(id)!];
              }
              return [];
            },
            orderBy: () => ({
              limit: async () => Array.from(this.challenges.values()),
            }),
          }),
        }),
      };
    }

    update(table: any) {
      return {
        set: (updateValues: any) => ({
          where: (condition: any) => {
            const execute = async () => {
              const id = this.extractIdFromCondition(condition);
              if (!id || !this.challenges.has(id)) {
                return [];
              }
              const record = this.challenges.get(id)!;
              const requiredStatus = this.extractStatusFromCondition(condition);
              if (requiredStatus && record.status !== requiredStatus) {
                return [];
              }

              const updated = {
                ...record,
                ...updateValues,
                updatedAt: new Date(),
              };
              this.challenges.set(id, updated);
              return [updated];
            };

            return {
              then: (onfulfilled?: any, onrejected?: any) =>
                execute().then(onfulfilled, onrejected),
              returning: execute,
            };
          },
        }),
      };
    }

    async execute() {
      return [];
    }

    private extractIdFromCondition(condition: any): string | null {
      if (!condition) return null;
      const visited = new Set<any>();

      const traverse = (node: any): string | null => {
        if (!node || typeof node !== "object" || visited.has(node)) return null;
        visited.add(node);

        if (node.queryChunks && Array.isArray(node.queryChunks)) {
          for (const chunk of node.queryChunks) {
            const res = traverse(chunk);
            if (res) return res;
          }
        }

        if (node.value !== undefined && typeof node.value === "string") {
          if (this.challenges.has(node.value)) {
            return node.value;
          }
          if (node.value.length > 8 && (node.value.includes("-") || node.value.startsWith("ch-"))) {
            return node.value;
          }
        }

        return null;
      };

      return traverse(condition);
    }

    private extractStatusFromCondition(condition: any): string | null {
      if (!condition) return null;
      const visited = new Set<any>();

      const traverse = (node: any): string | null => {
        if (!node || typeof node !== "object" || visited.has(node)) return null;
        visited.add(node);

        if (node.queryChunks && Array.isArray(node.queryChunks)) {
          for (const chunk of node.queryChunks) {
            const res = traverse(chunk);
            if (res) return res;
          }
        }

        if (node.value !== undefined && typeof node.value === "string") {
          if (["PENDING", "APPROVED", "CONSUMED", "REJECTED", "EXPIRED"].includes(node.value)) {
            return node.value;
          }
        }

        return null;
      };

      return traverse(condition);
    }
  }

  return { mockDb: new MockSecurityDb() };
});

vi.mock("@/server/db", () => ({
  db: mockDb,
  getDb: () => mockDb,
}));

// Mock domain services so CLI commands can execute without real PostgreSQL
vi.mock("@/server/projects/service", () => ({
  listProjects: vi.fn().mockResolvedValue([{ id: "proj-1", name: "LifeOS Platform", status: "active", area: "career" }]),
  getProject: vi.fn().mockResolvedValue({ id: "proj-1", name: "LifeOS Platform", status: "active", area: "career" }),
  createProject: vi.fn().mockResolvedValue({ id: "proj-2", name: "New Project", status: "active", area: "career" }),
  updateProject: vi.fn().mockResolvedValue({ id: "proj-1", name: "Updated Project", status: "active", area: "career" }),
  deleteProject: vi.fn().mockResolvedValue({ id: "proj-1", deleted: true }),
  createProjectSchema: { parse: (x: any) => x },
  updateProjectSchema: { parse: (x: any) => x },
}));

vi.mock("@/server/goals/service", () => ({
  listGoals: vi.fn().mockResolvedValue([{ id: "goal-1", title: "Master AI Safety", status: "active" }]),
  getGoal: vi.fn().mockResolvedValue({ id: "goal-1", title: "Master AI Safety", status: "active" }),
  createGoal: vi.fn().mockResolvedValue({ id: "goal-2", title: "New Goal", status: "active" }),
  updateGoal: vi.fn().mockResolvedValue({ id: "goal-1", title: "Updated Goal", status: "active" }),
  deleteGoal: vi.fn().mockResolvedValue({ id: "goal-1", deleted: true }),
  createGoalSchema: { parse: (x: any) => x },
  updateGoalSchema: { parse: (x: any) => x },
}));

vi.mock("@/server/notes/service", () => ({
  listNotes: vi.fn().mockResolvedValue([{ id: "note-1", title: "Zero Trust Architecture" }]),
  getNote: vi.fn().mockResolvedValue({ id: "note-1", title: "Zero Trust Architecture" }),
  createNote: vi.fn().mockResolvedValue({ id: "note-2", title: "New Note" }),
  updateNote: vi.fn().mockResolvedValue({ id: "note-1", title: "Updated Note" }),
  deleteNote: vi.fn().mockResolvedValue({ id: "note-1", deleted: true }),
  createNoteSchema: { parse: (x: any) => x },
  updateNoteSchema: { parse: (x: any) => x },
}));

vi.mock("@/server/habits/service", () => ({
  listHabits: vi.fn().mockResolvedValue([{ id: "habit-1", title: "Daily Security Audit", streak: 5 }]),
  getHabit: vi.fn().mockResolvedValue({ id: "habit-1", title: "Daily Security Audit", streak: 5 }),
  createHabit: vi.fn().mockResolvedValue({ id: "habit-2", title: "New Habit" }),
  updateHabit: vi.fn().mockResolvedValue({ id: "habit-1", title: "Updated Habit" }),
  deleteHabit: vi.fn().mockResolvedValue({ id: "habit-1", deleted: true }),
  createHabitSchema: { parse: (x: any) => x },
  updateHabitSchema: { parse: (x: any) => x },
}));

vi.mock("@/server/planning/service", () => ({
  getOrCreateDailyPlan: vi.fn().mockResolvedValue({ id: "plan-1", date: "2026-10-01", status: "in_progress" }),
  completeMorningRoutine: vi.fn().mockResolvedValue({ id: "plan-1", morningCompleted: true }),
  completeEveningRoutine: vi.fn().mockResolvedValue({ id: "plan-1", eveningCompleted: true }),
  addDailyPlanTask: vi.fn().mockResolvedValue({ id: "plan-1", taskId: "t-1" }),
  removeDailyPlanTask: vi.fn().mockResolvedValue({ id: "plan-1", taskId: "t-1" }),
}));

vi.mock("@/server/daily-plan/service", () => ({
  getDailyPlan: vi.fn().mockResolvedValue({
    date: "2026-10-01",
    plan: { id: "plan-1", status: "in_progress", priorityTaskIds: [] },
    priorityTasks: [],
    todayHabits: [],
    overdueTasks: [],
  }),
  saveMorningPlan: vi.fn().mockResolvedValue({ id: "plan-1", status: "completed" }),
  completeEveningReview: vi.fn().mockResolvedValue({ id: "plan-1", status: "completed" }),
  executeRollover: vi.fn().mockResolvedValue({ rolledOverCount: 0 }),
}));

import { executeAgentOperation } from "@/server/agents/safety-boundary";
import {
  createChallenge,
  approveChallenge,
} from "@/server/agents/challenges/challenge-service";
import {
  ChallengeForbiddenError,
  ChallengeTamperedError,
  ChallengeAlreadyConsumedError,
} from "@/server/agents/challenges/types";
import {
  FinancialShieldViolationError,
  withAgentSafetyContext,
} from "@/server/agents/finance-shield";
import {
  scrubString,
  scrubSecrets,
} from "@/server/agents/audit/attribution-logger";
import type { AgentIdentity, AgentSafetyContext } from "@/server/agents/permissions/types";

// Financial domain services under attack
import { upsertBudget, deleteBudget, copyBudgetsFromPreviousMonth } from "@/server/finance/budget-service";
import { createCategory, updateCategory, archiveCategory } from "@/server/finance/category-service";
import { createTransaction, updateTransaction, deleteTransaction } from "@/server/finance/transaction-service";
import { createAccount, updateAccount, archiveAccount, deleteAccount } from "@/server/finance/account-service";

// CLI handlers under attack
import { handleAgents } from "@/cli/commands/agents";
import { handleProjects } from "@/cli/commands/projects";
import { handleGoals } from "@/cli/commands/goals";
import { handleNotes } from "@/cli/commands/notes";
import { handleHabits } from "@/cli/commands/habits";
import { handlePlan } from "@/cli/commands/plan";
import { handleWhoami } from "@/cli/commands/auth";
import { UsageError } from "@/cli/errors";
import type { CommandContext, ParsedArgs } from "@/cli/types";

describe("Phase 13 Hostile Adversarial Battle-Test Suite", () => {
  const USER_ALICE = "user-alice-100";
  const USER_MALLORY = "user-mallory-666";

  const fullPrivilegeAgent: AgentIdentity = {
    id: "agent-full-priv-001",
    userId: USER_ALICE,
    name: "Autonomous High-Privilege Agent",
    tokenPrefix: "lifeos_ag_highpriv",
    provider: "adversarial-suite",
    status: "active",
    expiresAt: null,
    capabilities: new Set(["READ", "WRITE", "DESTRUCTIVE", "EXECUTE", "SENSITIVE"]),
    permissions: [],
  };

  const readOnlyAgent: AgentIdentity = {
    id: "agent-readonly-002",
    userId: USER_ALICE,
    name: "Read-Only Assistant",
    tokenPrefix: "lifeos_ag_readonly",
    provider: "adversarial-suite",
    status: "active",
    expiresAt: null,
    capabilities: new Set(["READ"]),
    permissions: [],
  };

  const agentSafetyCtx: AgentSafetyContext = {
    isAgent: true,
    agent: fullPrivilegeAgent,
    user: { id: USER_ALICE, name: "Alice", email: "alice@lifeos.internal" },
  };

  beforeEach(() => {
    mockDb.challenges.clear();
    mockDb.auditLogs = [];
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. SAFE-03: CANONICAL FINANCIAL SHIELD EXHAUSTIVE ATTACK
  // =========================================================================
  describe("1. SAFE-03 Canonical Financial Shield Invariants", () => {
    it("rejects budget upsert under agent safety context unconditionally", async () => {
      await expect(
        withAgentSafetyContext(agentSafetyCtx, async () => {
          return upsertBudget(USER_ALICE, {
            categoryId: "cat-1",
            month: "2026-10",
            targetAmount: 500,
            currency: "USD",
          });
        })
      ).rejects.toThrow(FinancialShieldViolationError);
    });

    it("rejects budget deletion under agent safety context unconditionally", async () => {
      await expect(
        withAgentSafetyContext(agentSafetyCtx, async () => {
          return deleteBudget(USER_ALICE, "budget-1");
        })
      ).rejects.toThrow(FinancialShieldViolationError);
    });

    it("rejects budget month-copy under agent safety context unconditionally", async () => {
      await expect(
        withAgentSafetyContext(agentSafetyCtx, async () => {
          return copyBudgetsFromPreviousMonth(USER_ALICE, { targetMonth: "2026-10" });
        })
      ).rejects.toThrow(FinancialShieldViolationError);
    });

    it("rejects category creation under agent safety context unconditionally", async () => {
      await expect(
        withAgentSafetyContext(agentSafetyCtx, async () => {
          return createCategory(USER_ALICE, {
            name: "Hacked Category",
            categoryType: "expense",
          });
        })
      ).rejects.toThrow(FinancialShieldViolationError);
    });

    it("rejects category update under agent safety context unconditionally", async () => {
      await expect(
        withAgentSafetyContext(agentSafetyCtx, async () => {
          return updateCategory(USER_ALICE, "cat-1", {
            name: "Tampered Category",
          });
        })
      ).rejects.toThrow(FinancialShieldViolationError);
    });

    it("rejects category archive under agent safety context unconditionally", async () => {
      await expect(
        withAgentSafetyContext(agentSafetyCtx, async () => {
          return archiveCategory(USER_ALICE, "cat-1");
        })
      ).rejects.toThrow(FinancialShieldViolationError);
    });

    it("rejects transaction mutations (create, update, delete) under agent context", async () => {
      await expect(
        withAgentSafetyContext(agentSafetyCtx, async () => {
          return createTransaction(USER_ALICE, {
            accountId: "acc-1",
            amount: 100,
            transactionType: "expense",
            category: "food",
            currency: "USD",
            date: new Date().toISOString(),
          } as any);
        })
      ).rejects.toThrow(FinancialShieldViolationError);

      await expect(
        withAgentSafetyContext(agentSafetyCtx, async () => {
          return updateTransaction(USER_ALICE, "tx-1", { amount: 50 });
        })
      ).rejects.toThrow(FinancialShieldViolationError);

      await expect(
        withAgentSafetyContext(agentSafetyCtx, async () => {
          return deleteTransaction(USER_ALICE, "tx-1");
        })
      ).rejects.toThrow(FinancialShieldViolationError);
    });

    it("rejects account mutations (create, update, archive, delete) under agent context", async () => {
      await expect(
        withAgentSafetyContext(agentSafetyCtx, async () => {
          return createAccount(USER_ALICE, {
            name: "Offshore Account",
            accountType: "checking",
            balance: 1000000,
            currency: "USD",
          } as any);
        })
      ).rejects.toThrow(FinancialShieldViolationError);

      await expect(
        withAgentSafetyContext(agentSafetyCtx, async () => {
          return updateAccount(USER_ALICE, "acc-1", { name: "Renamed" });
        })
      ).rejects.toThrow(FinancialShieldViolationError);

      await expect(
        withAgentSafetyContext(agentSafetyCtx, async () => {
          return archiveAccount(USER_ALICE, "acc-1");
        })
      ).rejects.toThrow(FinancialShieldViolationError);

      await expect(
        withAgentSafetyContext(agentSafetyCtx, async () => {
          return deleteAccount(USER_ALICE, "acc-1");
        })
      ).rejects.toThrow(FinancialShieldViolationError);
    });

    it("blocks indirect nested callback execution attempting financial mutation", async () => {
      async function indirectHelper(callback: () => Promise<void>) {
        await Promise.resolve(); // async gap
        await callback();
      }

      await expect(
        withAgentSafetyContext(agentSafetyCtx, async () => {
          await indirectHelper(async () => {
            await deleteBudget(USER_ALICE, "budget-99");
          });
        })
      ).rejects.toThrow(FinancialShieldViolationError);
    });

    it("financial shield violation error contains exact operation identifier", async () => {
      try {
        await withAgentSafetyContext(agentSafetyCtx, async () => {
          await upsertBudget(USER_ALICE, {} as any);
        });
        expect.unreachable("Should have thrown");
      } catch (err: any) {
        expect(err).toBeInstanceOf(FinancialShieldViolationError);
        expect(err.operation).toBe("upsertBudget");
        expect(err.message).toContain("Direct autonomous modification of financial state is strictly prohibited");
      }
    });
  });

  // =========================================================================
  // 2. SAFE-01 & SAFE-02: CLI AGENT ENTRY POINT BOUNDARY & ESCALATION GATES
  // =========================================================================
  describe("2. CLI Entry Point Boundary & HITL Protection", () => {
    const mockAgentContext: CommandContext = {
      isAgent: true,
      agent: fullPrivilegeAgent,
      user: { id: USER_ALICE, name: "Alice", email: "alice@lifeos.internal" },
      session: {
        id: "sess-1",
        userId: USER_ALICE,
        expiresAt: new Date(Date.now() + 86400000),
        token: "tok",
      },
      token: "tok",
      options: {},
    };

    const mockReadOnlyContext: CommandContext = {
      isAgent: true,
      agent: readOnlyAgent,
      user: { id: USER_ALICE, name: "Alice", email: "alice@lifeos.internal" },
      session: {
        id: "sess-2",
        userId: USER_ALICE,
        expiresAt: new Date(Date.now() + 86400000),
        token: "tok",
      },
      token: "tok",
      options: {},
    };

    it("blocks autonomous agents from managing agent tokens, challenges, or audit via CLI", async () => {
      const actions = [
        ["token", "create"],
        ["token", "list"],
        ["token", "revoke", "tok-1"],
        ["challenge", "list"],
        ["challenge", "approve", "ch-1"],
        ["challenge", "reject", "ch-1"],
        ["audit"],
      ];

      for (const sub of actions) {
        const parsed: ParsedArgs = { subcommands: ["agent", ...sub], flags: {}, options: {} };
        await expect(
          handleAgents(parsed, mockAgentContext)
        ).rejects.toThrow(UsageError);

        await expect(
          handleAgents(parsed, mockAgentContext)
        ).rejects.toThrow(/Autonomous agents cannot manage agent tokens/);
      }
    });

    it("allows human callers to manage agents without error", async () => {
      const humanContext: CommandContext = {
        isAgent: false,
        user: { id: USER_ALICE, name: "Alice", email: "alice@lifeos.internal" },
        session: {
          id: "sess-3",
          userId: USER_ALICE,
          expiresAt: new Date(Date.now() + 86400000),
          token: "tok",
        },
        token: "tok",
        options: {},
      };
      // Unknown target will throw UsageError with target guidance, confirming agent gate was bypassed
      const parsed: ParsedArgs = { subcommands: ["agent", "unknown_cmd"], flags: {}, options: {} };
      await expect(handleAgents(parsed, humanContext)).rejects.toThrow(/Unknown agent target/);
    });

    it("routes projects CLI commands through safety boundary and enforces capabilities", async () => {
      // 1. READ action with READ capability succeeds
      const listParsed: ParsedArgs = { subcommands: ["projects", "list"], flags: {}, options: {} };
      const listRes = await handleProjects(listParsed, mockReadOnlyContext);
      expect(listRes.tableData?.rows).toHaveLength(1);

      // 2. WRITE action without WRITE capability fails
      const createParsed: ParsedArgs = {
        subcommands: ["projects", "create"],
        flags: { name: "Agent Hack", area: "career" },
        options: {},
      };
      await expect(handleProjects(createParsed, mockReadOnlyContext)).rejects.toThrow(
        /Agent permission denied/
      );

      // 3. DESTRUCTIVE action without challenge returns CHALLENGE_REQUIRED
      const deleteParsed: ParsedArgs = {
        subcommands: ["projects", "delete", "proj-1"],
        flags: {},
        options: {},
      };
      const deleteRes = await handleProjects(deleteParsed, mockAgentContext);
      expect(deleteRes.data).toBeDefined();
      const payload = deleteRes.data as any;
      expect(payload.status).toBe("CHALLENGE_REQUIRED");
      expect(payload.challengeId).toBeDefined();
    });

    it("routes goals CLI commands through safety boundary and halts destructive actions", async () => {
      // READ succeeds
      const listParsed: ParsedArgs = { subcommands: ["goals", "list"], flags: {}, options: {} };
      const listRes = await handleGoals(listParsed, mockReadOnlyContext);
      expect(listRes.data).toBeDefined();

      // DESTRUCTIVE requires challenge
      const deleteParsed: ParsedArgs = { subcommands: ["goals", "delete", "goal-1"], flags: {}, options: {} };
      const deleteRes = await handleGoals(deleteParsed, mockAgentContext);
      expect((deleteRes.data as any).status).toBe("CHALLENGE_REQUIRED");
    });

    it("routes notes CLI commands through safety boundary and halts destructive actions", async () => {
      const deleteParsed: ParsedArgs = { subcommands: ["notes", "delete", "note-1"], flags: {}, options: {} };
      const deleteRes = await handleNotes(deleteParsed, mockAgentContext);
      expect((deleteRes.data as any).status).toBe("CHALLENGE_REQUIRED");
    });

    it("routes habits CLI commands through safety boundary and halts destructive actions", async () => {
      const deleteParsed: ParsedArgs = { subcommands: ["habits", "delete", "habit-1"], flags: {}, options: {} };
      const deleteRes = await handleHabits(deleteParsed, mockAgentContext);
      expect((deleteRes.data as any).status).toBe("CHALLENGE_REQUIRED");
    });

    it("routes plan and whoami CLI commands through safety boundary", async () => {
      const whoamiParsed: ParsedArgs = { subcommands: ["whoami"], flags: {}, options: {} };
      const whoamiRes = await handleWhoami(whoamiParsed, mockAgentContext);
      expect(whoamiRes.data).toBeDefined();
      expect((whoamiRes.data as any).user.id).toBe(USER_ALICE);

      const planParsed: ParsedArgs = { subcommands: ["plan", "morning"], flags: {}, options: {} };
      const planRes = await handlePlan(planParsed, mockAgentContext);
      expect(planRes.data).toBeDefined();
    });

    it("rejects caller spoofing flags across CLI invocations", async () => {
      const spoofedFlags: Array<Record<string, string>> = [
        { user: USER_MALLORY },
        { userId: USER_MALLORY },
        { "user-id": USER_MALLORY },
        { callerId: USER_MALLORY },
        { actor: USER_MALLORY },
        { principal: USER_MALLORY },
      ];

      for (const flags of spoofedFlags) {
        const parsed: ParsedArgs = { subcommands: ["projects", "list"], flags, options: {} };
        await expect(handleProjects(parsed, mockAgentContext)).rejects.toThrow(UsageError);
        await expect(handleProjects(parsed, mockAgentContext)).rejects.toThrow(/prohibited/);
      }
    });
  });

  // =========================================================================
  // 3. SAFE-05: DEEP SECRET SCRUBBING & CREDENTIAL PROTECTION
  // =========================================================================
  describe("3. SAFE-05 Forensic Secret Scrubbing", () => {
    it("scrubs LifeOS agent bearer tokens embedded anywhere inside strings", () => {
      const raw = "Authorization header: Bearer lifeos_ag_secret_tok_1234567890abcdef";
      const scrubbed = scrubString(raw);
      expect(scrubbed).not.toContain("lifeos_ag_secret_tok_1234567890abcdef");
      expect(scrubbed).toContain("Bearer ***REDACTED***");
    });

    it("scrubs standalone lifeos_ag_ tokens embedded in arbitrary text", () => {
      const raw = "Connect to worker using token=lifeos_ag_ab12cd34ef56gh78 and proceed.";
      const scrubbed = scrubString(raw);
      expect(scrubbed).not.toContain("lifeos_ag_ab12cd34ef56gh78");
      expect(scrubbed).toContain("***REDACTED***");
    });

    it("scrubs encrypted secrets prefixed with v1: embedded in strings", () => {
      const raw = "DB secret string is v1:9876543210abcdef0123456789abcdef for testing.";
      const scrubbed = scrubString(raw);
      expect(scrubbed).not.toContain("v1:9876543210abcdef0123456789abcdef");
      expect(scrubbed).toContain("***REDACTED***");
    });

    it("scrubs OpenAI and third-party style API keys", () => {
      const raw = "Use key sk-proj-123456789012345678901234 to call upstream.";
      const scrubbed = scrubString(raw);
      expect(scrubbed).not.toContain("sk-proj-123456789012345678901234");
      expect(scrubbed).toContain("***REDACTED***");
    });

    it("scrubs key-value secret configurations embedded in strings", () => {
      const inputs = [
        "config password=SuperSecretPassword123! end",
        "api_key: SecretKey_ABC_123",
        "apikey=SecretKeyXYZ",
        "secret = HighlyConfidentialCredential",
      ];

      for (const input of inputs) {
        const scrubbed = scrubString(input);
        expect(scrubbed).not.toContain("SuperSecretPassword123!");
        expect(scrubbed).not.toContain("SecretKey_ABC_123");
        expect(scrubbed).not.toContain("SecretKeyXYZ");
        expect(scrubbed).not.toContain("HighlyConfidentialCredential");
        expect(scrubbed).toContain("***REDACTED***");
      }
    });

    it("deeply scrubs sensitive credentials from nested objects, arrays, and keys", () => {
      const sensitivePayload = {
        name: "Security Analysis Task",
        auth: {
          token: "secret-token-value-123",
          password: "my-password",
          nested: {
            apiKey: "key-999-secret",
            items: ["v1:encrypted_payload_1234567890", "Bearer secret_bearer_token"],
          },
        },
        metadata: {
          publicInfo: "safe to log",
          AUTHORIZATION: "Basic dXNlcjpwYXNz",
        },
      };

      const scrubbed = scrubSecrets(sensitivePayload) as any;

      expect(scrubbed.name).toBe("Security Analysis Task");
      expect(scrubbed.metadata.publicInfo).toBe("safe to log");
      expect(scrubbed.auth.token).toBe("***REDACTED***");
      expect(scrubbed.auth.password).toBe("***REDACTED***");
      expect(scrubbed.auth.nested.apiKey).toBe("***REDACTED***");
      expect(scrubbed.auth.nested.items[0]).toBe("***REDACTED***");
      expect(scrubbed.auth.nested.items[1]).not.toContain("secret_bearer_token");
      expect(scrubbed.metadata.AUTHORIZATION).toBe("***REDACTED***");
    });

    it("redacts keys matching credential patterns completely", () => {
      const credentialPayload = {
        credentialList: ["v1:sensitive_token"],
      };
      const scrubbed = scrubSecrets(credentialPayload) as any;
      expect(scrubbed.credentialList).toBe("***REDACTED***");
    });

    it("persists scrubbed arguments in audit logger without secret leakage", async () => {
      await executeAgentOperation({
        context: {
          isAgent: true,
          agent: fullPrivilegeAgent,
          user: { id: USER_ALICE, name: "Alice", email: "alice@lifeos.internal" },
        },
        toolName: "lifeos_list_tasks",
        arguments: {
          filter: "active",
          secretHeader: "Bearer lifeos_ag_secret_leak_attempt",
          credential: "password=TopSecretPassword",
        },
        targetUserId: USER_ALICE,
        executor: async () => ({ results: [] }),
      });

      const auditRecord = mockDb.auditLogs.find((l) => l.toolName === "lifeos_list_tasks");
      expect(auditRecord).toBeDefined();

      const jsonString = JSON.stringify(auditRecord);
      expect(jsonString).not.toContain("lifeos_ag_secret_leak_attempt");
      expect(jsonString).not.toContain("TopSecretPassword");
      expect(jsonString).toContain("***REDACTED***");
    });
  });

  // =========================================================================
  // 4. SAFE-01, SAFE-02: TAMPERING, REPLAY & FAIL-CLOSED INVARIANTS
  // =========================================================================
  describe("4. Tampering, Replay & Fail-Closed Invariants", () => {
    it("fails closed on unclassified or malformed operation names", async () => {
      await expect(
        executeAgentOperation({
          context: {
            isAgent: true,
            agent: fullPrivilegeAgent,
            user: { id: USER_ALICE, name: "Alice", email: "alice@lifeos.internal" },
          },
          toolName: "system.unregistered_dangerous_operation",
          arguments: {},
          targetUserId: USER_ALICE,
          executor: async () => ({ ok: true }),
        })
      ).rejects.toThrow(/Agent permission denied/);
    });

    it("prevents single-use challenge replay attacks", async () => {
      const challenge = await createChallenge({
        userId: USER_ALICE,
        agentTokenId: fullPrivilegeAgent.id,
        operation: "lifeos_delete_task",
        capability: "DESTRUCTIVE",
        resource: "tasks",
        arguments: { id: "task-007" },
      });

      // User approves challenge
      await approveChallenge(USER_ALICE, challenge.id);

      // First consumption succeeds
      const result1 = await executeAgentOperation({
        context: {
          isAgent: true,
          agent: fullPrivilegeAgent,
          user: { id: USER_ALICE, name: "Alice", email: "alice@lifeos.internal" },
        },
        toolName: "lifeos_delete_task",
        arguments: { id: "task-007" },
        challengeId: challenge.id,
        targetUserId: USER_ALICE,
        executor: async () => ({ deleted: true }),
      });
      expect(result1.status).toBe("EXECUTED");

      // Second consumption with the same challenge ID MUST fail
      await expect(
        executeAgentOperation({
          context: {
            isAgent: true,
            agent: fullPrivilegeAgent,
            user: { id: USER_ALICE, name: "Alice", email: "alice@lifeos.internal" },
          },
          toolName: "lifeos_delete_task",
          arguments: { id: "task-007" },
          challengeId: challenge.id,
          targetUserId: USER_ALICE,
          executor: async () => ({ deleted: true }),
        })
      ).rejects.toThrow(ChallengeAlreadyConsumedError);
    });

    it("detects payload tampering between approval and execution", async () => {
      const challenge = await createChallenge({
        userId: USER_ALICE,
        agentTokenId: fullPrivilegeAgent.id,
        operation: "lifeos_delete_task",
        capability: "DESTRUCTIVE",
        resource: "tasks",
        arguments: { id: "task-legitimate" },
      });

      await approveChallenge(USER_ALICE, challenge.id);

      // Attacker attempts to change the argument to a different task
      await expect(
        executeAgentOperation({
          context: {
            isAgent: true,
            agent: fullPrivilegeAgent,
            user: { id: USER_ALICE, name: "Alice", email: "alice@lifeos.internal" },
          },
          toolName: "lifeos_delete_task",
          arguments: { id: "task-tampered-victim" },
          challengeId: challenge.id,
          targetUserId: USER_ALICE,
          executor: async () => ({ deleted: true }),
        })
      ).rejects.toThrow(ChallengeTamperedError);
    });

    it("enforces tenant and user isolation on challenge consumption", async () => {
      const challenge = await createChallenge({
        userId: USER_ALICE,
        agentTokenId: fullPrivilegeAgent.id,
        operation: "lifeos_delete_task",
        capability: "DESTRUCTIVE",
        resource: "tasks",
        arguments: { id: "task-100" },
      });

      await approveChallenge(USER_ALICE, challenge.id);

      // Attacker Mallory attempts to consume Alice's approved challenge
      const malloryAgent: AgentIdentity = {
        ...fullPrivilegeAgent,
        id: "agent-mallory-666",
        userId: USER_MALLORY,
      };

      await expect(
        executeAgentOperation({
          context: {
            isAgent: true,
            agent: malloryAgent,
            user: { id: USER_MALLORY, name: "Mallory", email: "mallory@lifeos.internal" },
          },
          toolName: "lifeos_delete_task",
          arguments: { id: "task-100" },
          challengeId: challenge.id,
          targetUserId: USER_MALLORY,
          executor: async () => ({ deleted: true }),
        })
      ).rejects.toThrow(ChallengeForbiddenError);
    });
  });
});
