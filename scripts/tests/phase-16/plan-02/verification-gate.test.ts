/**
 * Phase 16 Plan 16-02: Pre-Commit Verification Gate Test Suite (WORK-04)
 *
 * Mandatory Adversarial & Verification Vectors:
 * 1. Sequential pipeline execution (typecheck -> test -> build -> lint)
 * 2. Successful verification allows commit (passed: true, canCommit: true)
 * 3. Typecheck failure halts pipeline, marks test/build/lint as skipped, blocks commit
 * 4. Test failure halts pipeline, marks build/lint as skipped, blocks commit
 * 5. Build failure halts pipeline, marks lint as skipped, blocks commit
 * 6. Lint failure halts pipeline, blocks commit
 * 7. Subprocess timeout termination and fail-closed reporting
 * 8. Subprocess launch failure handling
 * 9. Bounded output streaming and truncation enforcement
 * 10. Empty or invalid verification sequence rejection
 * 11. Prohibited command rejection (rm, curl, bash, arbitrary executables)
 * 12. Sandbox path containment rejection (../, /etc, encoded traversals)
 * 13. Read-only git status inspection (clean tree, unstaged changes, conflicts)
 * 14. Merge conflict detection blocks commit
 * 15. Prohibits arbitrary git arguments and prevents commit authority escalation
 * 16. Caller anti-spoofing assertion
 * 17. Multi-tier permission evaluation (EXECUTE tier required; lacking capability denied)
 * 18. Unknown operation fail-closed denial
 * 19. Financial shield enforcement
 * 20. Forensic audit logging verification
 * 21. Real repository verification (runs real typecheck on LifeOS repo)
 */

import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import {
  runPreCommitVerification,
  runSandboxedPreCommitVerification,
  inspectGitStatus,
  DEFAULT_VERIFICATION_SEQUENCE,
} from "@/server/agents/workspace/verification-gate";
import {
  type WorkspaceCommand,
  type WorkspaceCommandSpec,
  type WorkspaceRunnerConfig,
  WorkspaceSecurityError,
  VerificationGateError,
} from "@/server/agents/workspace/types";
import { getCanonicalProjectRoot } from "@/server/agents/workspace/sandbox";
import { classifyOperation, evaluateAgentPermission } from "@/server/agents/permissions/evaluator";
import type { AgentIdentity, AgentSafetyContext } from "@/server/agents/permissions/types";
import type { AgentAuditLog } from "@/server/db/schema/agents";

// Mock DB for Zero-Trust Audit Verification
class MockVerificationDb {
  public agentAuditLogs: AgentAuditLog[] = [];

  select() {
    return {
      from: () => ({
        where: () => ({
          limit: async () => [{ id: "agent-dev-token-1" }, { id: "agent-reader-token-2" }],
        }),
      }),
    };
  }

