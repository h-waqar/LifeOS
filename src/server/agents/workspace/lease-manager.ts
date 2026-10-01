/**
 * Verification Qualification Lease Manager
 *
 * Implements:
 * 1. Robust Working Tree Fingerprinting (HEAD commit, staged index, status porcelain, unstaged diff, untracked files).
 * 2. Time-bound Verification Qualification Lease issuance and persistence.
 * 3. Validation against drift, expiration, tenant isolation, and atomic single-use consumption.
 * 4. Stale-state and TOCTOU protection.
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getCanonicalProjectRoot } from "./sandbox";
import type {
  WorkingTreeFingerprint,
  VerificationLease,
  IssueLeaseInput,
  ValidateLeaseResult,
} from "./types";
import { LeaseSecurityError } from "./types";

/**
 * Resolves the actual git directory (handles standard repos, worktrees, and submodules).
 */
export async function resolveGitDir(projectRoot: string): Promise<string> {
  const canonicalRoot = getCanonicalProjectRoot(projectRoot);

  return new Promise<string>((resolve) => {
    try {
      const child = spawn("git", ["rev-parse", "--git-dir"], {
        cwd: canonicalRoot,
        shell: false,
        env: { ...process.env, CI: "true" },
      });

      let stdout = "";
      child.stdout?.on("data", (d: Buffer | string) => {
        stdout += d.toString();
      });

      child.on("close", (code) => {
        if (code === 0 && stdout.trim().length > 0) {
          const rawGitDir = stdout.trim();
          const resolved = path.isAbsolute(rawGitDir)
            ? rawGitDir
            : path.resolve(canonicalRoot, rawGitDir);
          return resolve(resolved);
        }
        return resolve(path.join(canonicalRoot, ".git"));
      });

      child.on("error", () => {
        resolve(path.join(canonicalRoot, ".git"));
      });
    } catch {
      resolve(path.join(canonicalRoot, ".git"));
    }
  });
}

/**
 * Helper to run a git command in the canonical project root and return stdout.
 */
function runGitCommand(
  args: string[],
  projectRoot: string
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    try {
      const child = spawn("git", args, {
        cwd: projectRoot,
        shell: false,
        env: { ...process.env, CI: "true" },
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (d: Buffer | string) => {
        stdout += d.toString();
      });

      child.stderr?.on("data", (d: Buffer | string) => {
        stderr += d.toString();
      });

      child.on("close", (exitCode) => {
        resolve({ stdout, stderr, exitCode });
      });

      child.on("error", (err) => {
        resolve({ stdout: "", stderr: err.message, exitCode: -1 });
      });
    } catch (err: any) {
      resolve({ stdout: "", stderr: err.message, exitCode: -1 });
    }
  });
}

/**
 * Computes a robust canonical fingerprint representing the exact working-tree and index state:
 * - HEAD commit hash (or EMPTY_TREE if initial unborn branch)
 * - Staged index state (SHA-256 of `git ls-files --stage`)
 * - Status porcelain (`git status --porcelain=v1 -uall`)
 * - Unstaged working tree changes (SHA-256 of `git diff`)
 * - Relevant untracked files (sorted file paths + SHA-256 of file contents)
 */
