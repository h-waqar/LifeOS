---
phase: 18-closed-loop-autonomous-agent-execution-verified-commit-engine
plan: 02
one-liner: Verification qualification leases, sandboxed audited commit execution, and pre-commit hook gating with zero drift
requirements-completed:
  - WORK-01
  - WORK-02
  - WORK-04
  - SAFE-01
  - SAFE-04
  - MCP-03
key-files:
  created:
    - src/server/agents/workspace/lease-manager.ts
    - src/server/agents/workspace/commit-executor.ts
    - src/server/agents/workspace/git-hook.ts
    - scripts/workspace-pre-commit.cjs
    - scripts/tests/phase-18/plan-02/lease-qualification.test.ts
    - scripts/tests/phase-18/plan-02/sandboxed-commit.test.ts
    - scripts/tests/phase-18/plan-02/pre-commit-hook.test.ts
    - scripts/tests/phase-18/plan-02/commit-adversarial.test.ts
  modified:
    - src/server/agents/permissions/evaluator.ts
    - skills/lifeos/workspace-development/SKILL.md
key-decisions:
  - "Cryptographic Candidate Fingerprint: 5-tuple SHA-256 fingerprint invalidating leases upon any working-tree drift"
  - "Anti-TOCTOU Re-Validation: Candidate fingerprint recomputed immediately before git commit process execution"
---

# Plan 18-02: Verification Qualification Leases, Sandboxed Audited Commit & Pre-Commit Hook Gating — Summary

## Execution Summary

Plan 18-02 delivers the verified commit engine for LifeOS Phase 18, ensuring that all Git commits performed through agent harnesses or ordinary terminal workflows require valid, unexpired, drift-free verification evidence:

1. **Verification Qualification Leases (`src/server/agents/workspace/lease-manager.ts`)**:
   - `computeWorkingTreeFingerprint()`: Cryptographic composite SHA-256 fingerprint capturing:
     - `headCommit`: `git rev-parse HEAD` (or `EMPTY_TREE`)
     - `indexHash`: SHA-256 of staged index entries (`git ls-files --stage`)
     - `statusPorcelain`: `git status --porcelain=v1 -uall`
     - `unstagedDiffHash`: SHA-256 of working-tree vs index diff (`git diff`)
     - `untrackedHash`: SHA-256 of sorted paths and contents of untracked files (`git ls-files --others --exclude-standard`)
   - `issueVerificationLease()`: Issues a time-bound `VerificationLease` (default: 10 minutes) stored in `.git/lifeos/leases/${leaseId}.json` strictly conditional upon successful verification.
   - `validateVerificationLease()`: Evaluates leases against TTL expiration, canonical repository root matching, tenant isolation, and candidate working-tree drift.
   - `consumeVerificationLease()`: Atomically marks leases as consumed upon successful commit, preventing replay attacks.

2. **Audited Sandboxed Git Commit Execution (`src/server/agents/workspace/commit-executor.ts`)**:
   - `executeWorkspaceCommit()`: Sandboxed commit execution engine using argument arrays (no shell interpolation), execution timeouts, and strict staging policies:
     - Rejects empty staging index (`NO_STAGED_CHANGES`).
     - Rejects merge conflicts (`MERGE_CONFLICT`).
     - Enforces active Verification Qualification Lease matching candidate state.
     - Protects against TOCTOU race conditions by re-verifying fingerprint immediately before process execution.
     - Preserves git hook execution (strictly avoids `--no-verify`).
     - Passes `LIFEOS_LEASE_ID` and `LIFEOS_USER_ID` in child process environment.
     - Reconciles uncertain outcomes against HEAD commit advancement to eliminate duplicate or unrecorded commits.
   - `runSandboxedWorkspaceCommit()`: Gated under `EXECUTE` tier capability via `executeAgentOperation`, capturing full `beforeState` and `afterState` forensic audit records in `agent_audit_log`.

3. **Pre-Commit Hook Gating & Composition (`src/server/agents/workspace/git-hook.ts`, `scripts/workspace-pre-commit.cjs`)**:
   - `scripts/workspace-pre-commit.cjs`: Standalone executable hook script that inspects candidate state against `.git/lifeos/leases/`. Blocks unqualified manual commits with exit code 1 and actionable remediation instructions; authorizes qualified commits with exit code 0.
   - `installPreCommitHook()`: Idempotently installs the LifeOS pre-commit hook into `.git/hooks/pre-commit`.
   - Non-destructive composition: Preserves pre-existing user hooks by backing up to `pre-commit.pre-lifeos` and chaining execution after LifeOS gate qualification.
   - `uninstallPreCommitHook()`: Restores backed-up hooks cleanly upon removal.
   - `getPreCommitHookStatus()`: Reports installation and management status.
   - Emergency bypass: `LIFEOS_SKIP_VERIFY=1` environment variable supported for emergency recovery.

4. **Agent Surfaces Parity (CLI, MCP Tools, Skills)**:
   - CLI subcommands:
     - `lifeos workspace commit -m "<message>" [--lease-id <id>] [--auto-verify]`
     - `lifeos workspace lease create|get|list`
     - `lifeos workspace hook install|uninstall|status`
     - `lifeos workspace verify --issue-lease`
   - MCP tools:
     - `lifeos_workspace_commit` (`EXECUTE`)
     - `lifeos_workspace_acquire_lease` (`EXECUTE`)
     - `lifeos_workspace_hook_status` (`READ`)
   - Skill documentation:
     - Updated `skills/lifeos/workspace-development/SKILL.md` with Steps 7, 8, and 9 covering lease acquisition, audited commit execution, and pre-commit hook management.

---

## Verification & Test Results

| Test Suite | File | Tests Passed | Status |
|------------|------|--------------|--------|
| Lease Qualification & Fingerprinting | `scripts/tests/phase-18/plan-02/lease-qualification.test.ts` | 15 / 15 | PASS |
| Sandboxed Audited Commit Execution | `scripts/tests/phase-18/plan-02/sandboxed-commit.test.ts` | 9 / 9 | PASS |
| Git Pre-Commit Hook Gating & Chaining | `scripts/tests/phase-18/plan-02/pre-commit-hook.test.ts` | 8 / 8 | PASS |
| Zero-Trust Security & Adversarial Commit | `scripts/tests/phase-18/plan-02/commit-adversarial.test.ts` | 7 / 7 | PASS |
| **Plan 18-02 Subtotal** | 4 files | **39 / 39** | **PASS** |
| Plan 18-01 Test Suites | `scripts/tests/phase-18/plan-01/` | 31 / 31 | PASS |
| Phase 16 Regression Suites | `scripts/tests/phase-16/` | 108 / 108 | PASS |
| Phase 17 Regression Suites | `scripts/tests/phase-17/` | 21 / 21 | PASS |
| **Multi-Phase Grand Total** | **13 files** | **178 / 178** | **PASS** |

### Static Analysis & Build
- `pnpm exec tsc --noEmit`: Exit code 0 (0 errors).
- `pnpm exec next build`: Exit code 0 (31/31 routes compiled and prerendered successfully).
