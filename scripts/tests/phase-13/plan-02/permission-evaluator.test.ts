/**
 * Plan 13-02: Multi-Tier Permission Evaluator & Zero-Trust Financial Shield Tests
 *
 * Verifies:
 * 1. 5-Tier capability system: READ, WRITE, EXECUTE, DESTRUCTIVE, SENSITIVE (SAFE-01).
 * 2. Strict privilege separation: WRITE does not imply DESTRUCTIVE; EXECUTE does not imply SENSITIVE.
 * 3. Denial by default on unknown/unclassified operations.
 * 4. Revocation and expiration enforcement.
 * 5. Cross-tenant isolation (User A agent cannot access User B resources).
 * 6. Active zero-trust financial shield blocking financial ledger mutations below MCP/CLI (SAFE-03).
 * 7. Ambient context propagation preventing bypass via direct domain service calls.
 * 8. Read-only financial access permissible under explicit READ capability.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  classifyOperation,
  evaluateAgentPermission,
} from "@/server/agents/permissions/evaluator";
import type { AgentIdentity, AgentCapability } from "@/server/agents/permissions/types";
import {
  isFinancialMutation,
  assertFinancialShield,
  guardFinancialMutation,
  withAgentSafetyContext,
  FinancialShieldViolationError,
} from "@/server/agents/finance-shield";

describe("Plan 13-02: Permission Evaluator & Financial Shield", () => {
  const USER_A = "usr_alice_123";
  const USER_B = "usr_bob_456";

  function createMockAgent(
    overrides?: Partial<AgentIdentity>
  ): AgentIdentity {
    return {
      id: "ag_token_001",
      userId: USER_A,
      name: "Test Agent",
      tokenPrefix: "lifeos_ag_abc12345...",
      provider: "claude",
      status: "active",
      expiresAt: null,
      capabilities: new Set<AgentCapability>(["READ"]),
      permissions: [],
      ...overrides,
    };
  }

  describe("1. Five-Tier Capability Classification & Evaluation (SAFE-01)", () => {
    it("permits READ operations when agent has READ capability", () => {
      const agent = createMockAgent({ capabilities: new Set(["READ"]) });

      const res1 = evaluateAgentPermission(agent, "lifeos_list_tasks", USER_A);
      expect(res1.granted).toBe(true);
      expect(res1.requiresChallenge).toBe(false);
      expect(res1.classification.capability).toBe("READ");

      const res2 = evaluateAgentPermission(agent, "status", USER_A);
      expect(res2.granted).toBe(true);

      const res3 = evaluateAgentPermission(agent, "lifeos_docs_search", USER_A);
      expect(res3.granted).toBe(true);
    });

    it("denies WRITE operations when agent only has READ capability", () => {
      const agent = createMockAgent({ capabilities: new Set(["READ"]) });

      const res = evaluateAgentPermission(agent, "lifeos_create_task", USER_A);
      expect(res.granted).toBe(false);
      expect(res.reason).toContain("lacks required capability 'WRITE'");
      expect(res.classification.capability).toBe("WRITE");
    });

    it("permits WRITE operations when agent has WRITE capability", () => {
      const agent = createMockAgent({ capabilities: new Set(["WRITE"]) });

      const res1 = evaluateAgentPermission(agent, "lifeos_create_task", USER_A);
      expect(res1.granted).toBe(true);
      expect(res1.requiresChallenge).toBe(false);

      const res2 = evaluateAgentPermission(agent, "notes.update", USER_A);
      expect(res2.granted).toBe(true);
    });

    it("strictly prevents privilege escalation: WRITE agent CANNOT perform DESTRUCTIVE operations", () => {
      const writeAgent = createMockAgent({ capabilities: new Set(["WRITE"]) });

      const res = evaluateAgentPermission(writeAgent, "lifeos_delete_task", USER_A);
      expect(res.granted).toBe(false);
      expect(res.reason).toContain("lacks required capability 'DESTRUCTIVE'");
      expect(res.classification.capability).toBe("DESTRUCTIVE");
    });

    it("requires HITL approval challenge for DESTRUCTIVE operations even when granted", () => {
      const destructiveAgent = createMockAgent({
        capabilities: new Set(["WRITE", "DESTRUCTIVE"]),
      });

      const res = evaluateAgentPermission(destructiveAgent, "lifeos_delete_task", USER_A);
      expect(res.granted).toBe(true);
      expect(res.requiresChallenge).toBe(true);
      expect(res.classification.isDestructive).toBe(true);
      expect(res.reason).toContain("requires human approval challenge");
    });

    it("strictly prevents privilege escalation: EXECUTE agent CANNOT perform SENSITIVE operations", () => {
      const execAgent = createMockAgent({ capabilities: new Set(["EXECUTE"]) });

      const res = evaluateAgentPermission(execAgent, "security.updateCredentials", USER_A);
      expect(res.granted).toBe(false);
      expect(res.reason).toContain("lacks required capability 'SENSITIVE'");
      expect(res.classification.capability).toBe("SENSITIVE");
    });

    it("requires HITL approval challenge for SENSITIVE operations when granted", () => {
      const sensitiveAgent = createMockAgent({
        capabilities: new Set(["SENSITIVE"]),
      });

      const res = evaluateAgentPermission(sensitiveAgent, "security.updateCredentials", USER_A);
      expect(res.granted).toBe(true);
      expect(res.requiresChallenge).toBe(true);
      expect(res.classification.isSensitive).toBe(true);
    });

    it("fails closed on unclassified / unknown operations", () => {
      const allCapsAgent = createMockAgent({
        capabilities: new Set(["READ", "WRITE", "EXECUTE", "DESTRUCTIVE", "SENSITIVE"]),
      });

      const res = evaluateAgentPermission(allCapsAgent, "completely.unknown.action", USER_A);
      expect(res.granted).toBe(false);
      expect(res.reason).toContain("unclassified and rejected by default");
    });
  });

  describe("2. Identity, Tenant Isolation & Token State Invariants", () => {
    it("fails closed if agent attempts cross-tenant access to another user's resources", () => {
      const agent = createMockAgent({ userId: USER_A, capabilities: new Set(["READ", "WRITE"]) });

      const res = evaluateAgentPermission(agent, "lifeos_list_tasks", USER_B);
      expect(res.granted).toBe(false);
      expect(res.reason).toContain("Cross-tenant access forbidden");
    });

    it("fails closed when agent token is revoked", () => {
      const revokedAgent = createMockAgent({
        status: "revoked",
        capabilities: new Set(["READ"]),
      });

      const res = evaluateAgentPermission(revokedAgent, "lifeos_list_tasks", USER_A);
      expect(res.granted).toBe(false);
      expect(res.reason).toContain("Agent 'Test Agent' is revoked");
    });

    it("fails closed when agent token has expired (by status or timestamp)", () => {
      const expiredByStatus = createMockAgent({
        status: "expired",
        capabilities: new Set(["READ"]),
      });

      const res1 = evaluateAgentPermission(expiredByStatus, "lifeos_list_tasks", USER_A);
      expect(res1.granted).toBe(false);
      expect(res1.reason).toContain("Agent 'Test Agent' has expired");

      const expiredByDate = createMockAgent({
        status: "active",
        expiresAt: new Date(Date.now() - 60000), // 1 minute ago
        capabilities: new Set(["READ"]),
      });

      const res2 = evaluateAgentPermission(expiredByDate, "lifeos_list_tasks", USER_A);
      expect(res2.granted).toBe(false);
      expect(res2.reason).toContain("Agent 'Test Agent' has expired");
    });

    it("respects explicit granular permission denials", () => {
      const agent = createMockAgent({
        capabilities: new Set(["WRITE"]),
        permissions: [
          {
            capability: "WRITE",
            resource: "notes",
            action: "*",
            allowed: false, // explicitly denied notes write
          },
        ],
      });

      const taskRes = evaluateAgentPermission(agent, "lifeos_create_task", USER_A);
      expect(taskRes.granted).toBe(true);

      const noteRes = evaluateAgentPermission(agent, "lifeos_create_note", USER_A);
      expect(noteRes.granted).toBe(false);
      expect(noteRes.reason).toContain("Explicit permission rule prohibits");
    });
  });

  describe("3. Active Zero-Trust Financial Shield (SAFE-03)", () => {
    it("identifies financial mutations across various formats and verbs", () => {
      expect(isFinancialMutation("finance.createTransaction")).toBe(true);
      expect(isFinancialMutation("finance.updateTransaction")).toBe(true);
      expect(isFinancialMutation("finance.deleteTransaction")).toBe(true);
      expect(isFinancialMutation("finance.createAccount")).toBe(true);
      expect(isFinancialMutation("finance.transfer")).toBe(true);
      expect(isFinancialMutation("createTransaction")).toBe(true);
      expect(isFinancialMutation("deleteAccount")).toBe(true);
      expect(isFinancialMutation("adjustbalance")).toBe(true);
    });

    it("does NOT classify read-only financial queries as mutations", () => {
      expect(isFinancialMutation("finance.summary")).toBe(false);
      expect(isFinancialMutation("finance.getAccount")).toBe(false);
      expect(isFinancialMutation("finance.listTransactions")).toBe(false);
      expect(isFinancialMutation("finance.getBudget")).toBe(false);
    });

    it("permits read-only financial queries for agents with READ capability", () => {
      const readAgent = createMockAgent({ capabilities: new Set(["READ"]) });

      const res = evaluateAgentPermission(readAgent, "finance.summary", USER_A);
      expect(res.granted).toBe(true);
      expect(res.classification.domain).toBe("finance");
      expect(res.classification.isFinancialMutation).toBe(false);
    });

    it("evaluator rejects financial mutation even if agent possesses all capabilities", () => {
      const omniAgent = createMockAgent({
        capabilities: new Set(["READ", "WRITE", "EXECUTE", "DESTRUCTIVE", "SENSITIVE"]),
      });

      const res = evaluateAgentPermission(omniAgent, "finance.createTransaction", USER_A);
      expect(res.granted).toBe(false);
      expect(res.reason).toContain("Financial shield violation");
    });

    it("assertFinancialShield throws FinancialShieldViolationError on agent financial mutation", () => {
      const agentContext = {
        isAgent: true,
        agent: createMockAgent(),
        user: { id: USER_A },
      };

      expect(() => {
        assertFinancialShield(agentContext, "finance.createTransaction");
      }).toThrowError(FinancialShieldViolationError);

      expect(() => {
        assertFinancialShield(agentContext, "deleteAccount");
      }).toThrowError(FinancialShieldViolationError);
    });

    it("assertFinancialShield passes for read-only financial actions", () => {
      const agentContext = {
        isAgent: true,
        agent: createMockAgent(),
        user: { id: USER_A },
      };

      expect(() => {
        assertFinancialShield(agentContext, "finance.summary");
      }).not.toThrow();
    });

    it("assertFinancialShield passes for first-party human users (isAgent: false)", () => {
      const humanContext = {
        isAgent: false,
        user: { id: USER_A },
      };

      expect(() => {
        assertFinancialShield(humanContext, "finance.createTransaction");
      }).not.toThrow();
    });

    it("ambient guardFinancialMutation blocks direct canonical service calls when executed under agent context", async () => {
      const agentContext = {
        isAgent: true,
        agent: createMockAgent(),
        user: { id: USER_A },
      };

      await withAgentSafetyContext(agentContext, async () => {
        expect(() => {
          guardFinancialMutation("createTransaction");
        }).toThrowError(FinancialShieldViolationError);
      });
    });

    it("ambient guardFinancialMutation is a no-op when executed outside agent context", async () => {
      expect(() => {
        guardFinancialMutation("createTransaction");
      }).not.toThrow();
    });
  });
});
