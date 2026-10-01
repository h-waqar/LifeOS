#!/usr/bin/env node
/**
 * LifeOS Repository Pre-Commit Hook Gating Script
 *
 * Enforces that manual or automated git commits require a valid
 * Verification Qualification Lease matching the current candidate state.
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// 1. Check bypass flag (for manual emergency overrides only)
if (process.env.LIFEOS_SKIP_VERIFY === "1" || process.env.LIFEOS_BYPASS_HOOK === "1") {
  console.warn("\x1b[33m[LifeOS Gate] Warning: Commit verification bypassed via environment variable.\x1b[0m");
  process.exit(0);
}

// 2. Resolve repository paths
const gitRootRes = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" });
if (gitRootRes.status !== 0 || !gitRootRes.stdout.trim()) {
  console.error("\x1b[31m[LifeOS Gate] Error: Cannot determine git repository root.\x1b[0m");
  process.exit(1);
}
const projectRoot = gitRootRes.stdout.trim();

const gitDirRes = spawnSync("git", ["rev-parse", "--git-dir"], {
  cwd: projectRoot,
  encoding: "utf8",
});
const rawGitDir = gitDirRes.status === 0 ? gitDirRes.stdout.trim() : ".git";
const gitDir = path.isAbsolute(rawGitDir) ? rawGitDir : path.resolve(projectRoot, rawGitDir);
const leaseDir = path.join(gitDir, "lifeos", "leases");

// 3. Compute current candidate working-tree fingerprint
function computeCandidateFingerprint() {
  const headRes = spawnSync("git", ["rev-parse", "HEAD"], { cwd: projectRoot, encoding: "utf8" });
  const headCommit = headRes.status === 0 && headRes.stdout.trim() ? headRes.stdout.trim() : "EMPTY_TREE";

  const stageRes = spawnSync("git", ["ls-files", "--stage"], { cwd: projectRoot, encoding: "utf8" });
  const indexHash = crypto.createHash("sha256").update(stageRes.stdout || "").digest("hex");

  const statusRes = spawnSync("git", ["status", "--porcelain=v1", "-uall"], { cwd: projectRoot, encoding: "utf8" });
  const statusPorcelain = statusRes.stdout || "";

  const diffRes = spawnSync("git", ["diff"], { cwd: projectRoot, encoding: "utf8" });
  const unstagedDiffHash = crypto.createHash("sha256").update(diffRes.stdout || "").digest("hex");

  const untrackedRes = spawnSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: projectRoot, encoding: "utf8" });
  const untrackedLines = (untrackedRes.stdout || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .sort();

  const untrackedHashes = [];
  for (const relPath of untrackedLines) {
    const fullPath = path.join(projectRoot, relPath);
    try {
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        const content = fs.readFileSync(fullPath);
        const fileHash = crypto.createHash("sha256").update(content).digest("hex");
        untrackedHashes.push(`${relPath}:${fileHash}`);
      }
    } catch {}
  }
  const untrackedHash = crypto.createHash("sha256").update(untrackedHashes.join("\n")).digest("hex");

  const compositePayload = JSON.stringify({
    headCommit,
    indexHash,
    statusPorcelain,
    unstagedDiffHash,
    untrackedHash,
  });

  return crypto.createHash("sha256").update(compositePayload).digest("hex");
}

const currentFingerprint = computeCandidateFingerprint();
const now = Date.now();

// 4. Validate lease
let matchedLease = null;

// Case A: Specific lease ID provided via environment (e.g. from lifeos workspace commit)
const explicitLeaseId = process.env.LIFEOS_LEASE_ID;
if (explicitLeaseId) {
  const leaseFile = path.join(leaseDir, `${explicitLeaseId}.json`);
  if (fs.existsSync(leaseFile)) {
    try {
      const lease = JSON.parse(fs.readFileSync(leaseFile, "utf8"));
      if (!lease.consumed && now <= lease.expiresAt) {
        if (lease.candidateState && lease.candidateState.fingerprint === currentFingerprint) {
          matchedLease = lease;
        }
      }
    } catch {}
  }
}

// Case B: Search available unconsumed leases in store
if (!matchedLease && fs.existsSync(leaseDir)) {
  const files = fs.readdirSync(leaseDir);
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const lease = JSON.parse(fs.readFileSync(path.join(leaseDir, file), "utf8"));
      if (!lease.consumed && now <= lease.expiresAt) {
        if (lease.candidateState && lease.candidateState.fingerprint === currentFingerprint) {
          matchedLease = lease;
          break;
        }
      }
    } catch {}
  }
}

// 5. Result enforcement
if (matchedLease) {
  console.log(`\x1b[32m[LifeOS Gate] Verified commit authorized by lease ${matchedLease.leaseId.slice(0, 8)}...\x1b[0m`);
  process.exit(0);
}

// 6. Rejected: Output actionable error message
console.error(`
\x1b[31m========================================================================\x1b[0m
\x1b[31m[LifeOS Pre-Commit Gate] COMMIT BLOCKED\x1b[0m
\x1b[31m========================================================================\x1b[0m
No active Verification Qualification Lease found matching the current candidate state.

In LifeOS, all commits require verified qualification evidence to prevent
broken builds, regressions, and unverified code from entering the repository.

\x1b[36mTo commit through the LifeOS verified workflow:\x1b[0m
  pnpm lifeos workspace commit -m "<message>"

\x1b[36mOr qualify your changes first to obtain a lease:\x1b[0m
  pnpm lifeos workspace verify --issue-lease
\x1b[31m========================================================================\x1b[0m
`);

process.exit(1);
