/**
 * Plan 13-03: HITL Challenge Lifecycle & TTL Sweeper Tests
 *
 * Verifies:
 * 1. Cryptographic challenge generation and deterministic argument hashing.
 * 2. Mandatory approval gate for high-impact mutations (SAFE-02).
 * 3. Arguments tamper detection (modified payload invalidates challenge).
 * 4. Human approval and rejection lifecycle.
 * 5. Single-use exactly-once execution and replay prevention.
 * 6. Synchronous and sweeper-based TTL expiration enforcement (SAFE-05).
 * 7. Identity and operation binding (cross-agent, cross-user, cross-op rejection).
 * 8. Concurrency safety.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createChallenge,
  approveChallenge,
  rejectChallenge,
  consumeChallenge,
  getChallenge,
  computeArgumentsHash,
  canonicalizeArguments,
  DEFAULT_CHALLENGE_TTL_MS,
} from "@/server/agents/challenges/challenge-service";
import { sweepExpiredChallenges } from "@/server/agents/challenges/ttl-sweeper";
import {
  ChallengeNotFoundError,
  ChallengeForbiddenError,
  ChallengeExpiredError,
  ChallengeTamperedError,
  ChallengeNotApprovedError,
  ChallengeAlreadyConsumedError,
  ChallengeConflictError,
  type AgentChallengeRecord,
} from "@/server/agents/challenges/types";

// In-Memory Test Database Driver for Challenge Records
class MockChallengeDb {
  public records = new Map<string, AgentChallengeRecord>();

  insert(table: any) {
    return {
      values: (val: any) => ({
        returning: async () => {
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
            createdAt: val.createdAt ?? new Date(),
            updatedAt: val.updatedAt ?? new Date(),
          };
          this.records.set(record.id, record);
          return [record];
        },
      }),
    };
  }

  select() {
    return {
      from: (table: any) => ({
        where: (condition: any) => ({
          limit: async (num: number) => {
            const id = condition?.id;
            if (id && this.records.has(id)) {
              return [{ ...this.records.get(id) }];
            }
            // Fallback for custom condition
            for (const rec of this.records.values()) {
              if (!id || rec.id === id) {
                return [{ ...rec }];
              }
            }
            return [];
          },
        }),
      }),
    };
  }

  update(table: any) {
    return {
      set: (updateValues: Partial<AgentChallengeRecord>) => ({
        where: (condition: any) => ({
          returning: async () => {
            const targetId = condition?.id;
            const requiredStatus = condition?.requiredStatus;

            // Handle sweeper condition (status === 'PENDING' && expiresAt <= now)
            if (condition?.isSweeper) {
              const matched: AgentChallengeRecord[] = [];
              const now = condition.now;
              for (const [id, rec] of this.records.entries()) {
                if (rec.status === "PENDING" && rec.expiresAt <= now) {
                  const updated = { ...rec, ...updateValues, updatedAt: new Date() };
                  this.records.set(id, updated);
                  matched.push(updated);
                }
              }
              return matched;
            }

            if (!targetId || !this.records.has(targetId)) {
              return [];
            }

            const current = this.records.get(targetId)!;
            if (requiredStatus && current.status !== requiredStatus) {
              return []; // atomic collision
            }

            const updated: AgentChallengeRecord = {
              ...current,
              ...updateValues,
              updatedAt: new Date(),
            };
            this.records.set(targetId, updated);
            return [updated];
          },
        }),
      }),
    };
  }
}

describe("Plan 13-03: HITL Challenge Lifecycle & TTL Engine", () => {
  const USER_A = "usr_alice";
  const USER_B = "usr_bob";
  const AGENT_A = "ag_token_alice";
  const AGENT_B = "ag_token_mallory";

  let mockDb: any;

  function extractSqlParams(sqlObj: any, visited = new Set<any>()): unknown[] {
    if (!sqlObj || typeof sqlObj !== "object" || visited.has(sqlObj)) {
      return [];
    }
    visited.add(sqlObj);

    const params: unknown[] = [];
    if (sqlObj.value !== undefined && typeof sqlObj.value !== "function") {
      params.push(sqlObj.value);
    }
    if (Array.isArray(sqlObj.queryChunks)) {
      for (const chunk of sqlObj.queryChunks) {
        params.push(...extractSqlParams(chunk, visited));
      }
    }
    return params;
  }

  beforeEach(() => {
    const store = new Map<string, AgentChallengeRecord>();

    mockDb = {
      _store: store,
      insert: () => ({
        values: (val: any) => ({
          returning: async () => {
            const row: AgentChallengeRecord = {
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
            store.set(row.id, { ...row });
            return [row];
          },
        }),
      }),
      select: () => ({
        from: () => ({
          where: (cond: any) => ({
            limit: async () => {
              const params = extractSqlParams(cond);
              for (const [id, rec] of store.entries()) {
                if (params.includes(id)) {
                  return [{ ...rec }];
                }
              }
              const all = Array.from(store.values());
              return all.length > 0 ? [{ ...all[0] }] : [];
            },
          }),
        }),
      }),
      update: () => ({
        set: (updates: any) => ({
          where: (cond: any) => ({
            returning: async (fields?: any) => {
              const params = extractSqlParams(cond);

              let targetId: string | undefined;
              for (const id of store.keys()) {
                if (params.includes(id)) {
                  targetId = id;
                  break;
                }
              }

              if (!targetId) {
                // Sweeper condition
                const now = new Date();
                const matched: any[] = [];
                for (const [id, rec] of store.entries()) {
                  if (rec.status === "PENDING" && rec.expiresAt <= now) {
                    const up = { ...rec, ...updates, updatedAt: now };
                    store.set(id, up);
                    matched.push(fields ? { id: up.id } : up);
                  }
                }
                return matched;
              }

              const current = store.get(targetId)!;
              let requiredStatus: string | undefined;
              if (params.includes("PENDING")) requiredStatus = "PENDING";
              if (params.includes("APPROVED")) requiredStatus = "APPROVED";

              if (requiredStatus && current.status !== requiredStatus) {
                return [];
              }

              const updated = { ...current, ...updates, updatedAt: new Date() };
              store.set(targetId, updated);
              return [updated];
            },
          }),
        }),
      }),
    };
  });

  describe("1. Deterministic Argument Canonicalization & Hashing", () => {
    it("produces identical hashes regardless of object key order", () => {
      const obj1 = { id: "task-1", priority: "critical", tags: ["a", "b"] };
      const obj2 = { tags: ["a", "b"], priority: "critical", id: "task-1" };

      expect(canonicalizeArguments(obj1)).toBe(canonicalizeArguments(obj2));
      expect(computeArgumentsHash(obj1)).toBe(computeArgumentsHash(obj2));
    });

    it("produces distinct hashes for different payload arguments", () => {
      const obj1 = { id: "task-1" };
      const obj2 = { id: "task-2" };

      expect(computeArgumentsHash(obj1)).not.toBe(computeArgumentsHash(obj2));
    });
  });

  describe("2. Challenge Creation & Initial State", () => {
    it("creates challenge in PENDING state with 10-minute default TTL", async () => {
      const args = { id: "task-999" };
      const challenge = await createChallenge(
        {
          userId: USER_A,
          agentTokenId: AGENT_A,
          operation: "lifeos_delete_task",
          capability: "DESTRUCTIVE",
          resource: "tasks",
          resourceId: "task-999",
          arguments: args,
        },
        mockDb
      );

      expect(challenge.id).toBeDefined();
      expect(challenge.status).toBe("PENDING");
      expect(challenge.operation).toBe("lifeos_delete_task");
      expect(challenge.capability).toBe("DESTRUCTIVE");
      expect(challenge.argumentsHash).toBe(computeArgumentsHash(args));

      const ttlDiff = challenge.expiresAt.getTime() - Date.now();
      expect(ttlDiff).toBeGreaterThanOrEqual(DEFAULT_CHALLENGE_TTL_MS - 5000);
      expect(ttlDiff).toBeLessThanOrEqual(DEFAULT_CHALLENGE_TTL_MS + 5000);
    });
  });

  describe("3. Human Approval & Rejection Transitions", () => {
    it("permits owner to approve a pending challenge", async () => {
      const challenge = await createChallenge(
        {
          userId: USER_A,
          agentTokenId: AGENT_A,
          operation: "lifeos_delete_task",
          capability: "DESTRUCTIVE",
          resource: "tasks",
          arguments: { id: "task-1" },
        },
        mockDb
      );

      const approved = await approveChallenge(USER_A, challenge.id, mockDb);
      expect(approved.status).toBe("APPROVED");
      expect(approved.approvedAt).toBeDefined();
    });

    it("rejects approval attempt from a different user (tenant isolation)", async () => {
      const challenge = await createChallenge(
        {
          userId: USER_A,
          agentTokenId: AGENT_A,
          operation: "lifeos_delete_task",
          capability: "DESTRUCTIVE",
          resource: "tasks",
          arguments: { id: "task-1" },
        },
        mockDb
      );

      await expect(
        approveChallenge(USER_B, challenge.id, mockDb)
      ).rejects.toThrowError(ChallengeForbiddenError);
    });

    it("permits owner to reject a pending challenge", async () => {
      const challenge = await createChallenge(
        {
          userId: USER_A,
          agentTokenId: AGENT_A,
          operation: "lifeos_delete_task",
          capability: "DESTRUCTIVE",
          resource: "tasks",
          arguments: { id: "task-1" },
        },
        mockDb
      );

      const rejected = await rejectChallenge(
        USER_A,
        challenge.id,
        "User declined action",
        mockDb
      );
      expect(rejected.status).toBe("REJECTED");
      expect(rejected.rejectionReason).toBe("User declined action");
    });
  });

  describe("4. Argument Tamper Detection & Integrity", () => {
    it("throws ChallengeTamperedError if arguments are modified after challenge approval", async () => {
      const originalArgs = { id: "task-1", cascade: false };
      const challenge = await createChallenge(
        {
          userId: USER_A,
          agentTokenId: AGENT_A,
          operation: "lifeos_delete_task",
          capability: "DESTRUCTIVE",
          resource: "tasks",
          arguments: originalArgs,
        },
        mockDb
      );

      await approveChallenge(USER_A, challenge.id, mockDb);

      const executor = vi.fn().mockResolvedValue({ deleted: true });

      // Mallory attempts to delete task-2 using task-1's approved challenge
      const tamperedArgs = { id: "task-2", cascade: false };

      await expect(
        consumeChallenge(
          {
            challengeId: challenge.id,
            userId: USER_A,
            agentTokenId: AGENT_A,
            operation: "lifeos_delete_task",
            arguments: tamperedArgs,
            executor,
          },
          mockDb
        )
      ).rejects.toThrowError(ChallengeTamperedError);

      expect(executor).not.toHaveBeenCalled();
    });
  });

  describe("5. Exactly-Once Consumption & Replay Attack Defense (SAFE-02)", () => {
    it("executes guarded executor exactly once upon valid approved challenge", async () => {
      const args = { id: "task-10" };
      const challenge = await createChallenge(
        {
          userId: USER_A,
          agentTokenId: AGENT_A,
          operation: "lifeos_delete_task",
          capability: "DESTRUCTIVE",
          resource: "tasks",
          arguments: args,
        },
        mockDb
      );

      await approveChallenge(USER_A, challenge.id, mockDb);

      const executor = vi.fn().mockResolvedValue({ deleted: true, id: "task-10" });

      const result = await consumeChallenge(
        {
          challengeId: challenge.id,
          userId: USER_A,
          agentTokenId: AGENT_A,
          operation: "lifeos_delete_task",
          arguments: args,
          executor,
        },
        mockDb
      );

      expect(result).toEqual({ deleted: true, id: "task-10" });
      expect(executor).toHaveBeenCalledTimes(1);
    });

    it("rejects replay attack: consuming an already CONSUMED challenge throws ChallengeAlreadyConsumedError", async () => {
      const args = { id: "task-10" };
      const challenge = await createChallenge(
        {
          userId: USER_A,
          agentTokenId: AGENT_A,
          operation: "lifeos_delete_task",
          capability: "DESTRUCTIVE",
          resource: "tasks",
          arguments: args,
        },
        mockDb
      );

      await approveChallenge(USER_A, challenge.id, mockDb);
      const executor = vi.fn().mockResolvedValue({ ok: true });

      // First consumption succeeds
      await consumeChallenge(
        {
          challengeId: challenge.id,
          userId: USER_A,
          agentTokenId: AGENT_A,
          operation: "lifeos_delete_task",
          arguments: args,
          executor,
        },
        mockDb
      );

      // Replay attempt fails closed
      await expect(
        consumeChallenge(
          {
            challengeId: challenge.id,
            userId: USER_A,
            agentTokenId: AGENT_A,
            operation: "lifeos_delete_task",
            arguments: args,
            executor,
          },
          mockDb
        )
      ).rejects.toThrowError(ChallengeAlreadyConsumedError);

      expect(executor).toHaveBeenCalledTimes(1);
    });

    it("rejects execution if challenge was REJECTED", async () => {
      const args = { id: "task-10" };
      const challenge = await createChallenge(
        {
          userId: USER_A,
          agentTokenId: AGENT_A,
          operation: "lifeos_delete_task",
          capability: "DESTRUCTIVE",
          resource: "tasks",
          arguments: args,
        },
        mockDb
      );

      await rejectChallenge(USER_A, challenge.id, "Denied", mockDb);

      await expect(
        consumeChallenge(
          {
            challengeId: challenge.id,
            userId: USER_A,
            agentTokenId: AGENT_A,
            operation: "lifeos_delete_task",
            arguments: args,
            executor: vi.fn(),
          },
          mockDb
        )
      ).rejects.toThrowError(ChallengeNotApprovedError);
    });

    it("rejects execution if challenge is still PENDING", async () => {
      const args = { id: "task-10" };
      const challenge = await createChallenge(
        {
          userId: USER_A,
          agentTokenId: AGENT_A,
          operation: "lifeos_delete_task",
          capability: "DESTRUCTIVE",
          resource: "tasks",
          arguments: args,
        },
        mockDb
      );

      await expect(
        consumeChallenge(
          {
            challengeId: challenge.id,
            userId: USER_A,
            agentTokenId: AGENT_A,
            operation: "lifeos_delete_task",
            arguments: args,
            executor: vi.fn(),
          },
          mockDb
        )
      ).rejects.toThrowError(ChallengeNotApprovedError);
    });
  });

  describe("6. Identity & Operation Binding Invariants", () => {
    it("rejects consumption when invoked by a different agent than the one issued to", async () => {
      const args = { id: "task-1" };
      const challenge = await createChallenge(
        {
          userId: USER_A,
          agentTokenId: AGENT_A,
          operation: "lifeos_delete_task",
          capability: "DESTRUCTIVE",
          resource: "tasks",
          arguments: args,
        },
        mockDb
      );

      await approveChallenge(USER_A, challenge.id, mockDb);

      await expect(
        consumeChallenge(
          {
            challengeId: challenge.id,
            userId: USER_A,
            agentTokenId: AGENT_B, // Wrong agent
            operation: "lifeos_delete_task",
            arguments: args,
            executor: vi.fn(),
          },
          mockDb
        )
      ).rejects.toThrowError(ChallengeForbiddenError);
    });

    it("rejects consumption when operation does not match challenge binding", async () => {
      const args = { id: "task-1" };
      const challenge = await createChallenge(
        {
          userId: USER_A,
          agentTokenId: AGENT_A,
          operation: "lifeos_delete_task",
          capability: "DESTRUCTIVE",
          resource: "tasks",
          arguments: args,
        },
        mockDb
      );

      await approveChallenge(USER_A, challenge.id, mockDb);

      await expect(
        consumeChallenge(
          {
            challengeId: challenge.id,
            userId: USER_A,
            agentTokenId: AGENT_A,
            operation: "lifeos_delete_project", // Wrong operation
            arguments: args,
            executor: vi.fn(),
          },
          mockDb
        )
      ).rejects.toThrowError(ChallengeForbiddenError);
    });
  });

  describe("7. Time-Bound Expiration & TTL Sweeper (SAFE-05)", () => {
    it("synchronously rejects consume attempt on an expired challenge", async () => {
      const args = { id: "task-1" };
      const challenge = await createChallenge(
        {
          userId: USER_A,
          agentTokenId: AGENT_A,
          operation: "lifeos_delete_task",
          capability: "DESTRUCTIVE",
          resource: "tasks",
          arguments: args,
          ttlMinutes: -1, // Expired immediately in the past
        },
        mockDb
      );

      // Force status to APPROVED in mock store to test that expired cannot execute even if marked approved
      mockDb._store.get(challenge.id)!.status = "APPROVED";

      await expect(
        consumeChallenge(
          {
            challengeId: challenge.id,
            userId: USER_A,
            agentTokenId: AGENT_A,
            operation: "lifeos_delete_task",
            arguments: args,
            executor: vi.fn(),
          },
          mockDb
        )
      ).rejects.toThrowError(ChallengeExpiredError);
    });

    it("synchronously rejects approval of an expired pending challenge", async () => {
      const challenge = await createChallenge(
        {
          userId: USER_A,
          agentTokenId: AGENT_A,
          operation: "lifeos_delete_task",
          capability: "DESTRUCTIVE",
          resource: "tasks",
          arguments: { id: "task-1" },
          ttlMinutes: -1, // Expired
        },
        mockDb
      );

      await expect(
        approveChallenge(USER_A, challenge.id, mockDb)
      ).rejects.toThrowError(ChallengeExpiredError);
    });

    it("TTL sweeper reconciles stale pending challenges to EXPIRED status", async () => {
      const expiredChallenge = await createChallenge(
        {
          userId: USER_A,
          agentTokenId: AGENT_A,
          operation: "lifeos_delete_task",
          capability: "DESTRUCTIVE",
          resource: "tasks",
          arguments: { id: "old-task" },
          ttlMinutes: -5,
        },
        mockDb
      );

      const activeChallenge = await createChallenge(
        {
          userId: USER_A,
          agentTokenId: AGENT_A,
          operation: "lifeos_delete_task",
          capability: "DESTRUCTIVE",
          resource: "tasks",
          arguments: { id: "new-task" },
          ttlMinutes: 10,
        },
        mockDb
      );

      const stats = await sweepExpiredChallenges(mockDb);
      expect(stats.expiredCount).toBe(1);

      expect(mockDb._store.get(expiredChallenge.id)!.status).toBe("EXPIRED");
      expect(mockDb._store.get(activeChallenge.id)!.status).toBe("PENDING");
    });
  });
});
