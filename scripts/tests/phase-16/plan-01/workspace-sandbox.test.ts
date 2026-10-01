/**
 * Phase 16 Plan 16-01: Project Workspace Isolation Sandbox & Validated Command Runner
 *
 * Mandatory Adversarial Test Suite:
 * - Path Containment (root, directory, nested, traversal, null bytes, URL encoded)
 * - Symlinks (internal, external, through external, nonexistent descendants)
 * - Command Security (finite allowlist, shell commands rejected, interpreters rejected, flag injection)
 * - Process Behavior (pass/fail, exitCode, stdout/stderr, timeouts, termination, truncation caps)
 * - Zero-Trust Authorization (canonical evaluator, lack of capability, unknown ops, financial shield, audit trail)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  getCanonicalProjectRoot,
  resolveSandboxPath,
  assertSandboxPath,
  isPathContained,
  resetProjectRootCache,
} from "@/server/agents/workspace/sandbox";
import {
  executeWorkspaceCommand,
  runSandboxedWorkspaceCommand,
  DEFAULT_TIMEOUTS_MS,
  MAX_OUTPUT_BYTES,
} from "@/server/agents/workspace/command-runner";
import {
  WorkspaceSecurityError,
  type WorkspaceRunnerConfig,
  type WorkspaceCommand,
} from "@/server/agents/workspace/types";
import { classifyOperation, evaluateAgentPermission } from "@/server/agents/permissions/evaluator";
import type { AgentIdentity, AgentSafetyContext } from "@/server/agents/permissions/types";
import { FinancialShieldViolationError, assertFinancialShield } from "@/server/agents/finance-shield";
import { executeAgentOperation } from "@/server/agents/safety-boundary";
import type { AgentAuditLog } from "@/server/db/schema/agents";

// In-Memory Database Mock for Isolated Safety Boundary Verification
class MockSecurityDb {
  public auditLogs: AgentAuditLog[] = [];

  select() {
    return {
      from: () => ({
        where: () => ({
          limit: async () => [{ id: "agent-dev-1" }],
        }),
      }),
    };
  }

  insert(table: any) {
    return {
      values: (val: any) => ({
        returning: async () => {
          if (val.toolName) {
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
          return [val];
        },
      }),
    };
  }
}

describe("Phase 16 Plan 16-01: Workspace Sandbox & Command Runner", () => {
  let tempBaseDir: string;
  let testRoot: string;
  let outsideDir: string;
  let mockDb: MockSecurityDb;

  beforeAll(() => {
    tempBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-phase-16-test-"));
    testRoot = path.join(tempBaseDir, "project-root");
    outsideDir = path.join(tempBaseDir, "outside-root");

    fs.mkdirSync(testRoot, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });

    // Setup project root structure
    fs.writeFileSync(path.join(testRoot, "package.json"), JSON.stringify({ name: "test-project", scripts: {} }));
    fs.writeFileSync(path.join(testRoot, "file.txt"), "hello inside");
    fs.mkdirSync(path.join(testRoot, "nested", "deep"), { recursive: true });
    fs.writeFileSync(path.join(testRoot, "nested", "deep", "file.txt"), "deep content");

    // Setup internal and external symlinks
    fs.symlinkSync(path.join(testRoot, "nested"), path.join(testRoot, "internal-symlink"));
    fs.symlinkSync(outsideDir, path.join(testRoot, "external-symlink"));

    // Outside files
    fs.writeFileSync(path.join(outsideDir, "secret.txt"), "classified outside content");
  });

  afterAll(() => {
    resetProjectRootCache();
    try {
      fs.rmSync(tempBaseDir, { recursive: true, force: true });
    } catch {}
  });

  beforeEach(() => {
    mockDb = new MockSecurityDb();
  });

  // =========================================================================
  // 1. Path Containment
  // =========================================================================
  describe("Path Containment", () => {
    it("project-root file accepted", () => {
      const res = resolveSandboxPath("file.txt", testRoot);
      expect(res.valid).toBe(true);
      expect(res.canonicalPath).toBe(fs.realpathSync(path.join(testRoot, "file.txt")));
      expect(res.relativePath).toBe("file.txt");
      expect(assertSandboxPath("file.txt", testRoot)).toBe(res.canonicalPath);
    });

    it("project-root directory accepted", () => {
      const res = resolveSandboxPath("nested", testRoot);
      expect(res.valid).toBe(true);
      expect(res.canonicalPath).toBe(fs.realpathSync(path.join(testRoot, "nested")));
      expect(assertSandboxPath("nested", testRoot)).toBe(res.canonicalPath);
    });

    it("nested project path accepted", () => {
      const res = resolveSandboxPath("nested/deep/file.txt", testRoot);
      expect(res.valid).toBe(true);
      expect(res.canonicalPath).toBe(fs.realpathSync(path.join(testRoot, "nested", "deep", "file.txt")));
      expect(res.relativePath).toBe("nested/deep/file.txt");
    });

    it("../ traversal rejected", () => {
      const res = resolveSandboxPath("../secret", testRoot);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/escapes sandbox root/i);
      expect(() => assertSandboxPath("../secret", testRoot)).toThrow(WorkspaceSecurityError);
    });

    it("../../ traversal rejected", () => {
      const res = resolveSandboxPath("../../secret", testRoot);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/escapes sandbox root/i);
      expect(() => assertSandboxPath("../../secret", testRoot)).toThrow(WorkspaceSecurityError);
    });

    it("traversal embedded in path rejected", () => {
      const res = resolveSandboxPath("nested/../../outside-root/secret.txt", testRoot);
      expect(res.valid).toBe(false);
      expect(() => assertSandboxPath("nested/../../outside-root/secret.txt", testRoot)).toThrow(WorkspaceSecurityError);
    });

    it("absolute external path rejected", () => {
      const externalAbs = path.join(outsideDir, "secret.txt");
      const res = resolveSandboxPath(externalAbs, testRoot);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/escapes sandbox root/i);
      expect(() => assertSandboxPath(externalAbs, testRoot)).toThrow(WorkspaceSecurityError);
    });

    it("null-byte path rejected", () => {
      const res = resolveSandboxPath("nested/\0evil.txt", testRoot);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/null byte/i);
      expect(() => assertSandboxPath("nested/\0evil.txt", testRoot)).toThrow(WorkspaceSecurityError);
    });

    it("URL-encoded traversal rejected", () => {
      const res = resolveSandboxPath("%2e%2e/secret", testRoot);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/encoded traversal/i);
      expect(() => assertSandboxPath("%2e%2e/secret", testRoot)).toThrow(WorkspaceSecurityError);
    });

    it("double-encoded traversal rejected", () => {
      const res = resolveSandboxPath("%252e%252e/secret", testRoot);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/encoded traversal/i);
      expect(() => assertSandboxPath("%252e%252e/secret", testRoot)).toThrow(WorkspaceSecurityError);
    });

    it("rejects path with prefix confusion (/project-evil vs /project)", () => {
      const evilSibling = `${testRoot}-evil`;
      expect(isPathContained(testRoot, evilSibling)).toBe(false);
    });
  });

  // =========================================================================
  // 2. Symlinks
  // =========================================================================
  describe("Symlinks", () => {
    it("internal symlink accepted", () => {
      const res = resolveSandboxPath("internal-symlink", testRoot);
      expect(res.valid).toBe(true);
      expect(res.canonicalPath).toBe(fs.realpathSync(path.join(testRoot, "nested")));
      expect(assertSandboxPath("internal-symlink", testRoot)).toBe(res.canonicalPath);
    });

    it("external symlink rejected", () => {
      const res = resolveSandboxPath("external-symlink", testRoot);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/symlink escape/i);
      expect(() => assertSandboxPath("external-symlink", testRoot)).toThrow(WorkspaceSecurityError);
    });

    it("path through external symlink rejected", () => {
      const res = resolveSandboxPath("external-symlink/secret.txt", testRoot);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/symlink escape/i);
      expect(() => assertSandboxPath("external-symlink/secret.txt", testRoot)).toThrow(WorkspaceSecurityError);
    });

    it("nonexistent descendant of valid directory accepted", () => {
      const res = resolveSandboxPath("nested/deep/new-uncreated-file.ts", testRoot);
      expect(res.valid).toBe(true);
      expect(res.canonicalPath).toBe(path.join(fs.realpathSync(path.join(testRoot, "nested", "deep")), "new-uncreated-file.ts"));
      expect(res.relativePath).toBe("nested/deep/new-uncreated-file.ts");
    });

    it("nonexistent path through external symlink rejected", () => {
      const res = resolveSandboxPath("external-symlink/new-uncreated-file.ts", testRoot);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/symlink escape/i);
      expect(() => assertSandboxPath("external-symlink/new-uncreated-file.ts", testRoot)).toThrow(WorkspaceSecurityError);
    });
  });

  // =========================================================================
  // 3. Command Security
  // =========================================================================
  describe("Command Security", () => {
    const testRunnerConfig: WorkspaceRunnerConfig = {
      projectRoot: testRoot,
      commandSpecs: {
        test: {
          executable: process.execPath,
          baseArgs: ["-e", "console.log('test suite executed')"],
          defaultTimeoutMs: 5000,
        },
        typecheck: {
          executable: process.execPath,
          baseArgs: ["-e", "console.log('typecheck clean')"],
          defaultTimeoutMs: 5000,
        },
        build: {
          executable: process.execPath,
          baseArgs: ["-e", "console.log('build completed')"],
          defaultTimeoutMs: 5000,
        },
        lint: {
          executable: process.execPath,
          baseArgs: ["-e", "console.log('lint clean')"],
          defaultTimeoutMs: 5000,
        },
      },
    };

    it("test accepted", async () => {
      const result = await executeWorkspaceCommand({ command: "test" }, testRunnerConfig);
      expect(result.passed).toBe(true);
      expect(result.command).toBe("test");
      expect(result.stdout).toContain("test suite executed");
      expect(result.exitCode).toBe(0);
    });

    it("typecheck accepted", async () => {
      const result = await executeWorkspaceCommand({ command: "typecheck" }, testRunnerConfig);
      expect(result.passed).toBe(true);
      expect(result.command).toBe("typecheck");
      expect(result.stdout).toContain("typecheck clean");
      expect(result.exitCode).toBe(0);
    });

    it("build accepted", async () => {
      const result = await executeWorkspaceCommand({ command: "build" }, testRunnerConfig);
      expect(result.passed).toBe(true);
      expect(result.command).toBe("build");
      expect(result.stdout).toContain("build completed");
      expect(result.exitCode).toBe(0);
    });

    it("lint accepted", async () => {
      const result = await executeWorkspaceCommand({ command: "lint" }, testRunnerConfig);
      expect(result.passed).toBe(true);
      expect(result.command).toBe("lint");
      expect(result.stdout).toContain("lint clean");
      expect(result.exitCode).toBe(0);
    });

    it("unknown command rejected", async () => {
      await expect(
        executeWorkspaceCommand({ command: "destroy" as any }, testRunnerConfig)
      ).rejects.toThrow(WorkspaceSecurityError);
    });

    it("shell command rejected", async () => {
      await expect(
        executeWorkspaceCommand({ command: "rm -rf /" as any }, testRunnerConfig)
      ).rejects.toThrow(WorkspaceSecurityError);
    });

    it("shell interpreter rejected", async () => {
      await expect(
        executeWorkspaceCommand({ command: "sh" as any }, testRunnerConfig)
      ).rejects.toThrow(WorkspaceSecurityError);

      await expect(
        executeWorkspaceCommand({ command: "bash" as any }, testRunnerConfig)
      ).rejects.toThrow(WorkspaceSecurityError);
    });

    it("arbitrary executable rejected", async () => {
      await expect(
        executeWorkspaceCommand({ command: "/usr/bin/cat" as any }, testRunnerConfig)
      ).rejects.toThrow(WorkspaceSecurityError);
    });

    it("argument injection rejected", async () => {
      // Flag injection (e.g. node options, inspect)
      await expect(
        executeWorkspaceCommand({ command: "test", args: ["--inspect=9229"] }, testRunnerConfig)
      ).rejects.toThrow(/flag injection/i);

      // Metacharacter injection (chaining commands)
      await expect(
        executeWorkspaceCommand({ command: "test", args: ["test.ts; rm -rf /"] }, testRunnerConfig)
      ).rejects.toThrow(/shell metacharacters/i);

      // Arguments provided to command where arguments are prohibited
      await expect(
        executeWorkspaceCommand({ command: "typecheck", args: ["foo"] }, testRunnerConfig)
      ).rejects.toThrow(/arguments are prohibited/i);

      // Traversal in argument
      await expect(
        executeWorkspaceCommand({ command: "test", args: ["../secret.ts"] }, testRunnerConfig)
      ).rejects.toThrow(/traversal/i);

      // Blocked token in argument
      await expect(
        executeWorkspaceCommand({ command: "test", args: ["curl"] }, testRunnerConfig)
      ).rejects.toThrow(/prohibited command token/i);

      // Targeting sensitive .env file
      await expect(
        executeWorkspaceCommand({ command: "test", args: [".env"] }, testRunnerConfig)
      ).rejects.toThrow(/sensitive path/i);
    });

    it("shell metacharacters cannot alter execution", async () => {
      const maliciousTokens = ["&", "|", ";", "$()", "`whoami`", "<", ">", "\n", "\0"];
      for (const token of maliciousTokens) {
        await expect(
          executeWorkspaceCommand({ command: "test", args: [`file${token}.ts`] }, testRunnerConfig)
        ).rejects.toThrow(WorkspaceSecurityError);
      }
    });

    it("prohibits arbitrary working directory escaping sandbox", async () => {
      await expect(
        executeWorkspaceCommand({ command: "test", subpath: "../outside-root" }, testRunnerConfig)
      ).rejects.toThrow(WorkspaceSecurityError);

      await expect(
        executeWorkspaceCommand({ command: "test", subpath: "/tmp" }, testRunnerConfig)
      ).rejects.toThrow(WorkspaceSecurityError);
    });
  });

  // =========================================================================
  // 4. Process Behavior
  // =========================================================================
  describe("Process Behavior", () => {
    it("successful process returns passed=true and exitCode is captured", async () => {
      const cfg: WorkspaceRunnerConfig = {
        projectRoot: testRoot,
        commandSpecs: {
          test: {
            executable: process.execPath,
            baseArgs: ["-e", "process.stdout.write('fine output'); process.exit(0);"],
            defaultTimeoutMs: 5000,
          },
        },
      };

      const result = await executeWorkspaceCommand({ command: "test" }, cfg);
      expect(result.passed).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("fine output");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.summary).toContain("completed successfully");
    });

    it("failed process returns passed=false and captures stderr", async () => {
      const cfg: WorkspaceRunnerConfig = {
        projectRoot: testRoot,
        commandSpecs: {
          test: {
            executable: process.execPath,
            baseArgs: ["-e", "process.stderr.write('fatal compile error'); process.exit(42);"],
            defaultTimeoutMs: 5000,
          },
        },
      };

      const result = await executeWorkspaceCommand({ command: "test" }, cfg);
      expect(result.passed).toBe(false);
      expect(result.exitCode).toBe(42);
      expect(result.stderr).toBe("fatal compile error");
      expect(result.summary).toContain("failed in");
      expect(result.summary).toContain("exit code 42");
    });

    it("timeout terminates process and hung process cannot remain alive", async () => {
      const cfg: WorkspaceRunnerConfig = {
        projectRoot: testRoot,
        commandSpecs: {
          test: {
            // A script that attempts to sleep for 30 seconds
            executable: process.execPath,
            baseArgs: ["-e", "setTimeout(() => {}, 30000);"],
            defaultTimeoutMs: 150,
          },
        },
      };

      const result = await executeWorkspaceCommand({ command: "test", timeoutMs: 150 }, cfg);
      expect(result.passed).toBe(false);
      expect(result.timedOut).toBe(true);
      expect(result.exitCode).toBeNull();
      expect(result.summary).toContain("timed out after");
    });

    it("oversized stdout is capped and truncation is reported", async () => {
      const cfg: WorkspaceRunnerConfig = {
        projectRoot: testRoot,
        maxOutputBytes: 100, // Small limit for testing
        commandSpecs: {
          test: {
            executable: process.execPath,
            baseArgs: ["-e", "console.log('A'.repeat(500));"],
            defaultTimeoutMs: 5000,
          },
        },
      };

      const result = await executeWorkspaceCommand({ command: "test" }, cfg);
      expect(result.stdoutTruncated).toBe(true);
      expect(result.stdout).toContain("[LifeOS Output truncated: exceeded limit of 100 bytes]");
      expect(result.stdout.indexOf("A".repeat(100))).toBe(0);
      expect(result.passed).toBe(true);
    });

    it("oversized stderr is capped and truncation is reported", async () => {
      const cfg: WorkspaceRunnerConfig = {
        projectRoot: testRoot,
        maxOutputBytes: 100,
        commandSpecs: {
          test: {
            executable: process.execPath,
            baseArgs: ["-e", "console.error('E'.repeat(500)); process.exit(1);"],
            defaultTimeoutMs: 5000,
          },
        },
      };

      const result = await executeWorkspaceCommand({ command: "test" }, cfg);
      expect(result.stderrTruncated).toBe(true);
      expect(result.stderr).toContain("[LifeOS Output truncated: exceeded limit of 100 bytes]");
      expect(result.passed).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it("handles launch failure gracefully without unhandled exception", async () => {
      const cfg: WorkspaceRunnerConfig = {
        projectRoot: testRoot,
        commandSpecs: {
          test: {
            executable: "/nonexistent/binary/path/cannot-exist",
            baseArgs: [],
            defaultTimeoutMs: 5000,
          },
        },
      };

      const result = await executeWorkspaceCommand({ command: "test" }, cfg);
      expect(result.passed).toBe(false);
      expect(result.exitCode).toBeNull();
      expect(result.executionError).toBeDefined();
      expect(result.summary).toContain("failed to");
    });
  });

  // =========================================================================
  // 5. Zero-Trust Authorization & Audit Integration
  // =========================================================================
  describe("Zero-Trust Authorization & Audit Integration", () => {
    const targetUserId = "user-hamza-123";

    const authorizedAgent: AgentIdentity = {
      id: "agent-dev-1",
      userId: targetUserId,
      name: "DevAgent",
      tokenPrefix: "loa_dev",
      provider: "gemini",
      status: "active",
      expiresAt: null,
      capabilities: new Set(["EXECUTE", "READ"]),
      permissions: [
        {
          capability: "EXECUTE",
          resource: "workspace",
          action: "*",
          allowed: true,
        },
      ],
    };

    const readOnlyAgent: AgentIdentity = {
      id: "agent-readonly-1",
      userId: targetUserId,
      name: "ReaderAgent",
      tokenPrefix: "loa_read",
      provider: "gemini",
      status: "active",
      expiresAt: null,
      capabilities: new Set(["READ"]),
      permissions: [],
    };

    const cfg: WorkspaceRunnerConfig = {
      projectRoot: testRoot,
      commandSpecs: {
        test: {
          executable: process.execPath,
          baseArgs: ["-e", "console.log('authorized test ok');"],
          defaultTimeoutMs: 5000,
        },
      },
    };

    it("workspace operation passes through canonical evaluator and logs audit", async () => {
      const context: AgentSafetyContext = {
        isAgent: true,
        agent: authorizedAgent,
        user: { id: targetUserId },
      };

      const opResult = await runSandboxedWorkspaceCommand(
        context,
        { command: "test" },
        targetUserId,
        cfg,
        mockDb
      );

      expect(opResult.status).toBe("EXECUTED");
      if (opResult.status === "EXECUTED") {
        expect(opResult.data.passed).toBe(true);
        expect(opResult.data.stdout).toContain("authorized test ok");
      }

      // Assert forensic audit entry
      expect(mockDb.auditLogs.length).toBe(1);
      const log = mockDb.auditLogs[0];
      expect(log.status).toBe("EXECUTED");
      expect(log.toolName).toBe("workspace.test");
      expect(log.capability).toBe("EXECUTE");
      expect(log.userId).toBe(targetUserId);
      expect(log.agentTokenId).toBe(authorizedAgent.id);
    });

    it("unauthorized operation rejected (agent lacking EXECUTE capability)", async () => {
      const context: AgentSafetyContext = {
        isAgent: true,
        agent: readOnlyAgent,
        user: { id: targetUserId },
      };

      await expect(
        runSandboxedWorkspaceCommand(
          context,
          { command: "test" },
          targetUserId,
          cfg,
          mockDb
        )
      ).rejects.toThrow(/Agent permission denied: Agent 'ReaderAgent' lacks required capability 'EXECUTE'/i);

      // Audit log must record the DENIED attempt
      expect(mockDb.auditLogs.length).toBe(1);
      const log = mockDb.auditLogs[0];
      expect(log.status).toBe("DENIED");
      expect(log.toolName).toBe("workspace.test");
      expect(log.errorMessage).toMatch(/lacks required capability 'EXECUTE'/i);
    });

    it("unknown operation denied by default", () => {
      const decision = evaluateAgentPermission(authorizedAgent, "workspace.unknownAction", targetUserId);
      expect(decision.granted).toBe(false);
      expect(decision.reason).toMatch(/unclassified and rejected by default/i);
    });

    it("financial shield remains enforced (cannot bypass via workspace)", async () => {
      const context: AgentSafetyContext = {
        isAgent: true,
        agent: authorizedAgent,
        user: { id: targetUserId },
      };

      // Ensure assertFinancialShield blocks financial mutations
      expect(() => {
        assertFinancialShield(context, "finance.createTransaction");
      }).toThrow(FinancialShieldViolationError);

      // Workspace execution does not classify as financial mutation
      const classification = classifyOperation("workspace.test");
      expect(classification.isFinancialMutation).toBe(false);
      expect(classification.capability).toBe("EXECUTE");
    });

    it("execution remains auditable across all operations", async () => {
      const context: AgentSafetyContext = {
        isAgent: true,
        agent: authorizedAgent,
        user: { id: targetUserId },
      };

      await runSandboxedWorkspaceCommand(
        context,
        { command: "test" },
        targetUserId,
        cfg,
        mockDb
      );

      expect(mockDb.auditLogs.length).toBe(1);
      const entry = mockDb.auditLogs[0];
      expect(entry.agentName).toBe("DevAgent");
      expect(entry.operation).toBe("workspace.test");
      expect(entry.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("runs real repository typecheck successfully under default configuration", async () => {
      const realResult = await executeWorkspaceCommand({ command: "typecheck" });
      expect(realResult.passed).toBe(true);
      expect(realResult.exitCode).toBe(0);
      expect(realResult.command).toBe("typecheck");
      expect(realResult.timedOut).toBe(false);
    }, 90_000);
  });
});
