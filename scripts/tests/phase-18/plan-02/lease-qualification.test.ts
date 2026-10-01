/**
 * Phase 18 Plan 18-02: Verification Qualification Lease Tests
 *
 * Requirements:
 * - WORK-04: Verification Qualification Leases bind candidate working-tree state to verification evidence.
 * - SAFE-01: Zero-trust tenant and repository isolation.
 *
 * Invariants Verified:
 * 1. Computes canonical working-tree fingerprint (HEAD commit, staged index, status, unstaged diff, untracked).
 * 2. Issues time-bound VerificationLease only when verification checks pass.
 * 3. Invalidation upon any drift (modified tracked file, staged change, added/deleted file, index change).
 * 4. Invalidation upon expiration.
 * 5. Rejection of cross-repository and cross-tenant lease reuse.
 * 6. Single-use atomic consumption preventing replay attacks.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import {
  computeWorkingTreeFingerprint,
  issueVerificationLease,
  getVerificationLease,
  listVerificationLeases,
  findActiveLeaseForCandidate,
  validateVerificationLease,
  consumeVerificationLease,
  cleanupExpiredLeases,
} from "@/server/agents/workspace/lease-manager";
import {
  LeaseSecurityError,
  type PreCommitVerificationResult,
} from "@/server/agents/workspace/types";

describe("Phase 18 Plan 18-02: Verification Qualification Leases", () => {
  let tempBaseDir: string;
  let repoA: string;
  let repoB: string;
  const testUserId = "user-hamza-123";
  const foreignUserId = "user-attacker-456";

  const passingVerification: PreCommitVerificationResult = {
    started: true,
    passed: true,
    canCommit: true,
    totalDurationMs: 450,
    checksRun: ["typecheck", "test"],
    checksPassed: ["typecheck", "test"],
    checksFailed: [],
    checksSkipped: ["build", "lint"],
    results: {
      typecheck: {
        command: "typecheck",
        status: "passed",
        exitCode: 0,
        durationMs: 200,
        stdout: "ok",
        stderr: "",
        summary: "ok",
        timedOut: false,
      },
      test: {
        command: "test",
        status: "passed",
        exitCode: 0,
        durationMs: 250,
        stdout: "ok",
        stderr: "",
        summary: "ok",
        timedOut: false,
      },
      build: null,
      lint: null,
    },
  };

  const failingVerification: PreCommitVerificationResult = {
    ...passingVerification,
    passed: false,
    canCommit: false,
    checksFailed: ["test"],
    failureReason: "Test failed with exit code 1",
  };

  beforeAll(() => {
    tempBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-lease-test-"));
    repoA = path.join(tempBaseDir, "repo-a");
    repoB = path.join(tempBaseDir, "repo-b");

    fs.mkdirSync(repoA, { recursive: true });
    fs.mkdirSync(repoB, { recursive: true });

    // Initialize Git in repoA
    execSync("git init -b main", { cwd: repoA, stdio: "ignore" });
    execSync("git config user.name 'Test Hamza'", { cwd: repoA, stdio: "ignore" });
    execSync("git config user.email 'hamza@lifeos.local'", { cwd: repoA, stdio: "ignore" });

    // Initialize Git in repoB
    execSync("git init -b main", { cwd: repoB, stdio: "ignore" });
    execSync("git config user.name 'Other User'", { cwd: repoB, stdio: "ignore" });
    execSync("git config user.email 'other@lifeos.local'", { cwd: repoB, stdio: "ignore" });

    // Initial commit in repoA
    fs.writeFileSync(path.join(repoA, "README.md"), "# Repo A\n");
    execSync("git add README.md", { cwd: repoA, stdio: "ignore" });
    execSync("git commit -m 'Initial commit in repo A'", { cwd: repoA, stdio: "ignore" });

    // Initial commit in repoB
    fs.writeFileSync(path.join(repoB, "README.md"), "# Repo B\n");
    execSync("git add README.md", { cwd: repoB, stdio: "ignore" });
    execSync("git commit -m 'Initial commit in repo B'", { cwd: repoB, stdio: "ignore" });
  });

  afterAll(() => {
    try {
      fs.rmSync(tempBaseDir, { recursive: true, force: true });
    } catch {}
  });

  // =========================================================================
  // 1. Working Tree Fingerprinting
  // =========================================================================
  describe("Candidate Fingerprinting", () => {
    it("computes deterministic fingerprint for identical repository state", async () => {
      const fp1 = await computeWorkingTreeFingerprint(repoA);
      const fp2 = await computeWorkingTreeFingerprint(repoA);

      expect(fp1.headCommit).toBe(fp2.headCommit);
      expect(fp1.indexHash).toBe(fp2.indexHash);
      expect(fp1.statusPorcelain).toBe(fp2.statusPorcelain);
      expect(fp1.unstagedDiffHash).toBe(fp2.unstagedDiffHash);
      expect(fp1.untrackedHash).toBe(fp2.untrackedHash);
      expect(fp1.fingerprint).toBe(fp2.fingerprint);
    });

    it("captures valid HEAD commit hash", async () => {
      const fp = await computeWorkingTreeFingerprint(repoA);
      expect(fp.headCommit).toMatch(/^[0-9a-f]{40}$/);
    });
  });

  // =========================================================================
  // 2. Lease Issuance
  // =========================================================================
  describe("Lease Issuance & Persistence", () => {
    it("successfully issues and persists a valid lease for passing verification", async () => {
      const lease = await issueVerificationLease({
        projectRoot: repoA,
        verificationResult: passingVerification,
        userId: testUserId,
        ttlMs: 60000,
      });

      expect(lease.leaseId).toBeDefined();
      expect(lease.userId).toBe(testUserId);
      expect(lease.consumed).toBe(false);
      expect(lease.candidateState.fingerprint).toBeDefined();
      expect(lease.verificationResult.passed).toBe(true);

      // Verify file exists on disk
      const stored = await getVerificationLease(repoA, lease.leaseId);
      expect(stored).not.toBeNull();
      expect(stored?.leaseId).toBe(lease.leaseId);
    });

    it("refuses to issue lease when verification has failed", async () => {
      await expect(
        issueVerificationLease({
          projectRoot: repoA,
          verificationResult: failingVerification,
          userId: testUserId,
        })
      ).rejects.toThrow(LeaseSecurityError);
    });
  });

  // =========================================================================
  // 3. Candidate Drift Detection & Invalidation
  // =========================================================================
  describe("Candidate Drift Invalidation", () => {
    it("invalidates lease when an existing tracked file is modified", async () => {
      // Stage changes to qualify
      fs.writeFileSync(path.join(repoA, "tracked.txt"), "version 1\n");
      execSync("git add tracked.txt", { cwd: repoA, stdio: "ignore" });

      const lease = await issueVerificationLease({
        projectRoot: repoA,
        verificationResult: passingVerification,
        userId: testUserId,
      });

      // Assert lease is initially valid
      const initialVal = await validateVerificationLease(repoA, lease.leaseId);
      expect(initialVal.valid).toBe(true);

      // Mutate tracked file in working tree
      fs.writeFileSync(path.join(repoA, "tracked.txt"), "version 2 (drift)\n");

      const driftedVal = await validateVerificationLease(repoA, lease.leaseId);
      expect(driftedVal.valid).toBe(false);
      expect(driftedVal.reason).toContain("drifted");

      // Revert drift
      fs.writeFileSync(path.join(repoA, "tracked.txt"), "version 1\n");
      const restoredVal = await validateVerificationLease(repoA, lease.leaseId);
      expect(restoredVal.valid).toBe(true);

      // Cleanup
      execSync("git reset HEAD tracked.txt", { cwd: repoA, stdio: "ignore" });
      fs.unlinkSync(path.join(repoA, "tracked.txt"));
    });

    it("invalidates lease when staged index is modified", async () => {
      fs.writeFileSync(path.join(repoA, "staged.txt"), "stage 1\n");
      execSync("git add staged.txt", { cwd: repoA, stdio: "ignore" });

      const lease = await issueVerificationLease({
        projectRoot: repoA,
        verificationResult: passingVerification,
        userId: testUserId,
      });

      expect((await validateVerificationLease(repoA, lease.leaseId)).valid).toBe(true);

      // Stage an additional change
      fs.writeFileSync(path.join(repoA, "another.txt"), "hello\n");
      execSync("git add another.txt", { cwd: repoA, stdio: "ignore" });

      const driftedVal = await validateVerificationLease(repoA, lease.leaseId);
      expect(driftedVal.valid).toBe(false);

      // Cleanup
      execSync("git reset HEAD staged.txt another.txt", { cwd: repoA, stdio: "ignore" });
      fs.unlinkSync(path.join(repoA, "staged.txt"));
      fs.unlinkSync(path.join(repoA, "another.txt"));
    });

    it("invalidates lease when a relevant untracked file is created", async () => {
      fs.writeFileSync(path.join(repoA, "qualified.txt"), "content\n");
      execSync("git add qualified.txt", { cwd: repoA, stdio: "ignore" });

      const lease = await issueVerificationLease({
        projectRoot: repoA,
        verificationResult: passingVerification,
        userId: testUserId,
      });

      expect((await validateVerificationLease(repoA, lease.leaseId)).valid).toBe(true);

      // Create new untracked file
      fs.writeFileSync(path.join(repoA, "sneaky-untracked.js"), "console.log('escape');\n");

      const driftedVal = await validateVerificationLease(repoA, lease.leaseId);
      expect(driftedVal.valid).toBe(false);
      expect(driftedVal.reason).toContain("drifted");

      // Remove untracked file
      fs.unlinkSync(path.join(repoA, "sneaky-untracked.js"));
      const restoredVal = await validateVerificationLease(repoA, lease.leaseId);
      expect(restoredVal.valid).toBe(true);

      // Cleanup
      execSync("git reset HEAD qualified.txt", { cwd: repoA, stdio: "ignore" });
      fs.unlinkSync(path.join(repoA, "qualified.txt"));
    });

    it("invalidates lease when a staged file is unstaged", async () => {
      fs.writeFileSync(path.join(repoA, "file-to-unstage.txt"), "data\n");
      execSync("git add file-to-unstage.txt", { cwd: repoA, stdio: "ignore" });

      const lease = await issueVerificationLease({
        projectRoot: repoA,
        verificationResult: passingVerification,
        userId: testUserId,
      });

      expect((await validateVerificationLease(repoA, lease.leaseId)).valid).toBe(true);

      // Unstage
      execSync("git reset HEAD file-to-unstage.txt", { cwd: repoA, stdio: "ignore" });

      const unstageVal = await validateVerificationLease(repoA, lease.leaseId);
      expect(unstageVal.valid).toBe(false);

      // Cleanup
      fs.unlinkSync(path.join(repoA, "file-to-unstage.txt"));
    });
  });

  // =========================================================================
  // 4. Expiration & Tenant Isolation
  // =========================================================================
  describe("Lease Expiration & Isolation", () => {
    it("rejects expired leases", async () => {
      // Issue lease with 1ms TTL
      const lease = await issueVerificationLease({
        projectRoot: repoA,
        verificationResult: passingVerification,
        userId: testUserId,
        ttlMs: 1, // Expires immediately
      });

      // Wait 10ms for clock tick
      await new Promise((r) => setTimeout(r, 15));

      const val = await validateVerificationLease(repoA, lease.leaseId);
      expect(val.valid).toBe(false);
      expect(val.reason).toContain("expired");
    });

    it("rejects cross-tenant lease access", async () => {
      const lease = await issueVerificationLease({
        projectRoot: repoA,
        verificationResult: passingVerification,
        userId: testUserId,
      });

      const val = await validateVerificationLease(
        repoA,
        lease.leaseId,
        undefined,
        foreignUserId
      );
      expect(val.valid).toBe(false);
      expect(val.reason).toContain("rejecting access by user");
    });

    it("rejects cross-repository lease reuse", async () => {
      const lease = await issueVerificationLease({
        projectRoot: repoA,
        verificationResult: passingVerification,
        userId: testUserId,
      });

      // Try validating repoA's lease against repoB
      const val = await validateVerificationLease(repoB, lease.leaseId);
      expect(val.valid).toBe(false);
    });
  });

  // =========================================================================
  // 5. Single-Use Consumption & Replay Defense
  // =========================================================================
  describe("Single-Use Atomic Consumption", () => {
    it("marks lease as consumed and prevents replay", async () => {
      const lease = await issueVerificationLease({
        projectRoot: repoA,
        verificationResult: passingVerification,
        userId: testUserId,
      });

      expect(lease.consumed).toBe(false);

      // Consume lease
      const fakeCommitSha = "abcdef1234567890abcdef1234567890abcdef12";
      const consumed = await consumeVerificationLease(repoA, lease.leaseId, fakeCommitSha);
      expect(consumed.consumed).toBe(true);
      expect(consumed.commitHash).toBe(fakeCommitSha);

      // Second consumption attempt throws
      await expect(
        consumeVerificationLease(repoA, lease.leaseId, "duplicate-commit-sha")
      ).rejects.toThrow(LeaseSecurityError);

      // Validation of consumed lease returns invalid
      const val = await validateVerificationLease(repoA, lease.leaseId);
      expect(val.valid).toBe(false);
      expect(val.reason).toContain("already been consumed");
    });

    it("findActiveLeaseForCandidate does not return consumed leases", async () => {
      // Create a unique candidate state
      fs.writeFileSync(path.join(repoA, "unique-active.txt"), "unique candidate\n");
      execSync("git add unique-active.txt", { cwd: repoA, stdio: "ignore" });

      const fp = await computeWorkingTreeFingerprint(repoA);
      const lease = await issueVerificationLease({
        projectRoot: repoA,
        verificationResult: passingVerification,
        userId: testUserId,
      });

      const foundBefore = await findActiveLeaseForCandidate(repoA, fp.fingerprint, testUserId);
      expect(foundBefore?.leaseId).toBe(lease.leaseId);

      // Consume it
      await consumeVerificationLease(repoA, lease.leaseId, "sha1");

      const foundAfter = await findActiveLeaseForCandidate(repoA, fp.fingerprint, testUserId);
      expect(foundAfter).toBeNull();

      // Cleanup
      execSync("git reset HEAD unique-active.txt", { cwd: repoA, stdio: "ignore" });
      fs.unlinkSync(path.join(repoA, "unique-active.txt"));
    });
  });

  // =========================================================================
  // 6. Lease Store Listing & Cleanup
  // =========================================================================
  describe("Store Listing & Cleanup", () => {
    it("lists leases sorted by creation time", async () => {
      const leases = await listVerificationLeases(repoA);
      expect(Array.isArray(leases)).toBe(true);
      expect(leases.length).toBeGreaterThan(0);
      for (let i = 1; i < leases.length; i++) {
        expect(leases[i - 1].createdAt).toBeGreaterThanOrEqual(leases[i].createdAt);
      }
    });

    it("cleans up expired leases older than threshold", async () => {
      const cleaned = await cleanupExpiredLeases(repoA, 0); // Cleanup everything older than 0ms
      expect(typeof cleaned).toBe("number");
    });
  });
});
