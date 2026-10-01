/**
 * Sandboxed Audited Git Commit Execution Engine
 *
 * Requirements:
 * - WORK-01: Sandboxed workspace process boundary.
 * - WORK-04: Git commits require valid verification evidence.
 * - SAFE-01: Zero-trust capability enforcement (EXECUTE tier).
 * - SAFE-04: Full forensic attribution audit in agent_audit_log.
 *
 * Security Invariants:
 * 1. Requires an active, unexpired, unconsumed Verification Qualification Lease.
 * 2. Re-validates working-tree candidate fingerprint immediately before commit (anti-TOCTOU).
 * 3. Never introduces --no-verify; preserves git pre-commit hook execution.
 * 4. Staging policy: commits only existing staged changes; rejects empty index; rejects drift.
 * 5. Reconciles commit outcome against HEAD advance to eliminate uncertain/duplicate commits.
 */

import { spawn } from "child_process";
import { executeAgentOperation, type AgentOperationResult } from "../safety-boundary";
import type { AgentSafetyContext } from "../permissions/types";
import { getCanonicalProjectRoot } from "./sandbox";
import { inspectGitStatus, runPreCommitVerification } from "./verification-gate";
import {
  computeWorkingTreeFingerprint,
  validateVerificationLease,
  findActiveLeaseForCandidate,
  issueVerificationLease,
  consumeVerificationLease,
} from "./lease-manager";
import type {
  WorkspaceCommitInput,
  WorkspaceCommitResult,
  WorkspaceRunnerConfig,
  VerificationLease,
} from "./types";
import { CommitExecutionError } from "./types";

/**
 * Low-level child process execution for `git commit`.
 * Uses fixed argument arrays, shell: false, and environment isolation.
 */
async function spawnGitCommit(
  args: string[],
  projectRoot: string,
  envVars: Record<string, string>,
  timeoutMs = 15000
): Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    let timedOut = false;
    let timer: NodeJS.Timeout | null = null;

    try {
      const sanitizedEnv: NodeJS.ProcessEnv = {
        ...process.env,
        CI: "true",
        ...envVars,
      };

      const child = spawn("git", args, {
        cwd: projectRoot,
        shell: false,
        env: sanitizedEnv,
      });

      let stdout = "";
      let stderr = "";

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          timedOut = true;
          try {
            child.kill("SIGKILL");
          } catch {}
        }, timeoutMs);
      }

      child.stdout?.on("data", (d: Buffer | string) => {
        stdout += d.toString();
      });

      child.stderr?.on("data", (d: Buffer | string) => {
        stderr += d.toString();
      });

      child.on("close", (exitCode) => {
        if (timer) clearTimeout(timer);
        resolve({ stdout, stderr, exitCode, timedOut });
      });

      child.on("error", (err) => {
        if (timer) clearTimeout(timer);
        resolve({ stdout, stderr: err.message, exitCode: -1, timedOut });
      });
    } catch (err: any) {
      if (timer) clearTimeout(timer);
      resolve({ stdout: "", stderr: err.message, exitCode: -1, timedOut });
    }
  });
}

/**
 * Gets current HEAD commit hash.
 */
async function getHeadCommit(projectRoot: string): Promise<string> {
  return new Promise((resolve) => {
    try {
      const child = spawn("git", ["rev-parse", "HEAD"], {
        cwd: projectRoot,
        shell: false,
        env: { ...process.env, CI: "true" },
      });
      let stdout = "";
      child.stdout?.on("data", (d) => {
        stdout += d.toString();
      });
      child.on("close", (code) => {
        if (code === 0 && stdout.trim().length > 0) {
          return resolve(stdout.trim());
        }
        resolve("EMPTY_TREE");
      });
      child.on("error", () => resolve("EMPTY_TREE"));
    } catch {
      resolve("EMPTY_TREE");
    }
  });
}

/**
 * Core business logic for sandboxed Git commit execution.
 */
