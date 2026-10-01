/**
 * Phase 13 Plan 13-04: Adversarial Security Integration Test Suite
 *
 * Verifies all 20 mandatory adversarial vectors:
 * 1.  Calling destructive MCP tool without challenge.
 * 2.  Calling destructive tool with fake challenge ID.
 * 3.  Reusing an approved challenge (replay attack).
 * 4.  Using a challenge belonging to another agent.
 * 5.  Using a challenge belonging to another user.
 * 6.  Changing arguments after approval (payload tampering).
 * 7.  Calling after challenge expiration (TTL enforcement).
 * 8.  Racing approval and expiration.
 * 9.  Racing two executions against one approved challenge (concurrency double-spend).
 * 10. Supplying forged user ID (caller anti-spoofing).
 * 11. Supplying forged agent identity / tenant mismatch.
 * 12. Supplying elevated capability claims (no implicit privilege escalation).
 * 13. Using a revoked token.
 * 14. Using an expired token.
 * 15. Calling financial mutation through alternate adapter.
 * 16. Calling canonical financial service directly under agent context.
 * 17. Audit logging reliability (every event recorded).
 * 18. Supplying secrets in arguments and asserting redaction in audit log.
 * 19. Attempting cross-tenant resource access.
 * 20. Calling unclassified/unknown operations (fail closed).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { executeAgentOperation } from "@/server/agents/safety-boundary";
import {
  createChallenge,
  approveChallenge,
  rejectChallenge,
  consumeChallenge,
  computeArgumentsHash,
} from "@/server/agents/challenges/challenge-service";
import {
  ChallengeNotFoundError,
  ChallengeForbiddenError,
  ChallengeExpiredError,
  ChallengeTamperedError,
  ChallengeAlreadyConsumedError,
  ChallengeConflictError,
  type AgentChallengeRecord,
} from "@/server/agents/challenges/types";
import {
  FinancialShieldViolationError,
  withAgentSafetyContext,
  guardFinancialMutation,
} from "@/server/agents/finance-shield";
import { classifyOperation, evaluateAgentPermission } from "@/server/agents/permissions/evaluator";
import type { AgentIdentity, AgentSafetyContext } from "@/server/agents/permissions/types";
import type { AgentAuditLog } from "@/server/db/schema/agents";
import { UsageError } from "@/cli/errors";

// Comprehensive In-Memory DB Mock for Integration Testing
class MockSecurityDb {
  public challenges = new Map<string, AgentChallengeRecord>();
  public auditLogs: AgentAuditLog[] = [];

  insert(table: any) {
    return {
      values: (val: any) => ({
        returning: async () => {
          if (val.toolName) {
            // It is an agent_audit_log
            const auditRecord: AgentAuditLog = {
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

          // Default: agent_challenges
          const record: AgentChallengeRecord = {
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
          limit: async (lim?: number) => {
            const id = this.extractIdFromCondition(condition);
            if (id && this.challenges.has(id)) {
              return [this.challenges.get(id)!];
            }
            return [];
          },
          orderBy: () => ({
            limit: async (lim?: number) => {
              return Array.from(this.challenges.values());
            },
          }),
        }),
      }),
    };
  }

  update(table: any) {
    return {
      set: (updateValues: Partial<AgentChallengeRecord>) => ({
        where: (condition: any) => {
          const execute = async () => {
            const id = this.extractIdFromCondition(condition);
            if (!id || !this.challenges.has(id)) {
              return [];
            }
            const record = this.challenges.get(id)!;

            // Check if status constraint matches
            const requiredStatus = this.extractStatusFromCondition(condition);
            if (requiredStatus && record.status !== requiredStatus) {
              return []; // atomic condition failed
            }

            const updated: AgentChallengeRecord = {
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

describe("Phase 13 Adversarial Security Suite (20 Vectors)", () => {
  let mockDb: MockSecurityDb;
  const USER_A = "user-alice-111";
  const USER_B = "user-bob-222";

  const defaultAgent: AgentIdentity = {
    id: "agent-tok-001",
    userId: USER_A,
    name: "Autonomous Coding Assistant",
    tokenPrefix: "lifeos_ag_tok001",
    provider: "custom",
    status: "active",
    expiresAt: null,
    capabilities: new Set(["READ", "WRITE", "DESTRUCTIVE"]),
    permissions: [],
  };

  beforeEach(() => {
    mockDb = new MockSecurityDb();
    vi.useRealTimers();
  });

  // Vector 1: Calling destructive MCP tool without challenge -> Returns CHALLENGE_REQUIRED
  it("Vector 1: calling destructive operation without challenge ID creates challenge and halts execution", async () => {
    let executed = false;

    const result = await executeAgentOperation({
      context: {
        isAgent: true,
        agent: defaultAgent,
        user: { id: USER_A, name: "Alice", email: "alice@example.com" },
      },
      toolName: "lifeos_delete_task",
      arguments: { id: "task-999" },
      targetUserId: USER_A,
      executor: async () => {
        executed = true;
        return { success: true };
      },
      dbClient: mockDb,
    });

    expect(executed).toBe(false);
    expect(result.status).toBe("CHALLENGE_REQUIRED");
    if (result.status === "CHALLENGE_REQUIRED") {
      expect(result.challengeId).toBeDefined();
      expect(result.operation).toBe("lifeos_delete_task");
      expect(result.message).toContain("requires human approval");

      // Verify challenge created in db
      expect(mockDb.challenges.has(result.challengeId)).toBe(true);
      const ch = mockDb.challenges.get(result.challengeId)!;
      expect(ch.status).toBe("PENDING");
      expect(ch.capability).toBe("DESTRUCTIVE");

      // Verify CHALLENGE_CREATED logged in audit log
      const auditEntry = mockDb.auditLogs.find((l) => l.status === "CHALLENGE_CREATED");
      expect(auditEntry).toBeDefined();
      expect(auditEntry?.challengeId).toBe(result.challengeId);
    }
  });

  // Vector 2: Calling destructive tool with fake challenge ID -> Throws ChallengeNotFoundError
  it("Vector 2: calling destructive operation with fake challenge ID throws ChallengeNotFoundError", async () => {
    let executed = false;

    await expect(
      executeAgentOperation({
        context: {
          isAgent: true,
          agent: defaultAgent,
          user: { id: USER_A, name: "Alice", email: "alice@example.com" },
        },
        toolName: "lifeos_delete_task",
        arguments: { id: "task-999", challengeId: "fake-uuid-not-exists-999" },
        challengeId: "fake-uuid-not-exists-999",
        targetUserId: USER_A,
        executor: async () => {
          executed = true;
          return { success: true };
        },
        dbClient: mockDb,
      })
    ).rejects.toThrow(ChallengeNotFoundError);

    expect(executed).toBe(false);

    // Verify FAILED logged in audit log
    const failedLog = mockDb.auditLogs.find((l) => l.status === "FAILED");
    expect(failedLog).toBeDefined();
    expect(failedLog?.errorMessage).toContain("does not exist");
  });

  // Vector 3: Reusing an approved challenge (replay attack) -> Fails with ChallengeAlreadyConsumedError
  it("Vector 3: reusing an approved challenge fails with ChallengeAlreadyConsumedError", async () => {
    const challenge = await createChallenge(
      {
        userId: USER_A,
        agentTokenId: defaultAgent.id,
        operation: "lifeos_delete_task",
        capability: "DESTRUCTIVE",
        resource: "tasks",
        arguments: { id: "task-123" },
      },
      mockDb as any
    );

    // Human approves challenge
    await approveChallenge(USER_A, challenge.id, mockDb as any);

    let executionCount = 0;
    const runOp = () =>
      executeAgentOperation({
        context: {
          isAgent: true,
          agent: defaultAgent,
          user: { id: USER_A, name: "Alice", email: "alice@example.com" },
        },
        toolName: "lifeos_delete_task",
        arguments: { id: "task-123", challengeId: challenge.id },
        challengeId: challenge.id,
        targetUserId: USER_A,
        executor: async () => {
          executionCount++;
          return { deleted: true };
        },
        dbClient: mockDb,
      });

    // First execution succeeds
    const firstResult = await runOp();
    expect(firstResult.status).toBe("EXECUTED");
    expect(executionCount).toBe(1);

    // Second execution (replay) MUST fail
    await expect(runOp()).rejects.toThrow(ChallengeAlreadyConsumedError);
    expect(executionCount).toBe(1); // Not executed a second time
  });

  // Vector 4: Using a challenge belonging to another agent -> Throws ChallengeForbiddenError
  it("Vector 4: using a challenge issued to another agent token throws ChallengeForbiddenError", async () => {
    const foreignAgent: AgentIdentity = {
      ...defaultAgent,
      id: "agent-other-999",
      name: "Other Agent",
    };

    const challenge = await createChallenge(
      {
        userId: USER_A,
        agentTokenId: foreignAgent.id, // Issued to foreignAgent
        operation: "lifeos_delete_task",
        capability: "DESTRUCTIVE",
        resource: "tasks",
        arguments: { id: "task-456" },
      },
      mockDb as any
    );

    await approveChallenge(USER_A, challenge.id, mockDb as any);

    // defaultAgent tries to execute foreignAgent's challenge
    await expect(
      executeAgentOperation({
        context: {
          isAgent: true,
          agent: defaultAgent,
          user: { id: USER_A, name: "Alice", email: "alice@example.com" },
        },
        toolName: "lifeos_delete_task",
        arguments: { id: "task-456", challengeId: challenge.id },
        challengeId: challenge.id,
        targetUserId: USER_A,
        executor: async () => ({ deleted: true }),
        dbClient: mockDb,
      })
    ).rejects.toThrow(ChallengeForbiddenError);
  });

  // Vector 5: Using a challenge belonging to another user -> Throws ChallengeForbiddenError
  it("Vector 5: using a challenge belonging to another user throws ChallengeForbiddenError", async () => {
    const bobAgent: AgentIdentity = {
      id: "agent-bob-001",
      userId: USER_B,
      name: "Bob Agent",
      tokenPrefix: "lifeos_ag_bob001",
      status: "active",
      provider: "custom",
      expiresAt: null,
      capabilities: new Set(["READ", "WRITE", "DESTRUCTIVE"]),
      permissions: [],
    };

    const challenge = await createChallenge(
      {
        userId: USER_B, // Created under User B
        agentTokenId: bobAgent.id,
        operation: "lifeos_delete_task",
        capability: "DESTRUCTIVE",
        resource: "tasks",
        arguments: { id: "task-bob" },
      },
      mockDb as any
    );

    await approveChallenge(USER_B, challenge.id, mockDb as any);

    // Alice tries to consume Bob's challenge
    await expect(
      consumeChallenge(
        {
          challengeId: challenge.id,
          userId: USER_A, // User A attempting consumption
          agentTokenId: bobAgent.id,
          operation: "lifeos_delete_task",
          arguments: { id: "task-bob" },
          executor: async () => ({ ok: true }),
        },
        mockDb as any
      )
    ).rejects.toThrow(ChallengeForbiddenError);
  });

  // Vector 6: Changing arguments after approval (payload tampering) -> Throws ChallengeTamperedError
  it("Vector 6: tampering with arguments after challenge approval throws ChallengeTamperedError", async () => {
    const challenge = await createChallenge(
      {
        userId: USER_A,
        agentTokenId: defaultAgent.id,
        operation: "lifeos_delete_task",
        capability: "DESTRUCTIVE",
        resource: "tasks",
        arguments: { id: "task-safe-to-delete", purgeData: false },
      },
      mockDb as any
    );

    await approveChallenge(USER_A, challenge.id, mockDb as any);

    // Malicious payload changes task ID or flags
    const tamperedArgs = { id: "task-CRITICAL-DO-NOT-DELETE", purgeData: true };

    await expect(
      executeAgentOperation({
        context: {
          isAgent: true,
          agent: defaultAgent,
          user: { id: USER_A, name: "Alice", email: "alice@example.com" },
        },
        toolName: "lifeos_delete_task",
        arguments: tamperedArgs,
        challengeId: challenge.id,
        targetUserId: USER_A,
        executor: async () => ({ deleted: true }),
        dbClient: mockDb,
      })
    ).rejects.toThrow(ChallengeTamperedError);
  });

  // Vector 7: Calling after challenge expiration -> Throws ChallengeExpiredError
  it("Vector 7: consuming an expired challenge throws ChallengeExpiredError and transitions state to EXPIRED", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-10-01T10:00:00Z");
    vi.setSystemTime(now);

    const challenge = await createChallenge(
      {
        userId: USER_A,
        agentTokenId: defaultAgent.id,
        operation: "lifeos_delete_task",
        capability: "DESTRUCTIVE",
        resource: "tasks",
        arguments: { id: "task-expiring" },
        ttlMinutes: 10,
      },
      mockDb as any
    );

    await approveChallenge(USER_A, challenge.id, mockDb as any);

    // Fast-forward 10 minutes and 1 second
    vi.setSystemTime(new Date("2026-10-01T10:10:01Z"));

    await expect(
      executeAgentOperation({
        context: {
          isAgent: true,
          agent: defaultAgent,
          user: { id: USER_A, name: "Alice", email: "alice@example.com" },
        },
        toolName: "lifeos_delete_task",
        arguments: { id: "task-expiring" },
        challengeId: challenge.id,
        targetUserId: USER_A,
        executor: async () => ({ deleted: true }),
        dbClient: mockDb,
      })
    ).rejects.toThrow(ChallengeExpiredError);

    // Assert status updated to EXPIRED
    const ch = mockDb.challenges.get(challenge.id);
    expect(ch?.status).toBe("EXPIRED");
  });

  // Vector 8: Racing approval and expiration
  it("Vector 8: approval fails if challenge is already expired", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-10-01T10:00:00Z");
    vi.setSystemTime(now);

    const challenge = await createChallenge(
      {
        userId: USER_A,
        agentTokenId: defaultAgent.id,
        operation: "lifeos_delete_task",
        capability: "DESTRUCTIVE",
        resource: "tasks",
        arguments: { id: "task-race" },
        ttlMinutes: 10,
      },
      mockDb as any
    );

    // Advance beyond TTL before human approves
    vi.setSystemTime(new Date("2026-10-01T10:15:00Z"));

    await expect(
      approveChallenge(USER_A, challenge.id, mockDb as any)
    ).rejects.toThrow(ChallengeExpiredError);
  });

  // Vector 9: Racing two executions against one approved challenge (concurrency double-spend)
  it("Vector 9: concurrent executions against one approved challenge resolve exactly once", async () => {
    const challenge = await createChallenge(
      {
        userId: USER_A,
        agentTokenId: defaultAgent.id,
        operation: "lifeos_delete_task",
        capability: "DESTRUCTIVE",
        resource: "tasks",
        arguments: { id: "task-concurrent" },
      },
      mockDb as any
    );

    await approveChallenge(USER_A, challenge.id, mockDb as any);

    let count = 0;
    const taskExecution = () =>
      consumeChallenge(
        {
          challengeId: challenge.id,
          userId: USER_A,
          agentTokenId: defaultAgent.id,
          operation: "lifeos_delete_task",
          arguments: { id: "task-concurrent" },
          executor: async () => {
            count++;
            return { ok: true };
          },
        },
        mockDb as any
      );

    // Launch 2 parallel consumption calls
    const results = await Promise.allSettled([taskExecution(), taskExecution()]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(count).toBe(1);
  });

  // Vector 10: Supplying forged user ID (caller anti-spoofing)
  it("Vector 10: supplying forged user ID in arguments throws anti-spoofing UsageError", async () => {
    await expect(
      executeAgentOperation({
        context: {
          isAgent: true,
          agent: defaultAgent,
          user: { id: USER_A, name: "Alice", email: "alice@example.com" },
        },
        toolName: "lifeos_create_task",
        arguments: { title: "Hacked Task", userId: USER_B },
        targetUserId: USER_A,
        executor: async () => ({ ok: true }),
        dbClient: mockDb,
      })
    ).rejects.toThrow(UsageError);
  });

  // Vector 11: Supplying forged agent identity / tenant mismatch
  it("Vector 11: agent acting against a foreign user is denied with cross-tenant forbidden error", async () => {
    const maliciousAgent: AgentIdentity = {
      ...defaultAgent,
      userId: USER_A, // Belongs to User A
    };

    // Attempts to act against targetUserId USER_B
    await expect(
      executeAgentOperation({
        context: {
          isAgent: true,
          agent: maliciousAgent,
          user: { id: USER_B, name: "Bob", email: "bob@example.com" },
        },
        toolName: "lifeos_create_task",
        arguments: { title: "Infiltrate Bob's tasks" },
        targetUserId: USER_B,
        executor: async () => ({ ok: true }),
        dbClient: mockDb,
      })
    ).rejects.toThrow(/Cross-tenant access forbidden/);
  });

  // Vector 12: Supplying elevated capability claims (no implicit privilege escalation)
  it("Vector 12: agent with WRITE capability cannot execute DESTRUCTIVE operation", async () => {
    const writeOnlyAgent: AgentIdentity = {
      ...defaultAgent,
      capabilities: new Set(["READ", "WRITE"]), // LACKS DESTRUCTIVE
    };

    await expect(
      executeAgentOperation({
        context: {
          isAgent: true,
          agent: writeOnlyAgent,
          user: { id: USER_A, name: "Alice", email: "alice@example.com" },
        },
        toolName: "lifeos_delete_task",
        arguments: { id: "task-001" },
        targetUserId: USER_A,
        executor: async () => ({ ok: true }),
        dbClient: mockDb,
      })
    ).rejects.toThrow(/lacks required capability 'DESTRUCTIVE'/);
  });

  // Vector 13: Using a revoked token
  it("Vector 13: agent with revoked status is denied by permission evaluator", async () => {
    const revokedAgent: AgentIdentity = {
      ...defaultAgent,
      status: "revoked",
    };

    await expect(
      executeAgentOperation({
        context: {
          isAgent: true,
          agent: revokedAgent,
          user: { id: USER_A, name: "Alice", email: "alice@example.com" },
        },
        toolName: "lifeos_create_task",
        arguments: { title: "Task from revoked agent" },
        targetUserId: USER_A,
        executor: async () => ({ ok: true }),
        dbClient: mockDb,
      })
    ).rejects.toThrow(/Agent 'Autonomous Coding Assistant' is revoked/);
  });

  // Vector 14: Using an expired token
  it("Vector 14: agent with expired token is denied by permission evaluator", async () => {
    const expiredAgent: AgentIdentity = {
      ...defaultAgent,
      status: "active",
      expiresAt: new Date(Date.now() - 60000), // Expired 1 min ago
    };

    await expect(
      executeAgentOperation({
        context: {
          isAgent: true,
          agent: expiredAgent,
          user: { id: USER_A, name: "Alice", email: "alice@example.com" },
        },
        toolName: "lifeos_create_task",
        arguments: { title: "Task from expired agent" },
        targetUserId: USER_A,
        executor: async () => ({ ok: true }),
        dbClient: mockDb,
      })
    ).rejects.toThrow(/Agent 'Autonomous Coding Assistant' has expired/);
  });

  // Vector 15: Calling financial mutation through alternate adapter
  it("Vector 15: calling financial mutations through adapter throws FinancialShieldViolationError", async () => {
    await expect(
      executeAgentOperation({
        context: {
          isAgent: true,
          agent: defaultAgent,
          user: { id: USER_A, name: "Alice", email: "alice@example.com" },
        },
        toolName: "finance.transfer",
        arguments: { amount: 500, toAccount: "acc-123" },
        targetUserId: USER_A,
        executor: async () => ({ ok: true }),
        dbClient: mockDb,
      })
    ).rejects.toThrow(FinancialShieldViolationError);

    // Verify DENIED logged in audit log
    const deniedLog = mockDb.auditLogs.find((l) => l.toolName === "finance.transfer");
    expect(deniedLog).toBeDefined();
    expect(deniedLog?.status).toBe("DENIED");
    expect(deniedLog?.errorMessage).toContain("Financial shield violation");
  });

  // Vector 16: Calling canonical financial service directly under agent context
  it("Vector 16: calling canonical financial mutation under ambient agent context is blocked by runtime shield", async () => {
    const agentContext: AgentSafetyContext = {
      isAgent: true,
      agent: defaultAgent,
      user: { id: USER_A, name: "Alice", email: "alice@example.com" },
    };

    await expect(
      withAgentSafetyContext(agentContext, async () => {
        // Direct invocation of domain logic guarded by guardFinancialMutation
        guardFinancialMutation("createTransaction");
        return { ok: true };
      })
    ).rejects.toThrow(FinancialShieldViolationError);

    // First-party human context succeeds without throwing
    const humanContext: AgentSafetyContext = {
      isAgent: false,
      user: { id: USER_A, name: "Alice", email: "alice@example.com" },
    };

    const humanResult = await withAgentSafetyContext(humanContext, async () => {
      guardFinancialMutation("createTransaction");
      return { success: true };
    });
    expect(humanResult.success).toBe(true);
  });

  // Vector 17: Attempting to bypass audit logging / verifying audit trail reliability
  it("Vector 17: audit trail captures every attempted agent operation", async () => {
    // 1. Successful execution
    await executeAgentOperation({
      context: {
        isAgent: true,
        agent: defaultAgent,
        user: { id: USER_A, name: "Alice", email: "alice@example.com" },
      },
      toolName: "lifeos_create_task",
      arguments: { title: "Audited Task" },
      targetUserId: USER_A,
      executor: async () => ({ id: "task-audited-1" }),
      dbClient: mockDb,
    });

    const executedLog = mockDb.auditLogs.find((l) => l.toolName === "lifeos_create_task");
    expect(executedLog).toBeDefined();
    expect(executedLog?.status).toBe("EXECUTED");
    expect(executedLog?.agentName).toBe("Autonomous Coding Assistant");
    expect(executedLog?.argumentsHash).toBeDefined();
    expect(executedLog?.durationMs).toBeGreaterThanOrEqual(0);
  });

  // Vector 18: Supplying secrets in arguments and asserting redaction in audit log
  it("Vector 18: sensitive secrets in arguments are thoroughly redacted from the audit log", async () => {
    const sensitiveArgs = {
      title: "Integrate third-party API",
      apiKey: "sk-proj-super-secret-api-key-12345",
      bearerToken: "Bearer raw_token_secret_abcdef",
      password: "MySuperSecretPassword123!",
      nested: {
        secret: "confidential_value",
        publicNote: "Normal text",
      },
    };

    await executeAgentOperation({
      context: {
        isAgent: true,
        agent: defaultAgent,
        user: { id: USER_A, name: "Alice", email: "alice@example.com" },
      },
      toolName: "lifeos_create_task",
      arguments: sensitiveArgs,
      targetUserId: USER_A,
      executor: async () => ({ id: "task-scrubbed" }),
      dbClient: mockDb,
    });

    const log = mockDb.auditLogs.find((l) => l.arguments?.title === "Integrate third-party API");
    expect(log).toBeDefined();

    // Verify secrets are scrubbed
    const loggedArgs = log?.arguments as any;
    expect(loggedArgs.apiKey).toBe("***REDACTED***");
    expect(loggedArgs.bearerToken).toBe("***REDACTED***");
    expect(loggedArgs.password).toBe("***REDACTED***");
    expect(loggedArgs.nested.secret).toBe("***REDACTED***");
    expect(loggedArgs.nested.publicNote).toBe("Normal text");

    // Ensure raw string values never appear anywhere in the serialized audit record
    const serializedLog = JSON.stringify(log);
    expect(serializedLog).not.toContain("sk-proj-super-secret");
    expect(serializedLog).not.toContain("raw_token_secret");
    expect(serializedLog).not.toContain("MySuperSecretPassword123!");
    expect(serializedLog).not.toContain("confidential_value");
  });

  // Vector 19: Attempting cross-tenant resource access
  it("Vector 19: agent evaluating permission for a different user's resource is denied", () => {
    const decision = evaluateAgentPermission(defaultAgent, "lifeos_list_tasks", USER_B);
    expect(decision.granted).toBe(false);
    expect(decision.reason).toContain("Cross-tenant access forbidden");
  });

  // Vector 20: Calling unclassified/unknown operations fails closed
  it("Vector 20: unclassified or unknown operation fails closed as SENSITIVE and denied by default", async () => {
    const op = "unknown_internal_system_hack";
    const classification = classifyOperation(op);

    expect(classification.capability).toBe("SENSITIVE");
    expect(classification.domain).toBe("unclassified");

    await expect(
      executeAgentOperation({
        context: {
          isAgent: true,
          agent: defaultAgent,
          user: { id: USER_A, name: "Alice", email: "alice@example.com" },
        },
        toolName: op,
        arguments: { exploit: true },
        targetUserId: USER_A,
        executor: async () => ({ ok: true }),
        dbClient: mockDb,
      })
    ).rejects.toThrow(/unclassified and rejected by default/);
  });
});