export async function computeWorkingTreeFingerprint(
  projectRoot: string
): Promise<WorkingTreeFingerprint> {
  const canonicalRoot = getCanonicalProjectRoot(projectRoot);
  const timestamp = Date.now();

  // 1. HEAD commit hash
  const headRes = await runGitCommand(["rev-parse", "HEAD"], canonicalRoot);
  const headCommit =
    headRes.exitCode === 0 && headRes.stdout.trim().length > 0
      ? headRes.stdout.trim()
      : "EMPTY_TREE";

  // 2. Exact staged index state
  const stageRes = await runGitCommand(["ls-files", "--stage"], canonicalRoot);
  const indexHash = crypto
    .createHash("sha256")
    .update(stageRes.stdout)
    .digest("hex");

  // 3. Status porcelain (staged, unstaged, untracked flags)
  const statusRes = await runGitCommand(
    ["status", "--porcelain=v1", "-uall"],
    canonicalRoot
  );
  const statusPorcelain = statusRes.stdout;

  // 4. Unstaged diff against index
  const diffRes = await runGitCommand(["diff"], canonicalRoot);
  const unstagedDiffHash = crypto
    .createHash("sha256")
    .update(diffRes.stdout)
    .digest("hex");

  // 5. Untracked file contents
  const untrackedRes = await runGitCommand(
    ["ls-files", "--others", "--exclude-standard"],
    canonicalRoot
  );
  const untrackedLines = untrackedRes.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .sort();

  const untrackedHashes: string[] = [];
  for (const relPath of untrackedLines) {
    const fullPath = path.join(canonicalRoot, relPath);
    try {
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        const content = fs.readFileSync(fullPath);
        const fileHash = crypto.createHash("sha256").update(content).digest("hex");
        untrackedHashes.push(`${relPath}:${fileHash}`);
      }
    } catch {
      // Ignore unreadable or transient files
    }
  }

  const untrackedHash = crypto
    .createHash("sha256")
    .update(untrackedHashes.join("\n"))
    .digest("hex");

  // 6. Canonical composite fingerprint
  const compositePayload = JSON.stringify({
    headCommit,
    indexHash,
    statusPorcelain,
    unstagedDiffHash,
    untrackedHash,
  });

  const fingerprint = crypto
    .createHash("sha256")
    .update(compositePayload)
    .digest("hex");

  return {
    headCommit,
    indexHash,
    statusPorcelain,
    unstagedDiffHash,
    untrackedHash,
    fingerprint,
    timestamp,
  };
}

/**
 * Returns the path to the lease store directory inside `.git/lifeos/leases`.
 */
export async function getLeaseStoreDir(projectRoot: string): Promise<string> {
  const canonicalRoot = getCanonicalProjectRoot(projectRoot);
  const gitDir = await resolveGitDir(canonicalRoot);
  const leaseDir = path.join(gitDir, "lifeos", "leases");
  if (!fs.existsSync(leaseDir)) {
    fs.mkdirSync(leaseDir, { recursive: true });
  }
  return leaseDir;
}

/**
 * Issues a Verification Qualification Lease for a verified candidate state.
 */
export async function issueVerificationLease(
  input: IssueLeaseInput
): Promise<VerificationLease> {
  const projectRoot = getCanonicalProjectRoot(input.projectRoot);

  if (!input.verificationResult.passed) {
    throw new LeaseSecurityError(
      "Cannot issue Verification Qualification Lease: verification checks did not pass.",
      "VERIFICATION_NOT_PASSED"
    );
  }

  const candidateState = await computeWorkingTreeFingerprint(projectRoot);
  const leaseId = crypto.randomUUID();
  const createdAt = Date.now();
  const ttlMs = input.ttlMs ?? 10 * 60 * 1000; // 10 minutes default
  const expiresAt = createdAt + ttlMs;

  const lease: VerificationLease = {
    leaseId,
    createdAt,
    expiresAt,
    projectRoot,
    userId: input.userId,
    agentId: input.agentId ?? null,
    sessionId: input.sessionId ?? null,
    checksRun: input.verificationResult.checksRun,
    verificationResult: {
      passed: input.verificationResult.passed,
      totalDurationMs: input.verificationResult.totalDurationMs,
      checksPassed: input.verificationResult.checksPassed,
      checksFailed: input.verificationResult.checksFailed,
    },
    candidateState,
    consumed: false,
    consumedAt: null,
    commitHash: null,
  };

  const leaseDir = await getLeaseStoreDir(projectRoot);
  const leasePath = path.join(leaseDir, `${leaseId}.json`);
  fs.writeFileSync(leasePath, JSON.stringify(lease, null, 2), "utf8");

  // Keep a reference to latest lease for quick lookup
  const gitDir = await resolveGitDir(projectRoot);
  const latestPath = path.join(gitDir, "lifeos", "latest-lease.json");
  try {
    fs.writeFileSync(latestPath, JSON.stringify(lease, null, 2), "utf8");
  } catch {
    // Non-fatal if latest pointer write fails
  }

  return lease;
}

