/**
 * Phase 14 Plan 14-03: Transactional Audit Coupling & Rollback Guarantees
 *
 * Verifies that:
 * 1. Normal Case: Mutation + Audit = COMMIT. Both domain state and audit record persist.
 * 2. Audit Failure: Mutation + Audit Failure = ROLLBACK. If audit persistence fails, the mutation must NOT remain committed.
 * 3. Audit Constraint Violation: Mutation + Constraint Violation = ROLLBACK.
 * 4. Audit Serialization Failure: Mutation + Serialization Failure = ROLLBACK.
 * 5. Null Byte Sanitization: Arguments with '\u0000' are safely sanitized without crashing JSONB/TEXT columns.
 * 6. No Swallowed Exceptions: Audit failures throw immediately to caller and are never silently caught.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { executeAgentOperation } from "@/server/agents/safety-boundary";
import * as attributionLogger from "@/server/agents/audit/attribution-logger";
import { scrubString, scrubSecrets } from "@/server/agents/audit/attribution-logger";
import type { AgentSafetyContext } from "@/server/agents/permissions/types";

describe("Phase 14 Plan 14-03: Transactional Audit Coupling & Rollback Guarantees", () => {
  const testUserId = "user-14-03-test";
  const agentContext: AgentSafetyContext = {
    isAgent: true,
    user: { id: testUserId },
    agent: {
      id: "agent-14-03-token-id",
      userId: testUserId,
      name: "Transactional Test Agent",
      tokenPrefix: "lifeos_ag_test",
      provider: "test_runner",
      status: "active",
      expiresAt: null,
      capabilities: new Set(["READ", "WRITE", "EXECUTE", "DESTRUCTIVE"]),
      permissions: [],
    },
    provider: "test_runner",
    sessionId: "session-14-03",
  };

  class MockTransactionalDb {
    public committedState: Record<string, unknown> = {};
    public stagedState: Record<string, unknown> = {};
    public auditLogs: any[] = [];
    public inTransaction = false;
    public shouldFailAudit = false;
    public auditFailureError = new Error("Simulated audit disk failure / network partition");

    async transaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
      this.inTransaction = true;
      // Snapshot current state for rollback
      const rollbackSnapshot = { ...this.stagedState };
      const rollbackAuditCount = this.auditLogs.length;

      try {
        const result = await callback(this);
        // On success, commit staged state
        this.committedState = { ...this.stagedState };
        this.inTransaction = false;
        return result;
      } catch (err) {
        // Rollback state
        this.stagedState = { ...rollbackSnapshot };
        this.auditLogs = this.auditLogs.slice(0, rollbackAuditCount);
        this.inTransaction = false;
        throw err;
      }
    }

    insert(table: any) {
      return {
        values: (val: any) => ({
          returning: async () => {
            if (val.toolName) {
              // Audit log insertion
              if (this.shouldFailAudit) {
                throw this.auditFailureError;
              }
              const row = {
                id: `audit-${Math.random().toString(36).slice(2)}`,
                ...val,
                createdAt: new Date(),
              };
              this.auditLogs.push(row);
              return [row];
            }

            // Other table (e.g. domain mutation)
            return [val];
          },
        }),
      };
    }

    select() {
      return {
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      };
    }
  }

  let mockDb: MockTransactionalDb;

  beforeEach(() => {
    mockDb = new MockTransactionalDb();
    vi.restoreAllMocks();
  });

  describe("1. Transactional Coupling (Normal vs Audit Failure)", () => {
    it("Normal Case: Mutation + Audit = COMMIT (both mutation state and audit row persist)", async () => {
      let mutationRan = false;

      const result = await executeAgentOperation({
        context: agentContext,
        toolName: "tasks.create",
        arguments: { title: "Durable Task Alpha", priority: "high" },
        targetUserId: testUserId,
        dbClient: mockDb,
        executor: async (tx: any) => {
          mutationRan = true;
          tx.stagedState["task:1"] = { id: "task:1", title: "Durable Task Alpha" };
          return { id: "task:1", title: "Durable Task Alpha" };
        },
      });

      expect(result.status).toBe("EXECUTED");
      expect(mutationRan).toBe(true);
      // State is committed
      expect(mockDb.committedState["task:1"]).toEqual({ id: "task:1", title: "Durable Task Alpha" });
      // Audit log row exists
      expect(mockDb.auditLogs.length).toBe(1);
      expect(mockDb.auditLogs[0].toolName).toBe("tasks.create");
      expect(mockDb.auditLogs[0].status).toBe("EXECUTED");
    });

    it("Audit Failure: Mutation + Audit Failure = ROLLBACK (state changes are completely reverted)", async () => {
      mockDb.shouldFailAudit = true;
      let mutationRan = false;

      await expect(
        executeAgentOperation({
          context: agentContext,
          toolName: "tasks.create",
          arguments: { title: "Ephemeral Task To Rollback" },
          targetUserId: testUserId,
          dbClient: mockDb,
          executor: async (tx: any) => {
            mutationRan = true;
            tx.stagedState["task:uncommitted"] = { id: "task:uncommitted", title: "Ephemeral Task To Rollback" };
            return { id: "task:uncommitted" };
          },
        })
      ).rejects.toThrow("Simulated audit disk failure / network partition");

      // Mutation did execute during transaction attempt
      expect(mutationRan).toBe(true);
      // But because audit failed, transaction ROLLED BACK! State is NOT committed!
      expect(mockDb.committedState["task:uncommitted"]).toBeUndefined();
      expect(mockDb.stagedState["task:uncommitted"]).toBeUndefined();
      expect(mockDb.auditLogs.length).toBe(0);
    });

    it("Audit Constraint Violation: Mutation + Constraint Error = ROLLBACK", async () => {
      mockDb.shouldFailAudit = true;
      mockDb.auditFailureError = new Error('null value in column "operation" violates not-null constraint');

      await expect(
        executeAgentOperation({
          context: agentContext,
          toolName: "tasks.create",
          arguments: { title: "Constraint Test Task" },
          targetUserId: testUserId,
          dbClient: mockDb,
          executor: async (tx: any) => {
            tx.stagedState["task:constraint_test"] = { created: true };
            return { ok: true };
          },
        })
      ).rejects.toThrow(/violates not-null constraint/);

      // Invariant: uncommitted mutation state is wiped out
      expect(mockDb.committedState["task:constraint_test"]).toBeUndefined();
      expect(mockDb.stagedState["task:constraint_test"]).toBeUndefined();
    });

    it("Audit Serialization Failure: Non-serializable arguments trigger ROLLBACK", async () => {
      // Mock logAgentAudit to simulate a JSONB serialization failure (e.g. invalid type or Postgres encoding error)
      const logSpy = vi.spyOn(attributionLogger, "logAgentAudit").mockRejectedValueOnce(
        new Error('unsupported Unicode escape sequence in JSON: "\\u0000"')
      );

      await expect(
        executeAgentOperation({
          context: agentContext,
          toolName: "tasks.create",
          arguments: { malicious: "null\u0000byte" },
          targetUserId: testUserId,
          dbClient: mockDb,
          executor: async (tx: any) => {
            tx.stagedState["task:malicious"] = { tainted: true };
            return { ok: true };
          },
        })
      ).rejects.toThrow('unsupported Unicode escape sequence in JSON: "\\u0000"');

      expect(mockDb.committedState["task:malicious"]).toBeUndefined();
      expect(mockDb.stagedState["task:malicious"]).toBeUndefined();
      logSpy.mockRestore();
    });
  });

  describe("2. JSONB Null Byte Sanitization & Secret Scrubbing", () => {
    it("scrubString removes null bytes without corrupting safe characters", () => {
      const dirty = "safe_start_\u0000_mid_\\u0000_end";
      const clean = scrubString(dirty);
      expect(clean).toBe("safe_start__mid__end");
      expect(clean).not.toContain("\u0000");
      expect(clean).not.toContain("\\u0000");
    });

    it("scrubSecrets recursively sanitizes null bytes across nested objects and arrays", () => {
      const nested = {
        taskName: "Task with\u0000 null byte",
        tags: ["tag1\u0000", "safe_tag"],
        metadata: {
          inner: "inner\u0000value",
          token: "secret_value_123",
        },
      };

      const result = scrubSecrets(nested) as any;
      expect(result.taskName).toBe("Task with null byte");
      expect(result.tags[0]).toBe("tag1");
      expect(result.tags[1]).toBe("safe_tag");
      expect(result.metadata.inner).toBe("innervalue");
      expect(result.metadata.token).toBe("***REDACTED***");
    });
  });

  describe("3. No Swallowed Audit Exceptions Invariant", () => {
    it("proves that audit errors are NOT caught or swallowed in executeAgentOperation", async () => {
      const customAuditError = new Error("FATAL_AUDIT_DISK_FULL");
      const logSpy = vi.spyOn(attributionLogger, "logAgentAudit").mockRejectedValueOnce(customAuditError);

      await expect(
        executeAgentOperation({
          context: agentContext,
          toolName: "tasks.create",
          arguments: { title: "Any Task" },
          targetUserId: testUserId,
          dbClient: mockDb,
          executor: async () => ({ id: "123" }),
        })
      ).rejects.toThrow("FATAL_AUDIT_DISK_FULL");

      logSpy.mockRestore();
    });
  });
});
