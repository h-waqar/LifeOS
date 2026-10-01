/**
 * Phase 18 Plan 18-02: Git Pre-Commit Hook Gating & Composition Tests
 *
 * Requirements:
 * - WORK-04: Ordinary git commit attempts are subject to repository-level verification enforcement.
 *
 * Invariants Tested:
 * 1. Idempotent installation of LifeOS pre-commit hook.
 * 2. Hook status reporting (installed, lifeosManaged, backupExists).
 * 3. Non-destructive hook composition (preserves and chains existing non-LifeOS hooks).
 * 4. Manual `git commit` without lease is blocked with exit code 1.
 * 5. Manual `git commit` with active valid lease succeeds with exit code 0.
 * 6. Manual `git commit` with drifted candidate state is blocked.
 * 7. Safe uninstallation and restoration of pre-existing user hooks.
 * 8. Emergency bypass environment variable (`LIFEOS_SKIP_VERIFY=1`).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync, spawnSync } from "child_process";
import {
  installPreCommitHook,
  uninstallPreCommitHook,
  getPreCommitHookStatus,
  LIFEOS_PRE_COMMIT_HOOK_MARKER,
} from "@/server/agents/workspace/git-hook";
import { issueVerificationLease } from "@/server/agents/workspace/lease-manager";
import type { PreCommitVerificationResult } from "@/server/agents/workspace/types";

describe("Phase 18 Plan 18-02: Git Pre-Commit Hook Gating & Composition", () => {
  let tempBaseDir: string;
  let testRepo: string;
  const testUserId = "user-hamza-123";

  const passingVerification: PreCommitVerificationResult = {
    started: true,
    passed: true,
    canCommit: true,
    totalDurationMs: 200,
    checksRun: ["typecheck", "test"],
    checksPassed: ["typecheck", "test"],
    checksFailed: [],
    checksSkipped: ["build", "lint"],
    results: {
      typecheck: {
        command: "typecheck",
        status: "passed",
        exitCode: 0,
        durationMs: 100,
        stdout: "ok",
        stderr: "",
        summary: "ok",
        timedOut: false,
      },
      test: {
        command: "test",
        status: "passed",
        exitCode: 0,
        durationMs: 100,
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
    tempBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-hook-test-"));
    testRepo = path.join(tempBaseDir, "hook-repo");

    fs.mkdirSync(testRepo, { recursive: true });

    // Initialize Git
    execSync("git init -b main", { cwd: testRepo, stdio: "ignore" });
    execSync("git config user.name 'Test Hamza'", { cwd: testRepo, stdio: "ignore" });
    execSync("git config user.email 'hamza@lifeos.local'", { cwd: testRepo, stdio: "ignore" });

    // Copy workspace-pre-commit.cjs into testRepo/scripts/
    const scriptsDir = path.join(testRepo, "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    const realScript = path.resolve(process.cwd(), "scripts/workspace-pre-commit.cjs");
    fs.copyFileSync(realScript, path.join(scriptsDir, "workspace-pre-commit.cjs"));
    fs.chmodSync(path.join(scriptsDir, "workspace-pre-commit.cjs"), 0o755);

    // Initial base commit
    fs.writeFileSync(path.join(testRepo, "README.md"), "# Hook Repo\n");
    execSync("git add README.md", { cwd: testRepo, stdio: "ignore" });
    execSync("git commit -m 'Initial commit'", { cwd: testRepo, stdio: "ignore" });
  });

  afterAll(() => {
    try {
      fs.rmSync(tempBaseDir, { recursive: true, force: true });
    } catch {}
  });

  // =========================================================================
  // 1. Installation & Idempotency
  // =========================================================================
  describe("Hook Installation & Idempotency", () => {
    it("reports hook not installed initially", async () => {
      const status = await getPreCommitHookStatus(testRepo);
      expect(status.installed).toBe(false);
      expect(status.lifeosManaged).toBe(false);
    });

    it("installs LifeOS pre-commit hook idempotently", async () => {
      const res1 = await installPreCommitHook(testRepo);
      expect(res1.success).toBe(true);
      expect(res1.installed).toBe(true);
      expect(res1.backedUp).toBe(false);

      const status = await getPreCommitHookStatus(testRepo);
      expect(status.installed).toBe(true);
      expect(status.lifeosManaged).toBe(true);

      const hookContent = fs.readFileSync(status.hookPath, "utf8");
      expect(hookContent).toContain(LIFEOS_PRE_COMMIT_HOOK_MARKER);

      // Re-installing is idempotent
      const res2 = await installPreCommitHook(testRepo);
      expect(res2.success).toBe(true);
      expect(res2.installed).toBe(true);
      expect(res2.backedUp).toBe(false);
    });
  });

  // =========================================================================
  // 2. Pre-Existing Hook Preservation & Composition
  // =========================================================================
  describe("Pre-Existing Hook Composition", () => {
    it("backs up and chains pre-existing custom hooks", async () => {
      // Uninstall LifeOS hook first
      await uninstallPreCommitHook(testRepo);

      // Write custom user hook
      const hookPath = path.join(testRepo, ".git", "hooks", "pre-commit");
      fs.writeFileSync(
        hookPath,
        "#!/bin/sh\necho '[User Hook] running custom linter...'\nexit 0\n",
        { mode: 0o755 }
      );

      // Install LifeOS hook
      const installRes = await installPreCommitHook(testRepo);
      expect(installRes.success).toBe(true);
      expect(installRes.backedUp).toBe(true);

      const status = await getPreCommitHookStatus(testRepo);
      expect(status.installed).toBe(true);
      expect(status.lifeosManaged).toBe(true);
      expect(status.backupExists).toBe(true);

      // Verify backup contains custom user hook
      const backupContent = fs.readFileSync(status.backupPath!, "utf8");
      expect(backupContent).toContain("[User Hook]");
    });
  });

  // =========================================================================
  // 3. Pre-Commit Enforcement during Manual `git commit`
  // =========================================================================
  describe("Pre-Commit Hook Enforcement", () => {
    it("blocks manual `git commit` when changes lack a verification lease", () => {
      // Stage unverified change
      fs.writeFileSync(path.join(testRepo, "unverified.txt"), "unqualified edit\n");
      execSync("git add unverified.txt", { cwd: testRepo, stdio: "ignore" });

      // Execute manual git commit
      const commitRes = spawnSync("git", ["commit", "-m", "unverified commit attempt"], {
        cwd: testRepo,
        encoding: "utf8",
        env: { ...process.env, CI: "true" },
      });

      expect(commitRes.status).not.toBe(0);
      expect(commitRes.stderr + commitRes.stdout).toContain("[LifeOS Pre-Commit Gate] COMMIT BLOCKED");
      expect(commitRes.stderr + commitRes.stdout).toContain("No active Verification Qualification Lease found");

      // Verify no commit was made
      const log = execSync("git log -n 1 --pretty=format:%s", { cwd: testRepo, encoding: "utf8" });
      expect(log).not.toBe("unverified commit attempt");

      // Cleanup
      execSync("git reset HEAD unverified.txt", { cwd: testRepo, stdio: "ignore" });
      fs.unlinkSync(path.join(testRepo, "unverified.txt"));
    });

    it("allows manual `git commit` when an active valid lease exists for candidate state", async () => {
      // Stage change
      fs.writeFileSync(path.join(testRepo, "qualified.txt"), "qualified code\n");
      execSync("git add qualified.txt", { cwd: testRepo, stdio: "ignore" });

      // Acquire verification lease for current candidate
      const lease = await issueVerificationLease({
        projectRoot: testRepo,
        verificationResult: passingVerification,
        userId: testUserId,
      });

      expect(lease.leaseId).toBeDefined();

      // Execute manual git commit
      const commitRes = spawnSync("git", ["commit", "-m", "qualified commit"], {
        cwd: testRepo,
        encoding: "utf8",
        env: { ...process.env, CI: "true" },
      });

      expect(commitRes.status).toBe(0);
      expect(commitRes.stderr + commitRes.stdout).toContain("[LifeOS Gate] Verified commit authorized");

      // Verify commit succeeded in git log
      const log = execSync("git log -n 1 --pretty=format:%s", { cwd: testRepo, encoding: "utf8" });
      expect(log).toBe("qualified commit");
    });

    it("blocks manual `git commit` when candidate drifts after lease issuance", async () => {
      fs.writeFileSync(path.join(testRepo, "drift-file.txt"), "version 1\n");
      execSync("git add drift-file.txt", { cwd: testRepo, stdio: "ignore" });

      // Acquire lease
      await issueVerificationLease({
        projectRoot: testRepo,
        verificationResult: passingVerification,
        userId: testUserId,
      });

      // Cause drift
      fs.writeFileSync(path.join(testRepo, "drift-file.txt"), "version 2 (drift)\n");

      // Execute manual git commit
      const commitRes = spawnSync("git", ["commit", "-m", "drifted commit attempt"], {
        cwd: testRepo,
        encoding: "utf8",
        env: { ...process.env, CI: "true" },
      });

      expect(commitRes.status).not.toBe(0);
      expect(commitRes.stderr + commitRes.stdout).toContain("[LifeOS Pre-Commit Gate] COMMIT BLOCKED");

      // Cleanup
      execSync("git reset HEAD drift-file.txt", { cwd: testRepo, stdio: "ignore" });
      fs.unlinkSync(path.join(testRepo, "drift-file.txt"));
    });

    it("allows manual `git commit` when emergency bypass flag LIFEOS_SKIP_VERIFY=1 is set", () => {
      fs.writeFileSync(path.join(testRepo, "emergency.txt"), "emergency fix\n");
      execSync("git add emergency.txt", { cwd: testRepo, stdio: "ignore" });

      // Execute commit with bypass flag
      const commitRes = spawnSync("git", ["commit", "-m", "fix: emergency hotfix"], {
        cwd: testRepo,
        encoding: "utf8",
        env: { ...process.env, CI: "true", LIFEOS_SKIP_VERIFY: "1" },
      });

      expect(commitRes.status).toBe(0);
      expect(commitRes.stdout + commitRes.stderr).toContain("Warning: Commit verification bypassed");

      const log = execSync("git log -n 1 --pretty=format:%s", { cwd: testRepo, encoding: "utf8" });
      expect(log).toBe("fix: emergency hotfix");
    });
  });

  // =========================================================================
  // 4. Safe Uninstallation & Restoration
  // =========================================================================
  describe("Safe Uninstallation", () => {
    it("uninstalls LifeOS hook and restores original user hook", async () => {
      const uninstallRes = await uninstallPreCommitHook(testRepo);
      expect(uninstallRes.success).toBe(true);
      expect(uninstallRes.restored).toBe(true);

      const status = await getPreCommitHookStatus(testRepo);
      expect(status.lifeosManaged).toBe(false);
      expect(status.backupExists).toBe(false);

      // Verify the restored hook is the original user hook
      const content = fs.readFileSync(status.hookPath, "utf8");
      expect(content).toContain("[User Hook]");
    });
  });
});