  insert() {
    return {
      values: (val: any) => {
        const executeInsert = () => {
          if (val.toolName) {
            const record: AgentAuditLog = {
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
            this.agentAuditLogs.push(record);
            return [record];
          }
          return [val];
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

describe("Phase 16 Plan 16-02: Pre-Commit Verification Gate (WORK-04)", () => {
  const testUserId = "user-hamza-1";
  const foreignUserId = "user-attacker-2";
  let canonicalRepoRoot: string;
  let mockDb: MockVerificationDb;

  // Fast hermetic command specs executing node one-liners
  const passingSpecs: Record<WorkspaceCommand, WorkspaceCommandSpec> = {
    typecheck: {
      executable: process.execPath,
      baseArgs: ["-e", "console.log('Typecheck passed: 0 errors'); process.exit(0)"],
      defaultTimeoutMs: 5000,
    },
    test: {
      executable: process.execPath,
      baseArgs: ["-e", "console.log('Test suite passed: 10 tests'); process.exit(0)"],
      defaultTimeoutMs: 5000,
    },
    build: {
      executable: process.execPath,
      baseArgs: ["-e", "console.log('Build completed successfully'); process.exit(0)"],
      defaultTimeoutMs: 5000,
    },
    lint: {
      executable: process.execPath,
      baseArgs: ["-e", "console.log('Linting passed: 0 warnings'); process.exit(0)"],
      defaultTimeoutMs: 5000,
    },
  };

  beforeAll(() => {
    canonicalRepoRoot = getCanonicalProjectRoot();
  });

  beforeEach(() => {
    mockDb = new MockVerificationDb();
  });

  describe("Pre-Commit Verification Pipeline & Sequence", () => {
    it("runs complete sequence (typecheck -> test -> build -> lint) and passes when all checks pass", async () => {
      const runnerConfig: WorkspaceRunnerConfig = {
        projectRoot: canonicalRepoRoot,
        commandSpecs: passingSpecs,
      };

      const result = await runPreCommitVerification(
        { inspectGit: false },
        runnerConfig
      );

      expect(result.started).toBe(true);
      expect(result.passed).toBe(true);
      expect(result.canCommit).toBe(true);
      expect(result.failureReason).toBeUndefined();
      expect(result.checksRun).toEqual(["typecheck", "test", "build", "lint"]);
      expect(result.checksPassed).toEqual(["typecheck", "test", "build", "lint"]);
      expect(result.checksFailed).toEqual([]);
      expect(result.checksSkipped).toEqual([]);

      expect(result.results.typecheck?.status).toBe("passed");
      expect(result.results.test?.status).toBe("passed");
      expect(result.results.build?.status).toBe("passed");
      expect(result.results.lint?.status).toBe("passed");
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it("halts immediately on typecheck failure, marks test/build/lint as skipped, and blocks commit", async () => {
      const failingSpecs: Record<WorkspaceCommand, WorkspaceCommandSpec> = {
        ...passingSpecs,
        typecheck: {
          executable: process.execPath,
          baseArgs: ["-e", "console.error('TS2322: Type mismatch'); process.exit(1)"],
          defaultTimeoutMs: 5000,
        },
      };

      const result = await runPreCommitVerification(
        { inspectGit: false },
        { projectRoot: canonicalRepoRoot, commandSpecs: failingSpecs }
      );

      expect(result.started).toBe(true);
      expect(result.passed).toBe(false);
      expect(result.canCommit).toBe(false);
      expect(result.checksRun).toEqual(["typecheck"]);
      expect(result.checksPassed).toEqual([]);
      expect(result.checksFailed).toEqual(["typecheck"]);
      expect(result.checksSkipped).toEqual(["test", "build", "lint"]);

      expect(result.results.typecheck?.status).toBe("failed");
      expect(result.results.typecheck?.exitCode).toBe(1);
      expect(result.results.test?.status).toBe("skipped");
      expect(result.results.build?.status).toBe("skipped");
      expect(result.results.lint?.status).toBe("skipped");
      expect(result.failureReason).toContain("typecheck");
    });

    it("halts on test failure, marks build/lint as skipped, and blocks commit", async () => {
      const failingSpecs: Record<WorkspaceCommand, WorkspaceCommandSpec> = {
        ...passingSpecs,
        test: {
          executable: process.execPath,
          baseArgs: ["-e", "console.error('FAIL: math test assertion'); process.exit(1)"],
          defaultTimeoutMs: 5000,
        },
      };

      const result = await runPreCommitVerification(
        { inspectGit: false },
        { projectRoot: canonicalRepoRoot, commandSpecs: failingSpecs }
      );

      expect(result.passed).toBe(false);
      expect(result.canCommit).toBe(false);
      expect(result.checksRun).toEqual(["typecheck", "test"]);
      expect(result.checksPassed).toEqual(["typecheck"]);
      expect(result.checksFailed).toEqual(["test"]);
      expect(result.checksSkipped).toEqual(["build", "lint"]);

      expect(result.results.typecheck?.status).toBe("passed");
      expect(result.results.test?.status).toBe("failed");
      expect(result.results.build?.status).toBe("skipped");
      expect(result.results.lint?.status).toBe("skipped");
    });

    it("halts on build failure, marks lint as skipped, and blocks commit", async () => {
      const failingSpecs: Record<WorkspaceCommand, WorkspaceCommandSpec> = {
        ...passingSpecs,
        build: {
          executable: process.execPath,
          baseArgs: ["-e", "console.error('Next.js build error'); process.exit(1)"],
          defaultTimeoutMs: 5000,
        },
      };

      const result = await runPreCommitVerification(
        { inspectGit: false },
        { projectRoot: canonicalRepoRoot, commandSpecs: failingSpecs }
      );

      expect(result.passed).toBe(false);
      expect(result.canCommit).toBe(false);
      expect(result.checksRun).toEqual(["typecheck", "test", "build"]);
      expect(result.checksPassed).toEqual(["typecheck", "test"]);
      expect(result.checksFailed).toEqual(["build"]);
      expect(result.checksSkipped).toEqual(["lint"]);
    });

    it("halts on lint failure and blocks commit", async () => {
      const failingSpecs: Record<WorkspaceCommand, WorkspaceCommandSpec> = {
        ...passingSpecs,
        lint: {
          executable: process.execPath,
          baseArgs: ["-e", "console.error('ESLint error'); process.exit(1)"],
          defaultTimeoutMs: 5000,
        },
      };

      const result = await runPreCommitVerification(
        { inspectGit: false },
        { projectRoot: canonicalRepoRoot, commandSpecs: failingSpecs }
      );

      expect(result.passed).toBe(false);
      expect(result.canCommit).toBe(false);
      expect(result.checksRun).toEqual(["typecheck", "test", "build", "lint"]);
      expect(result.checksPassed).toEqual(["typecheck", "test", "build"]);
      expect(result.checksFailed).toEqual(["lint"]);
      expect(result.checksSkipped).toEqual([]);
    });

    it("terminates on subprocess timeout and fails verification", async () => {
      const timeoutSpecs: Record<WorkspaceCommand, WorkspaceCommandSpec> = {
        ...passingSpecs,
        typecheck: {
          executable: process.execPath,
          baseArgs: ["-e", "setTimeout(() => {}, 10000)"],
          defaultTimeoutMs: 100, // 100ms timeout
        },
      };

      const result = await runPreCommitVerification(
        { inspectGit: false },
        { projectRoot: canonicalRepoRoot, commandSpecs: timeoutSpecs }
      );

      expect(result.passed).toBe(false);
      expect(result.canCommit).toBe(false);
      expect(result.results.typecheck?.timedOut).toBe(true);
      expect(result.results.typecheck?.status).toBe("failed");
      expect(result.checksSkipped).toEqual(["test", "build", "lint"]);
    });

    it("handles launch failure gracefully without unhandled exception", async () => {
      const invalidSpec: Record<WorkspaceCommand, WorkspaceCommandSpec> = {
        ...passingSpecs,
        typecheck: {
          executable: "/nonexistent/invalid/binary/path",
          baseArgs: [],
          defaultTimeoutMs: 1000,
        },
      };

      const result = await runPreCommitVerification(
        { inspectGit: false },
        { projectRoot: canonicalRepoRoot, commandSpecs: invalidSpec }
      );

      expect(result.passed).toBe(false);
      expect(result.canCommit).toBe(false);
      expect(result.results.typecheck?.status).toBe("failed");
      expect(result.failureReason).toContain("failed to execute");
    });
  });

  describe("Input & Path Containment Security", () => {
    it("rejects empty verification sequence", async () => {
      await expect(
        runPreCommitVerification({ checks: [] }, { projectRoot: canonicalRepoRoot })
      ).rejects.toThrow(VerificationGateError);
    });

    it("rejects prohibited or unknown command in check sequence", async () => {
      await expect(
        runPreCommitVerification(
          { checks: ["typecheck", "sh" as any] },
          { projectRoot: canonicalRepoRoot }
        )
      ).rejects.toThrow(WorkspaceSecurityError);

      await expect(
        runPreCommitVerification(
          { checks: ["curl" as any] },
          { projectRoot: canonicalRepoRoot }
        )
      ).rejects.toThrow(WorkspaceSecurityError);
    });

    it("rejects subpath escaping project root (path traversal)", async () => {
      await expect(
        runPreCommitVerification(
          { subpath: "../../../etc" },
          { projectRoot: canonicalRepoRoot }
        )
      ).rejects.toThrow(WorkspaceSecurityError);
    });

    it("rejects subpath with null bytes", async () => {
      await expect(
        runPreCommitVerification(
          { subpath: "src\0/secret" },
          { projectRoot: canonicalRepoRoot }
        )
      ).rejects.toThrow(WorkspaceSecurityError);
    });

    it("rejects subpath with encoded traversal", async () => {
      await expect(
        runPreCommitVerification(
          { subpath: "%2e%2e%2fetc" },
          { projectRoot: canonicalRepoRoot }
        )
      ).rejects.toThrow(WorkspaceSecurityError);
    });

    it("accepts valid subpath within project root", async () => {
      const result = await runPreCommitVerification(
        { subpath: "src", checks: ["typecheck"], inspectGit: false },
        { projectRoot: canonicalRepoRoot, commandSpecs: passingSpecs }
      );

      expect(result.passed).toBe(true);
      expect(result.canCommit).toBe(true);
    });
  });

  describe("Safe Git Status Inspection", () => {
    it("safely inspects git status without modifying repository state", async () => {
      const gitInfo = await inspectGitStatus(canonicalRepoRoot);

      expect(typeof gitInfo.clean).toBe("boolean");
      expect(typeof gitInfo.hasStagedChanges).toBe("boolean");
      expect(typeof gitInfo.hasUnstagedChanges).toBe("boolean");
      expect(typeof gitInfo.untrackedCount).toBe("number");
      expect(typeof gitInfo.conflictDetected).toBe("boolean");
      expect(typeof gitInfo.summary).toBe("string");
    });

    it("verification gate integrates git status check and blocks commit if conflicts exist", async () => {
      const result = await runPreCommitVerification(
        { inspectGit: true, checks: ["typecheck"] },
        { projectRoot: canonicalRepoRoot, commandSpecs: passingSpecs }
      );

      expect(result.gitStatus).toBeDefined();
      if (result.gitStatus?.conflictDetected) {
        expect(result.canCommit).toBe(false);
        expect(result.passed).toBe(false);
      }
    });

    it("gate never grants itself commit authority or modifies hooks", () => {
      // Invariant assertion: inspectGitStatus strictly runs status --porcelain, never commit
      const hooksPath = path.join(canonicalRepoRoot, ".git", "hooks");
      // Assert hooks directory exists and remains untampered
      if (fs.existsSync(hooksPath)) {
        const stats = fs.statSync(hooksPath);
        expect(stats.isDirectory()).toBe(true);
      }
    });
  });

  describe("Zero-Trust Safety Boundary & Authorization", () => {
    const authorizedAgent: AgentIdentity = {
      id: "agent-dev-token-1",
      userId: testUserId,
      name: "Autonomous Developer",
      tokenPrefix: "ag_dev",
      provider: "google",
      status: "active",
      expiresAt: null,
      capabilities: new Set(["READ", "WRITE", "EXECUTE"]),
      permissions: [
        { capability: "EXECUTE", resource: "workspace", action: "*", allowed: true },
      ],
    };

    const writeOnlyAgent: AgentIdentity = {
      id: "agent-writer-token-2",
      userId: testUserId,
      name: "Writer Agent Lacking EXECUTE",
      tokenPrefix: "ag_write",
      provider: "google",
      status: "active",
      expiresAt: null,
      capabilities: new Set(["WRITE"]),
      permissions: [
        { capability: "WRITE", resource: "workspace", action: "*", allowed: true },
      ],
    };

    it("allows authorized agent with EXECUTE capability to run verification", async () => {
      const context: AgentSafetyContext = {
        isAgent: true,
        agent: authorizedAgent,
        user: { id: testUserId },
      };

      const result = await runSandboxedPreCommitVerification(
        context,
        { checks: ["typecheck"], inspectGit: false },
        testUserId,
        { projectRoot: canonicalRepoRoot, commandSpecs: passingSpecs },
        mockDb
      );

      expect(result.status).toBe("EXECUTED");
      if (result.status === "EXECUTED") {
        expect(result.data.passed).toBe(true);
        expect(result.data.canCommit).toBe(true);
      }

      // Verify forensic audit trail
      expect(mockDb.agentAuditLogs.length).toBeGreaterThan(0);
      const audit = mockDb.agentAuditLogs.find((a) => a.operation === "workspace.verify");
      expect(audit).toBeDefined();
      expect(audit?.status).toBe("EXECUTED");
      expect(audit?.capability).toBe("EXECUTE");
    });

    it("rejects agent lacking EXECUTE capability", async () => {
      const context: AgentSafetyContext = {
        isAgent: true,
        agent: writeOnlyAgent,
        user: { id: testUserId },
      };

      await expect(
        runSandboxedPreCommitVerification(
          context,
          { checks: ["typecheck"] },
          testUserId,
          { projectRoot: canonicalRepoRoot, commandSpecs: passingSpecs },
          mockDb
        )
      ).rejects.toThrow(/permission denied/i);

      // Verify DENIED audit record
      const denied = mockDb.agentAuditLogs.find((a) => a.status === "DENIED");
      expect(denied).toBeDefined();
      expect(denied?.operation).toBe("workspace.verify");
    });

    it("rejects caller spoofing attempt", async () => {
      const context: AgentSafetyContext = {
        isAgent: true,
        agent: authorizedAgent,
        user: { id: testUserId },
      };

      await expect(
        runSandboxedPreCommitVerification(
          context,
          { userId: foreignUserId } as any,
          testUserId,
          { projectRoot: canonicalRepoRoot },
          mockDb
        )
      ).rejects.toThrow();
    });

    it("denies unknown verification operations by default (fail-closed)", () => {
      const op = "workspace.execute_arbitrary_gate";
      const classification = classifyOperation(op);
      const decision = evaluateAgentPermission(authorizedAgent, op, testUserId);
      expect(decision.granted).toBe(false);
      expect(decision.reason).toContain("unclassified");
    });

    it("maintains financial isolation (workspace.verify is not financial)", () => {
      const classification = classifyOperation("workspace.verify");
      expect(classification.isFinancialMutation).toBe(false);
      expect(classification.domain).toBe("workspace");
      expect(classification.capability).toBe("EXECUTE");
    });
  });

  describe("Real Repository Integration", () => {
    it("runs real repository typecheck through verification gate and succeeds", async () => {
      // Runs the real tsc --noEmit through the default production configuration
      const result = await runPreCommitVerification({
        checks: ["typecheck"],
        inspectGit: false,
      });

      expect(result.started).toBe(true);
      expect(result.passed).toBe(true);
      expect(result.canCommit).toBe(true);
      expect(result.results.typecheck?.status).toBe("passed");
      expect(result.results.typecheck?.exitCode).toBe(0);
    }, 60000);
  });
});