export async function executeWorkspaceCommit(
  input: WorkspaceCommitInput,
  userId: string,
  runnerConfig?: WorkspaceRunnerConfig,
  safetyContext?: AgentSafetyContext
): Promise<WorkspaceCommitResult> {
  const startTime = Date.now();
  const projectRoot = getCanonicalProjectRoot(runnerConfig?.projectRoot);

  if (!input.message || typeof input.message !== "string" || input.message.trim().length === 0) {
    throw new CommitExecutionError(
      "Commit message cannot be empty",
      "EMPTY_COMMIT_MESSAGE"
    );
  }

  const trimmedMessage = input.message.trim();
  if (trimmedMessage.length > 2000) {
    throw new CommitExecutionError(
      "Commit message exceeds maximum allowed length of 2000 characters",
      "COMMIT_MESSAGE_TOO_LONG"
    );
  }

  // 1. Inspect Git working tree and index status
  const gitStatus = await inspectGitStatus(projectRoot);
  const headBefore = await getHeadCommit(projectRoot);

  if (gitStatus.conflictDetected) {
    return {
      outcome: "MERGE_CONFLICT",
      success: false,
      commitHash: null,
      message: trimmedMessage,
      summary: `Commit blocked: Merge conflicts detected in working tree.`,
      stdout: "",
      stderr: gitStatus.summary,
      durationMs: Date.now() - startTime,
      headCommitBefore: headBefore,
      headCommitAfter: headBefore,
    };
  }

  if (!gitStatus.hasStagedChanges) {
    return {
      outcome: "NO_STAGED_CHANGES",
      success: false,
      commitHash: null,
      message: trimmedMessage,
      summary: "Commit blocked: No staged changes found in repository. Stage intended changes before committing.",
      stdout: "",
      stderr: "No staged changes to commit.",
      durationMs: Date.now() - startTime,
      headCommitBefore: headBefore,
      headCommitAfter: headBefore,
    };
  }

  // 2. Candidate fingerprint and lease qualification
  const currentFingerprint = await computeWorkingTreeFingerprint(projectRoot);
  let activeLease: VerificationLease | null = null;

  if (input.leaseId) {
    // Explicit lease supplied
    const valResult = await validateVerificationLease(
      projectRoot,
      input.leaseId,
      currentFingerprint,
      userId
    );

    if (!valResult.valid || !valResult.lease) {
      const reason = valResult.reason || "Invalid lease";
      const outcome = reason.includes("expired")
        ? "EXPIRED_LEASE"
        : reason.includes("drifted")
        ? "FINGERPRINT_MISMATCH"
        : "INVALID_LEASE";

      return {
        outcome,
        success: false,
        commitHash: null,
        message: trimmedMessage,
        leaseId: input.leaseId,
        summary: `Commit rejected: ${reason}`,
        stdout: "",
        stderr: reason,
        durationMs: Date.now() - startTime,
        headCommitBefore: headBefore,
        headCommitAfter: headBefore,
      };
    }
    activeLease = valResult.lease;
  } else if (input.autoVerify) {
    // Run auto-verification
    const verifyResult = await runPreCommitVerification(
      {
        checks: input.verificationChecks,
        testArgs: input.testArgs,
        subpath: input.subpath,
      },
      runnerConfig
    );

    if (!verifyResult.passed) {
      return {
        outcome: "VERIFICATION_FAILED",
        success: false,
        commitHash: null,
        message: trimmedMessage,
        summary: `Commit rejected: Pre-commit verification failed (${verifyResult.failureReason || "check failed"}).`,
        stdout: "",
        stderr: verifyResult.failureReason || "Verification failed",
        durationMs: Date.now() - startTime,
        headCommitBefore: headBefore,
        headCommitAfter: headBefore,
      };
    }

    // Issue fresh lease
    activeLease = await issueVerificationLease({
      projectRoot,
      verificationResult: verifyResult,
      userId,
      agentId: safetyContext?.agent?.id ?? null,
      sessionId: safetyContext?.sessionId ?? null,
    });
  } else {
    // Search for active unconsumed lease matching candidate fingerprint
    const candidateLease = await findActiveLeaseForCandidate(
      projectRoot,
      currentFingerprint.fingerprint,
      userId
    );

    if (!candidateLease) {
      return {
        outcome: "INVALID_LEASE",
        success: false,
        commitHash: null,
        message: trimmedMessage,
        summary:
          "Commit rejected: No valid Verification Qualification Lease found matching current candidate state. " +
          "Run 'lifeos workspace verify' to qualify changes before committing.",
        stdout: "",
        stderr: "No active verification lease found for candidate fingerprint.",
        durationMs: Date.now() - startTime,
        headCommitBefore: headBefore,
        headCommitAfter: headBefore,
      };
    }
    activeLease = candidateLease;
  }

  // 3. Anti-TOCTOU Re-Validation immediately before execution
  const preExecFingerprint = await computeWorkingTreeFingerprint(projectRoot);
  if (preExecFingerprint.fingerprint !== activeLease.candidateState.fingerprint) {
    return {
      outcome: "FINGERPRINT_MISMATCH",
      success: false,
      commitHash: null,
      message: trimmedMessage,
      leaseId: activeLease.leaseId,
      summary:
        "Commit aborted: Candidate state drifted immediately prior to commit execution. " +
        "Working tree or index was modified during the verification-to-commit window.",
      stdout: "",
      stderr: "Immediate pre-commit TOCTOU validation failed: candidate state drifted.",
      durationMs: Date.now() - startTime,
      headCommitBefore: headBefore,
      headCommitAfter: headBefore,
    };
  }

  // 4. Build argument array for git commit (NO SHELL INTERPOLATION, NO --no-verify)
  const commitArgs: string[] = ["commit", "-m", trimmedMessage];

  if (input.author) {
    commitArgs.push("--author", `${input.author.name} <${input.author.email}>`);
  }

  // Pass active lease ID and user ID to git environment for pre-commit hook composition
  const hookEnv: Record<string, string> = {
    LIFEOS_LEASE_ID: activeLease.leaseId,
    LIFEOS_USER_ID: userId,
  };

  // 5. Execute commit
  const spawnRes = await spawnGitCommit(
    commitArgs,
    projectRoot,
    hookEnv,
    input.timeoutMs ?? 15000
  );

  const headAfter = await getHeadCommit(projectRoot);
  const headAdvanced = headAfter !== headBefore && headAfter !== "EMPTY_TREE";

  // 6. Outcome Reconciliation
  if (headAdvanced) {
    // Commit succeeded! Atomically consume lease
    await consumeVerificationLease(projectRoot, activeLease.leaseId, headAfter);

    const outcome = spawnRes.exitCode === 0 ? "COMMIT_SUCCESS" : "RECONCILED_SUCCESS";
    return {
      outcome,
      success: true,
      commitHash: headAfter,
      message: trimmedMessage,
      leaseId: activeLease.leaseId,
      summary: `Git commit successful (${headAfter.slice(0, 8)}): "${trimmedMessage}"`,
      stdout: spawnRes.stdout,
      stderr: spawnRes.stderr,
      durationMs: Date.now() - startTime,
      headCommitBefore: headBefore,
      headCommitAfter: headAfter,
    };
  }

  // Commit did not advance HEAD -> failed
  return {
    outcome: "EXECUTION_FAILURE",
    success: false,
    commitHash: null,
    message: trimmedMessage,
    leaseId: activeLease.leaseId,
    summary: spawnRes.timedOut
      ? "Git commit timed out and HEAD did not advance."
      : `Git commit execution failed (exit code ${spawnRes.exitCode}): ${spawnRes.stderr || spawnRes.stdout}`,
    stdout: spawnRes.stdout,
    stderr: spawnRes.stderr,
    durationMs: Date.now() - startTime,
    headCommitBefore: headBefore,
    headCommitAfter: headAfter,
  };
}

