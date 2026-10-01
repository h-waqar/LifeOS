/**
 * Phase 18 Plan 18-02: Sandboxed Audited Git Commit Tests
 *
 * Requirements:
 * - WORK-01: Sandboxed workspace process boundary.
 * - WORK-04: Git commit execution requires active Verification Qualification Lease.
 * - SAFE-01: Zero-trust capability enforcement.
 *
 * Invariants Tested:
 * 1. Empty message and overlong message validation.
 * 2. Strict staging policy: blocks commit when no staged changes exist.
 * 3. Requires valid, unexpired, unconsumed lease matching candidate state.
 * 4. Executes git commit in sandboxed subprocess and captures commit SHA.
 * 5. Atomically consumes lease to prevent replay attacks.
 * 6. Auto-verify mode: verifies and commits in a single validated pipeline.
 * 7. Correct author attribution and commit message persistence.
 * 8. Reconciles outcome against HEAD advance to eliminate uncertain states.
 * 9. CLI subcommand `lifeos workspace commit` integration.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { executeWorkspaceCommit } from "@/server/agents/workspace/commit-executor";
import { issueVerificationLease, getVerificationLease } from "@/server/agents/workspace/lease-manager";
import {
  CommitExecutionError,
  type PreCommitVerificationResult,
  type WorkspaceRunnerConfig,
} from "@/server/agents/workspace/types";
import { handleWorkspace } from "@/cli/commands/workspace";
import type { CommandContext, ParsedArgs } from "@/cli/types";

describe("Phase 18 Plan 18-02: Sandboxed Audited Git Commit Execution", () => {
  let tempBaseDir: string;
  let testRepo: string;
  const testUserId = "user-hamza-123";

  // Hermetic mock runner specs for fast unit/integration testing
  const fastPassingRunnerConfig: WorkspaceRunnerConfig = {
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

  const passingVerification: PreCommitVerificationResult = {
    started: true,
    passed: true,
    canCommit: true,
    totalDurationMs: 300,
    checksRun: ["typecheck", "test"],
    checksPassed: ["typecheck", "test"],
    checksFailed: [],
    checksSkipped: ["build", "lint"],
    results: {
      typecheck: {
        command: "typecheck",
        status: "passed",
        exitCode: 0,
        durationMs: 150,
        stdout: "ok",
        stderr: "",
        summary: "ok",
        timedOut: false,
      },
      test: {
        command: "test",
        status: "passed",
        exitCode: 0,
        durationMs: 150,
        stdout: "ok",
        stderr: "",
        summary: "ok",
        timedOut: false,
      },
      build: null,
      lint: null,
    },
  };

  beforeAll(() => {
    tempBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-commit-test-"));
    testRepo = path.join(tempBaseDir, "commit-repo");

    fs.mkdirSync(testRepo, { recursive: true });

    // Initialize Git
    execSync("git init -b main", { cwd: testRepo, stdio: "ignore" });
    execSync("git config user.name 'Test Hamza'", { cwd: testRepo, stdio: "ignore" });
    execSync("git config user.email 'hamza@lifeos.local'", { cwd: testRepo, stdio: "ignore" });

    // Initial base commit
    fs.writeFileSync(path.join(testRepo, "README.md"), "# LifeOS Commit Test Repo\n");
    execSync("git add README.md", { cwd: testRepo, stdio: "ignore" });
    execSync("git commit -m 'chore: initial base commit'", { cwd: testRepo, stdio: "ignore" });
  });

  afterAll(() => {
    try {
      fs.rmSync(tempBaseDir, { recursive: true, force: true });
    } catch {}
  });

  // =========================================================================
  // 1. Parameter Validation
  // =========================================================================
  describe("Input Parameter Validation", () => {
    it("rejects empty commit message", async () => {
      await expect(
        executeWorkspaceCommit(
          { message: "   " },
          testUserId,
          { projectRoot: testRepo }
        )
      ).rejects.toThrow(CommitExecutionError);
    });

    it("rejects commit messages exceeding 2000 characters", async () => {
      const longMessage = "a".repeat(2005);
      await expect(
        executeWorkspaceCommit(
          { message: longMessage },
          testUserId,
          { projectRoot: testRepo }
        )
      ).rejects.toThrow(CommitExecutionError);
    });
  });

  // =========================================================================
  // 2. Staging Policy
  // =========================================================================
  describe("Staging Policy & Git Status", () => {
    it("blocks commit when there are no staged changes", async () => {
      const result = await executeWorkspaceCommit(
        { message: "feat: should fail due to no staged files" },
        testUserId,
        { projectRoot: testRepo }
      );

      expect(result.outcome).toBe("NO_STAGED_CHANGES");
      expect(result.success).toBe(false);
      expect(result.commitHash).toBeNull();
      expect(result.summary).toContain("No staged changes found");
    });
  });

  // =========================================================================
  // 3. Lease-Gated Commit Execution
  // =========================================================================
  describe("Lease-Gated Commit Workflow", () => {
    it("successfully commits when provided with an active valid lease", async () => {
      // 1. Stage changes
      fs.writeFileSync(path.join(testRepo, "feature.ts"), "export const a = 42;\n");
      execSync("git add feature.ts", { cwd: testRepo, stdio: "ignore" });

      // 2. Issue lease for current candidate
      const lease = await issueVerificationLease({
        projectRoot: testRepo,
        verificationResult: passingVerification,
        userId: testUserId,
      });

      expect(lease.consumed).toBe(false);

      // 3. Execute commit with lease
      const result = await executeWorkspaceCommit(
        {
          message: "feat: add feature module",
          leaseId: lease.leaseId,
        },
        testUserId,
        { projectRoot: testRepo }
      );

      expect(result.outcome).toBe("COMMIT_SUCCESS");
      expect(result.success).toBe(true);
      expect(result.commitHash).toMatch(/^[0-9a-f]{40}$/);
      expect(result.headCommitAfter).toBe(result.commitHash);
      expect(result.headCommitAfter).not.toBe(result.headCommitBefore);

      // 4. Verify lease was atomically consumed
      const storedLease = await getVerificationLease(testRepo, lease.leaseId);
      expect(storedLease?.consumed).toBe(true);
      expect(storedLease?.commitHash).toBe(result.commitHash);

      // 5. Verify git log contains new commit
      const log = execSync("git log -n 1 --pretty=format:%s", { cwd: testRepo, encoding: "utf8" });
      expect(log).toBe("feat: add feature module");
    });

    it("rejects commit when attempting to replay an already-consumed lease", async () => {
      // Stage another change
      fs.writeFileSync(path.join(testRepo, "another.ts"), "export const b = 99;\n");
      execSync("git add another.ts", { cwd: testRepo, stdio: "ignore" });

      // Issue lease
      const lease = await issueVerificationLease({
        projectRoot: testRepo,
        verificationResult: passingVerification,
        userId: testUserId,
      });

      // Commit 1
      const res1 = await executeWorkspaceCommit(
        { message: "feat: first commit", leaseId: lease.leaseId },
        testUserId,
        { projectRoot: testRepo }
      );
      expect(res1.success).toBe(true);

      // Stage new file
      fs.writeFileSync(path.join(testRepo, "replay-attempt.ts"), "export const c = 1;\n");
      execSync("git add replay-attempt.ts", { cwd: testRepo, stdio: "ignore" });

      // Attempt to reuse consumed lease
      const res2 = await executeWorkspaceCommit(
        { message: "feat: replay attempt", leaseId: lease.leaseId },
        testUserId,
        { projectRoot: testRepo }
      );

      expect(res2.success).toBe(false);
      expect(res2.outcome).toBe("INVALID_LEASE");
      expect(res2.summary).toContain("already been consumed");

      // Cleanup
      execSync("git reset HEAD replay-attempt.ts", { cwd: testRepo, stdio: "ignore" });
      fs.unlinkSync(path.join(testRepo, "replay-attempt.ts"));
    });

    it("rejects commit when candidate state drifts after lease issuance (anti-TOCTOU)", async () => {
      fs.writeFileSync(path.join(testRepo, "drift-target.ts"), "version 1\n");
      execSync("git add drift-target.ts", { cwd: testRepo, stdio: "ignore" });

      const lease = await issueVerificationLease({
        projectRoot: testRepo,
        verificationResult: passingVerification,
        userId: testUserId,
      });

      // Drift working tree
      fs.writeFileSync(path.join(testRepo, "drift-target.ts"), "version 2 modified\n");

      const result = await executeWorkspaceCommit(
        { message: "feat: should reject due to drift", leaseId: lease.leaseId },
        testUserId,
        { projectRoot: testRepo }
      );

      expect(result.success).toBe(false);
      expect(result.outcome).toBe("FINGERPRINT_MISMATCH");
      expect(result.summary).toContain("drifted");

      // Cleanup
      execSync("git reset HEAD drift-target.ts", { cwd: testRepo, stdio: "ignore" });
      fs.unlinkSync(path.join(testRepo, "drift-target.ts"));
    });
  });

  // =========================================================================
  // 4. Auto-Verify Commit Workflow
  // =========================================================================
  describe("Auto-Verify Commit Mode", () => {
    it("runs verification, issues lease, and commits seamlessly in autoVerify mode", async () => {
      fs.writeFileSync(path.join(testRepo, "autoverify.ts"), "export const auto = true;\n");
      execSync("git add autoverify.ts", { cwd: testRepo, stdio: "ignore" });

      const result = await executeWorkspaceCommit(
        {
          message: "feat: autoverified commit",
          autoVerify: true,
          verificationChecks: ["typecheck", "test"],
        },
        testUserId,
        {
          ...fastPassingRunnerConfig,
          projectRoot: testRepo,
        }
      );

      expect(result.outcome).toBe("COMMIT_SUCCESS");
      expect(result.success).toBe(true);
      expect(result.commitHash).toMatch(/^[0-9a-f]{40}$/);
      expect(result.leaseId).toBeDefined();

      // Check git log
      const log = execSync("git log -n 1 --pretty=format:%s", { cwd: testRepo, encoding: "utf8" });
      expect(log).toBe("feat: autoverified commit");
    });
  });

  // =========================================================================
  // 5. Author Attribution
  // =========================================================================
  describe("Author Attribution", () => {
    it("commits with custom author when provided", async () => {
      fs.writeFileSync(path.join(testRepo, "author.ts"), "export const auth = 1;\n");
      execSync("git add author.ts", { cwd: testRepo, stdio: "ignore" });

      const result = await executeWorkspaceCommit(
        {
          message: "chore: commit with custom author",
          autoVerify: true,
          author: { name: "Agent Claude", email: "agent@lifeos.internal" },
        },
        testUserId,
        { ...fastPassingRunnerConfig, projectRoot: testRepo }
      );

      expect(result.success).toBe(true);

      const authorLog = execSync("git log -n 1 --pretty=format:'%an <%ae>'", {
        cwd: testRepo,
        encoding: "utf8",
      });
      expect(authorLog).toContain("Agent Claude <agent@lifeos.internal>");
    });
  });

  // =========================================================================
  // 6. CLI Command Integration
  // =========================================================================
  describe("CLI Workspace Commit Command", () => {
    it("handles `lifeos workspace commit` via CLI handler", async () => {
      fs.writeFileSync(path.join(testRepo, "cli-commit.txt"), "hello cli commit\n");
      execSync("git add cli-commit.txt", { cwd: testRepo, stdio: "ignore" });

      // First acquire lease
      const lease = await issueVerificationLease({
        projectRoot: testRepo,
        verificationResult: passingVerification,
        userId: testUserId,
      });

      const parsed: ParsedArgs = {
        subcommands: ["workspace", "commit"],
        flags: {
          message: "test: commit via CLI",
          "lease-id": lease.leaseId,
        },
        options: {},
      };

      const context: CommandContext = {
        token: "tok_test_session",
        user: { id: testUserId, email: "hamza@lifeos.local", name: "Hamza" },
      } as any;

      // Temporarily change cwd to testRepo
      const prevCwd = process.cwd();
      try {
        process.chdir(testRepo);
        const cliResult = await handleWorkspace(parsed, context);

        expect(cliResult.exitCode).toBe(0);
        expect(cliResult.tableData).toBeDefined();
        const data = cliResult.data as any;
        expect(data.success).toBe(true);
        expect(data.outcome).toBe("COMMIT_SUCCESS");
      } finally {
        process.chdir(prevCwd);
      }
    });
  });
});
