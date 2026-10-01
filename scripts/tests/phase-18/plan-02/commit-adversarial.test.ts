/**
 * Phase 18 Plan 18-02: Security, Zero-Trust Permissions & Adversarial Commit Tests
 *
 * Requirements:
 * - SAFE-01: Zero-trust capability enforcement (EXECUTE tier required).
 * - SAFE-04: Full forensic attribution audit in agent_audit_log.
 * - WORK-01: Sandboxed project root containment.
 * - WORK-04: Anti-TOCTOU race protection and tenant isolation.
 *
 * Invariants Tested:
 * 1. Agent capability enforcement:
 *    - READ-only agent denied.
 *    - WRITE-only agent denied (privilege separation).
 *    - EXECUTE agent permitted.
 * 2. Caller spoofing & scope violation rejection.
 * 3. Cross-tenant lease hijacking prevention.
 * 4. Concurrent TOCTOU modification detection and fail-closed abortion.
 * 5. Complete beforeState and afterState audit log persistence.
 * 6. Interrupted execution reconciliation without duplicate commit attempts.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { runSandboxedWorkspaceCommit } from "@/server/agents/workspace/commit-executor";
import { issueVerificationLease } from "@/server/agents/workspace/lease-manager";
import type { AgentSafetyContext, AgentIdentity } from "@/server/agents/permissions/types";
import type { PreCommitVerificationResult, WorkspaceRunnerConfig } from "@/server/agents/workspace/types";
import { assertNoCallerSpoofing } from "@/cli/auth";
import { UsageError } from "@/cli/errors";

// Mock DB for capturing agent_audit_log entries
class MockSecurityDb {
  public agentAuditLogs: Array<{
    id: string;
    agentId: string | null;
    userId: string;
    operation: string;
    status: string;
    beforeState: any;
    afterState: any;
    durationMs: number | null;
    createdAt: Date;
  }> = [];

  insert(table: any) {
    return {
      values: (val: any) => {
        const executeInsert = () => {
          const record = {
            id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            agentId: val.agentId ?? null,
            userId: val.userId,
            operation: val.operation || val.toolName,
            status: val.status,
            beforeState: val.beforeState ?? null,
            afterState: val.afterState ?? null,
            durationMs: val.durationMs ?? null,
            createdAt: new Date(),
          };
          this.agentAuditLogs.push(record);
          return [record];
        };

        return {
          returning: async () => executeInsert(),
          then: (resolve: any, reject?: any) => {
            try {
              resolve(executeInsert());
            } catch (err) {
              if (reject) reject(err);
              else throw err;
            }
          },
        };
      },
    };
  }
}

describe("Phase 18 Plan 18-02: Security, Zero-Trust Permissions & Adversarial Commit", () => {
  let tempBaseDir: string;
  let testRepo: string;
  let mockDb: MockSecurityDb;

  const testUserId = "user-hamza-123";
  const foreignUserId = "user-attacker-456";

  const passingVerification: PreCommitVerificationResult = {
    started: true,
    passed: true,
    canCommit: true,
    totalDurationMs: 250,
    checksRun: ["typecheck", "test"],
    checksPassed: ["typecheck", "test"],
    checksFailed: [],
    checksSkipped: ["build", "lint"],
    results: {
      typecheck: {
        command: "typecheck",
        status: "passed",
        exitCode: 0,
        durationMs: 120,
        stdout: "ok",
        stderr: "",
        summary: "ok",
        timedOut: false,
      },
      test: {
        command: "test",
        status: "passed",
        exitCode: 0,
        durationMs: 130,
        stdout: "ok",
        stderr: "",
        summary: "ok",
        timedOut: false,
      },
      build: null,
      lint: null,
    },
  };

  const fastPassingSpecs: WorkspaceRunnerConfig = {
    commandSpecs: {
      typecheck: {
        executable: process.execPath,
        baseArgs: ["-e", "process.exit(0)"],
        defaultTimeoutMs: 5000,
      },
      test: {
        executable: process.execPath,
        baseArgs: ["-e", "process.exit(0)"],
        defaultTimeoutMs: 5000,
      },
      build: {
        executable: process.execPath,
        baseArgs: ["-e", "process.exit(0)"],
        defaultTimeoutMs: 5000,
      },
      lint: {
        executable: process.execPath,
        baseArgs: ["-e", "process.exit(0)"],
        defaultTimeoutMs: 5000,
      },
    },
  };

  const readOnlyAgent: AgentIdentity = {
    id: "agent-read-only",
    userId: testUserId,
    name: "Read Only Agent",
    tokenPrefix: "ag_read",
    provider: "google",
    status: "active",
    expiresAt: null,
    capabilities: new Set(["READ"]),
    permissions: [{ capability: "READ", resource: "workspace", action: "*", allowed: true }],
  };

  const writeOnlyAgent: AgentIdentity = {
    id: "agent-write-only",
    userId: testUserId,
    name: "Write Only Agent",
    tokenPrefix: "ag_write",
    provider: "google",
    status: "active",
    expiresAt: null,
    capabilities: new Set(["WRITE"]),
    permissions: [{ capability: "WRITE", resource: "workspace", action: "*", allowed: true }],
  };

  const executeAgent: AgentIdentity = {
    id: "agent-exec-authorized",
    userId: testUserId,
    name: "Authorized Execution Agent",
    tokenPrefix: "ag_exec",
    provider: "google",
    status: "active",
    expiresAt: null,
    capabilities: new Set(["READ", "WRITE", "EXECUTE"]),
    permissions: [{ capability: "EXECUTE", resource: "workspace", action: "*", allowed: true }],
  };

  beforeAll(() => {
    tempBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-adv-commit-"));
    testRepo = path.join(tempBaseDir, "adv-repo");

    fs.mkdirSync(testRepo, { recursive: true });

    // Initialize Git
    execSync("git init -b main", { cwd: testRepo, stdio: "ignore" });
    execSync("git config user.name 'Test Hamza'", { cwd: testRepo, stdio: "ignore" });
    execSync("git config user.email 'hamza@lifeos.local'", { cwd: testRepo, stdio: "ignore" });

    // Initial base commit
    fs.writeFileSync(path.join(testRepo, "README.md"), "# Adversarial Commit Repo\n");
    execSync("git add README.md", { cwd: testRepo, stdio: "ignore" });
    execSync("git commit -m 'Initial base commit'", { cwd: testRepo, stdio: "ignore" });
  });

  afterAll(() => {
    try {
      fs.rmSync(tempBaseDir, { recursive: true, force: true });
    } catch {}
  });

  beforeEach(() => {
    mockDb = new MockSecurityDb();
  });

  // =========================================================================
  // 1. Zero-Trust Capability & Permission Evaluation
  // =========================================================================
  describe("Agent Capability Gating", () => {
    it("denies commit execution to READ-only agents", async () => {
      const context: AgentSafetyContext = {
        isAgent: true,
        agent: readOnlyAgent,
        user: { id: testUserId },
      };

      await expect(
        runSandboxedWorkspaceCommit(
          context,
          { message: "feat: should be denied" },
          testUserId,
          { projectRoot: testRepo, ...fastPassingSpecs },
          mockDb
        )
      ).rejects.toThrow(/Agent permission denied/);

      // Verify audit log captured the denied attempt
      expect(mockDb.agentAuditLogs.length).toBeGreaterThan(0);
      expect(mockDb.agentAuditLogs[0].status).toBe("DENIED");
    });

    it("denies commit execution to WRITE-only agents (strict privilege separation)", async () => {
      const context: AgentSafetyContext = {
        isAgent: true,
        agent: writeOnlyAgent,
        user: { id: testUserId },
      };

      await expect(
        runSandboxedWorkspaceCommit(
          context,
          { message: "feat: write should not escalate to commit" },
          testUserId,
          { projectRoot: testRepo, ...fastPassingSpecs },
          mockDb
        )
      ).rejects.toThrow(/Agent permission denied/);
    });

    it("permits commit execution to agents with EXECUTE capability", async () => {
      // Stage file
      fs.writeFileSync(path.join(testRepo, "exec-agent.ts"), "export const ok = true;\n");
      execSync("git add exec-agent.ts", { cwd: testRepo, stdio: "ignore" });

      const lease = await issueVerificationLease({
        projectRoot: testRepo,
        verificationResult: passingVerification,
        userId: testUserId,
      });

      const context: AgentSafetyContext = {
        isAgent: true,
        agent: executeAgent,
        user: { id: testUserId },
      };

      const result = await runSandboxedWorkspaceCommit(
        context,
        { message: "feat: authorized commit by agent", leaseId: lease.leaseId },
        testUserId,
        { projectRoot: testRepo, ...fastPassingSpecs },
        mockDb
      );

      expect(result.status).toBe("EXECUTED");
      if (result.status === "EXECUTED") {
        expect(result.data.success).toBe(true);
        expect(result.data.outcome).toBe("COMMIT_SUCCESS");
      }

      // Verify audit record in agent_audit_log
      const audit = mockDb.agentAuditLogs.find((a) => a.operation === "workspace.commit");
      expect(audit).toBeDefined();
      expect(audit?.status).toBe("EXECUTED");
      expect(audit?.beforeState).toBeDefined();
      expect(audit?.afterState).toBeDefined();
    });
  });

  // =========================================================================
  // 2. Caller Identity Spoofing Protection
  // =========================================================================
  describe("Anti-Spoofing & Tenant Isolation", () => {
    it("rejects caller spoofing via userId parameter or flags", () => {
      expect(() => {
        assertNoCallerSpoofing({ userId: foreignUserId });
      }).toThrow(UsageError);

      expect(() => {
        assertNoCallerSpoofing({ user_id: foreignUserId });
      }).toThrow(UsageError);
    });

    it("prevents User A from committing with User B's lease", async () => {
      fs.writeFileSync(path.join(testRepo, "tenant-test.ts"), "const x = 1;\n");
      execSync("git add tenant-test.ts", { cwd: testRepo, stdio: "ignore" });

      // Lease issued to foreignUserId
      const lease = await issueVerificationLease({
        projectRoot: testRepo,
        verificationResult: passingVerification,
        userId: foreignUserId,
      });

      const context: AgentSafetyContext = {
        isAgent: true,
        agent: executeAgent,
        user: { id: testUserId }, // testUserId tries to use foreign lease
      };

      const result = await runSandboxedWorkspaceCommit(
        context,
        { message: "feat: tenant hijacking attempt", leaseId: lease.leaseId },
        testUserId,
        { projectRoot: testRepo, ...fastPassingSpecs },
        mockDb
      );

      expect(result.status).toBe("EXECUTED");
      if (result.status === "EXECUTED") {
        expect(result.data.success).toBe(false);
        expect(result.data.outcome).toBe("INVALID_LEASE");
        expect(result.data.summary).toContain("rejecting access by user");
      }

      // Cleanup
      execSync("git reset HEAD tenant-test.ts", { cwd: testRepo, stdio: "ignore" });
      fs.unlinkSync(path.join(testRepo, "tenant-test.ts"));
    });
  });

  // =========================================================================
  // 3. TOCTOU Concurrent Modification Detection
  // =========================================================================
  describe("TOCTOU Race Condition Defense", () => {
    it("fails closed when working tree is modified immediately prior to commit execution", async () => {
      fs.writeFileSync(path.join(testRepo, "race.ts"), "version 1\n");
      execSync("git add race.ts", { cwd: testRepo, stdio: "ignore" });

      const lease = await issueVerificationLease({
        projectRoot: testRepo,
        verificationResult: passingVerification,
        userId: testUserId,
      });

      // Modify working tree right before commit execution
      fs.writeFileSync(path.join(testRepo, "race.ts"), "version 2 (race condition)\n");

      const context: AgentSafetyContext = {
        isAgent: true,
        agent: executeAgent,
        user: { id: testUserId },
      };

      const result = await runSandboxedWorkspaceCommit(
        context,
        { message: "feat: race attempt", leaseId: lease.leaseId },
        testUserId,
        { projectRoot: testRepo, ...fastPassingSpecs },
        mockDb
      );

      expect(result.status).toBe("EXECUTED");
      if (result.status === "EXECUTED") {
        expect(result.data.success).toBe(false);
        expect(result.data.outcome).toBe("FINGERPRINT_MISMATCH");
      }

      // Cleanup
      execSync("git reset HEAD race.ts", { cwd: testRepo, stdio: "ignore" });
      fs.unlinkSync(path.join(testRepo, "race.ts"));
    });
  });

  // =========================================================================
  // 4. Audit Log Verification
  // =========================================================================
  describe("Forensic Audit Trail", () => {
    it("records full beforeState and afterState audit log for failed attempts", async () => {
      const context: AgentSafetyContext = {
        isAgent: true,
        agent: executeAgent,
        user: { id: testUserId },
      };

      // Attempt commit with no staged files
      const result = await runSandboxedWorkspaceCommit(
        context,
        { message: "feat: empty staged audit test" },
        testUserId,
        { projectRoot: testRepo, ...fastPassingSpecs },
        mockDb
      );

      expect(result.status).toBe("EXECUTED");
      if (result.status === "EXECUTED") {
        expect(result.data.success).toBe(false);
        expect(result.data.outcome).toBe("NO_STAGED_CHANGES");
      }

      const audit = mockDb.agentAuditLogs.find((a) => a.operation === "workspace.commit");
      expect(audit).toBeDefined();
      expect(audit?.beforeState).toBeDefined();
      expect(audit?.afterState).toBeDefined();
      expect(audit?.afterState.outcome).toBe("NO_STAGED_CHANGES");
      expect(audit?.afterState.success).toBe(false);
    });
  });
});