/**
 * Authorized Agent Operation Entry Point for Sandboxed Git Commit.
 * Gated under EXECUTE tier capability with full forensic audit logging.
 */
export async function runSandboxedWorkspaceCommit(
  context: AgentSafetyContext,
  input: WorkspaceCommitInput,
  targetUserId: string,
  runnerConfig?: WorkspaceRunnerConfig,
  dbClient?: any
): Promise<AgentOperationResult<WorkspaceCommitResult>> {
  const operationName = "workspace.commit";

  return await executeAgentOperation<WorkspaceCommitInput, WorkspaceCommitResult>({
    context,
    toolName: operationName,
    operation: operationName,
    arguments: input,
    targetUserId,
    dbClient,
    getBeforeState: async () => {
      const canonicalRoot = getCanonicalProjectRoot(runnerConfig?.projectRoot);
      const head = await getHeadCommit(canonicalRoot);
      return { headCommit: head, leaseId: input.leaseId ?? null };
    },
    getAfterState: async (res: WorkspaceCommitResult) => {
      return {
        outcome: res.outcome,
        success: res.success,
        commitHash: res.commitHash ?? null,
        leaseId: res.leaseId ?? null,
      };
    },
    executor: async () => {
      return await executeWorkspaceCommit(input, targetUserId, runnerConfig, context);
    },
  });
}