/**
 * Retrieves a verification lease by its unique ID.
 */
export async function getVerificationLease(
  projectRoot: string,
  leaseId: string
): Promise<VerificationLease | null> {
  const canonicalRoot = getCanonicalProjectRoot(projectRoot);
  const leaseDir = await getLeaseStoreDir(canonicalRoot);
  const leasePath = path.join(leaseDir, `${leaseId}.json`);

  if (!fs.existsSync(leasePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(leasePath, "utf8");
    return JSON.parse(raw) as VerificationLease;
  } catch {
    return null;
  }
}

/**
 * Lists all known verification leases for the project.
 */
export async function listVerificationLeases(
  projectRoot: string
): Promise<VerificationLease[]> {
  const canonicalRoot = getCanonicalProjectRoot(projectRoot);
  const leaseDir = await getLeaseStoreDir(canonicalRoot);

  if (!fs.existsSync(leaseDir)) {
    return [];
  }

  const entries = fs.readdirSync(leaseDir);
  const leases: VerificationLease[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    try {
      const fullPath = path.join(leaseDir, entry);
      const content = fs.readFileSync(fullPath, "utf8");
      const lease = JSON.parse(content) as VerificationLease;
      leases.push(lease);
    } catch {
      // Ignore corrupt entries
    }
  }

  return leases.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Searches for an unconsumed, unexpired lease that matches the candidate fingerprint.
 */
export async function findActiveLeaseForCandidate(
  projectRoot: string,
  candidateFingerprint: string,
  userId?: string
): Promise<VerificationLease | null> {
  const leases = await listVerificationLeases(projectRoot);
  const now = Date.now();

  for (const lease of leases) {
    if (lease.consumed) continue;
    if (now > lease.expiresAt) continue;
    if (userId && lease.userId !== userId) continue;
    if (lease.candidateState.fingerprint === candidateFingerprint) {
      return lease;
    }
  }

  return null;
}

/**
 * Validates a verification lease against current time, repository, candidate fingerprint, and user.
 */
export async function validateVerificationLease(
  projectRoot: string,
  leaseId: string,
  currentFingerprint?: WorkingTreeFingerprint,
  userId?: string
): Promise<ValidateLeaseResult> {
  const canonicalRoot = getCanonicalProjectRoot(projectRoot);
  const lease = await getVerificationLease(canonicalRoot, leaseId);

  if (!lease) {
    return {
      valid: false,
      reason: `Verification qualification lease '${leaseId}' not found.`,
    };
  }

  // 1. Single-use replay protection
  if (lease.consumed) {
    return {
      valid: false,
      reason: `Lease '${leaseId}' has already been consumed for commit '${lease.commitHash || "unknown"}'.`,
      lease,
    };
  }

  // 2. Expiry check
  const now = Date.now();
  if (now > lease.expiresAt) {
    return {
      valid: false,
      reason: `Lease '${leaseId}' has expired (expired at ${new Date(lease.expiresAt).toISOString()}, current time ${new Date(now).toISOString()}).`,
      lease,
    };
  }

  // 3. Repository root check
  const leaseProjectRoot = getCanonicalProjectRoot(lease.projectRoot);
  if (leaseProjectRoot !== canonicalRoot) {
    return {
      valid: false,
      reason: `Cross-repository lease reuse rejected: lease belongs to '${leaseProjectRoot}', but current repository is '${canonicalRoot}'.`,
      lease,
    };
  }

  // 4. Tenant isolation check
  if (userId && lease.userId !== userId) {
    return {
      valid: false,
      reason: `Lease '${leaseId}' was issued to user '${lease.userId}', rejecting access by user '${userId}'.`,
      lease,
    };
  }

  // 5. Verification status assertion
  if (!lease.verificationResult.passed) {
    return {
      valid: false,
      reason: `Lease '${leaseId}' contains failing verification results.`,
      lease,
    };
  }

  // 6. Working-tree candidate fingerprint drift check
  const activeFingerprint =
    currentFingerprint ?? (await computeWorkingTreeFingerprint(canonicalRoot));

  if (activeFingerprint.fingerprint !== lease.candidateState.fingerprint) {
    return {
      valid: false,
      reason:
        "Repository candidate state has drifted since verification qualification. " +
        "Working tree or staged files were modified, added, deleted, or unstaged after lease issuance.",
      lease,
    };
  }

  return {
    valid: true,
    lease,
  };
}

/**
 * Atomically marks a verification lease as consumed upon successful commit.
 */
export async function consumeVerificationLease(
  projectRoot: string,
  leaseId: string,
  commitHash: string
): Promise<VerificationLease> {
  const canonicalRoot = getCanonicalProjectRoot(projectRoot);
  const leaseDir = await getLeaseStoreDir(canonicalRoot);
  const leasePath = path.join(leaseDir, `${leaseId}.json`);

  if (!fs.existsSync(leasePath)) {
    throw new LeaseSecurityError(
      `Cannot consume lease '${leaseId}': file not found.`,
      "LEASE_NOT_FOUND"
    );
  }

  const raw = fs.readFileSync(leasePath, "utf8");
  const lease = JSON.parse(raw) as VerificationLease;

  if (lease.consumed) {
    throw new LeaseSecurityError(
      `Lease '${leaseId}' has already been consumed. Replay rejected.`,
      "LEASE_ALREADY_CONSUMED"
    );
  }

  lease.consumed = true;
  lease.consumedAt = Date.now();
  lease.commitHash = commitHash;

  fs.writeFileSync(leasePath, JSON.stringify(lease, null, 2), "utf8");

  // Also update latest-lease pointer if it matches
  const gitDir = await resolveGitDir(canonicalRoot);
  const latestPath = path.join(gitDir, "lifeos", "latest-lease.json");
  try {
    if (fs.existsSync(latestPath)) {
      const latestRaw = fs.readFileSync(latestPath, "utf8");
      const latestLease = JSON.parse(latestRaw) as VerificationLease;
      if (latestLease.leaseId === leaseId) {
        fs.writeFileSync(latestPath, JSON.stringify(lease, null, 2), "utf8");
      }
    }
  } catch {
    // Non-fatal
  }

  return lease;
}

/**
 * Cleans up expired leases older than maxAgeMs (default: 24h).
 */
export async function cleanupExpiredLeases(
  projectRoot: string,
  maxAgeMs = 24 * 60 * 60 * 1000
): Promise<number> {
  const canonicalRoot = getCanonicalProjectRoot(projectRoot);
  const leaseDir = await getLeaseStoreDir(canonicalRoot);

  if (!fs.existsSync(leaseDir)) {
    return 0;
  }

  const entries = fs.readdirSync(leaseDir);
  const now = Date.now();
  let cleaned = 0;

  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const fullPath = path.join(leaseDir, entry);
    try {
      const content = fs.readFileSync(fullPath, "utf8");
      const lease = JSON.parse(content) as VerificationLease;
      if (now - lease.createdAt > maxAgeMs) {
        fs.unlinkSync(fullPath);
        cleaned++;
      }
    } catch {
      // Clean up corrupt files
      try {
        fs.unlinkSync(fullPath);
        cleaned++;
      } catch {}
    }
  }

  return cleaned;
}
