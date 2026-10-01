---
name: workspace-development
description: "Sandboxed workspace execution, development plan materialization into LifeOS tasks, test and build verification, and pre-commit gate qualification."
version: 1.0.0
trigger_when:
  - "User or agent requests materializing an implementation plan into LifeOS tasks"
  - "Agent needs to run tests, typecheck, build, or lint inside the project sandbox"
  - "Agent prepares to commit changes and must satisfy pre-commit verification gates"
allowed_operations:
  - "lifeos_workspace_run"
  - "lifeos_workspace_verify"
  - "lifeos_workspace_materialize_plan"
  - "lifeos_workspace_plan_status"
  - "lifeos_workspace_next_task"
  - "lifeos_workspace_execute_step"
  - "lifeos_workspace_commit"
  - "lifeos_workspace_acquire_lease"
  - "lifeos_workspace_hook_status"
  - "lifeos_list_tasks"
  - "lifeos_get_task"
  - "workspace.run"
  - "workspace.test"
  - "workspace.typecheck"
  - "workspace.build"
  - "workspace.lint"
  - "workspace.verify"
  - "workspace.materialize_plan"
  - "workspace.status"
  - "workspace.next-task"
  - "workspace.step"
  - "workspace.commit"
  - "workspace.lease.create"
  - "workspace.hook.install"
  - "workspace.hook.status"
required_context:
  - "lifeos://context/projects/active"
  - "lifeos://workspace/plans/{planId}"
verification_requirements:
  - "All plan steps must specify valid non-cyclical dependencies"
  - "Plan execution loop must resolve single unblocked tasks and reconcile verification outcomes without false progress"
  - "Pre-commit verification must pass typecheck, test, build, and lint with 0 errors before committing"
tags:
  - "workspace"
  - "development"
  - "verification"
  - "plan-execution"
  - "next-task"
  - "closed-loop"
  - "pre-commit"
---

# Procedural Skill: Workspace Development, Plan Materialization & Verification

This skill guides agents through safely executing within the LifeOS workspace sandbox, transforming development plans into structured tasks, running allowlisted project commands, and verifying code before committing.

## Objectives
1. Restrict all process execution and file access to the canonical project repository root.
2. Materialize approved implementation plans into prioritized LifeOS tasks with deterministic topological ordering and cycle rejection.
3. Validate code changes via sequential pre-commit verification gates (`typecheck` -> `test` -> `build` -> `lint`).
4. Prevent code commits when any verification check fails.

## Step-by-Step Procedure

### Step 1: Implementation Plan Preparation
- Structure development plans with unique step IDs, titles, priorities (`low`, `medium`, `high`, `critical`), and optional durations and dependencies.
- Ensure the dependency graph is an acyclic directed graph (DAG). Self-dependencies and circular dependencies are rejected fail-closed.
- Bind the plan to an existing active project owned by the user.

### Step 2: Plan Materialization
- Via CLI:
  ```bash
  lifeos workspace materialize --project-id <PROJECT_ID> --plan-file <PATH_TO_PLAN.json>
  ```
- Via MCP:
  Call tool `lifeos_workspace_materialize_plan` with `{ projectId, plan }`.
- Verify materialized tasks and dependency records.

### Step 3: Plan Execution Observability & Deterministic Next-Task Resolution
- Inspect execution status and progress of materialized plans:
  - CLI: `lifeos workspace status --plan-id <PLAN_ID>`
  - MCP: Call `lifeos_workspace_plan_status` with `{ planId }`
  - Resource: Read `lifeos://workspace/plans/{planId}`
- Resolve the exact next unblocked task to work on without parsing tags or guessing:
  - CLI: `lifeos workspace next-task --plan-id <PLAN_ID>`
  - MCP: Call `lifeos_workspace_next_task` with `{ planId }`
  - Returns `READY` (with exact task details), `COMPLETE`, `BLOCKED` (with reasons), or `INVALID`.

### Step 4: Closed-Loop Step Execution & Bounded Retries
- Execute a plan step through the approved sandbox and reconcile actual verification outcomes:
  - CLI: `lifeos workspace step --plan-id <PLAN_ID> [--checks <typecheck,test>] [--max-retries <3>]`
  - MCP: Call `lifeos_workspace_execute_step` with `{ planId, verificationChecks, maxRetries }`
- Invariant guarantees:
  - Task status transitions to `in_progress` during verification execution.
  - Task is marked `completed` ONLY if all configured verification checks pass.
  - Failed verification keeps task uncompleted, increments attempt count, and halts without false progress.
  - Exceeding `maxRetries` (default: 3) transitions task to `blocked` (`TERMINAL_FAILURE`), preventing infinite retry loops.

### Step 5: Sandboxed Command Execution
- Run individual checks during development:
  - CLI: `lifeos workspace run test` or `lifeos workspace run typecheck`
  - MCP: Call `lifeos_workspace_run` with `{ command: "test" }` or `{ command: "typecheck" }`
- Only allowlisted commands (`test`, `typecheck`, `build`, `lint`) are permitted. Arbitrary commands and shell injection characters are blocked.

### Step 6: Pre-Commit Verification Gate
- Before committing any code changes, execute the deterministic verification sequence:
  - CLI: `lifeos workspace verify` (or `lifeos workspace verify --json`)
  - MCP: Call `lifeos_workspace_verify`
- The gate executes:
  1. `tsc --noEmit` (TypeScript compilation)
  2. `pnpm test` (Unit and integration tests)
  3. `pnpm build` (Production build validation)
  4. `pnpm lint` (Code style and linter)
  5. `git status --porcelain` (Read-only status inspection)
- If ANY check fails, subsequent checks are skipped, `canCommit` is set to `false`, and git commit actions remain blocked.

### Step 7: Verification Qualification Lease Acquisition
- Once verification passes, obtain a time-bound `VerificationLease` binding the exact candidate working-tree state:
  - CLI: `lifeos workspace verify --issue-lease` or `lifeos workspace lease create`
  - MCP: Call `lifeos_workspace_acquire_lease`
- The lease computes a cryptographic composite fingerprint:
  - HEAD commit (`git rev-parse HEAD`)
  - Staged index hash (`git ls-files --stage`)
  - Status porcelain (`git status --porcelain=v1 -uall`)
  - Unstaged diff hash (`git diff`)
  - Untracked file contents hash (`git ls-files --others --exclude-standard`)
- Any modification, staging, unstaging, or addition/deletion of files invalidates the lease immediately.

### Step 8: Audited Sandboxed Commit Execution
- Execute a git commit strictly gated by an active Verification Qualification Lease:
  - CLI: `lifeos workspace commit -m "<message>" [--lease-id <id>] [--auto-verify]`
  - MCP: Call `lifeos_workspace_commit` with `{ message: "<message>", leaseId, autoVerify }`
- Invariant guarantees:
  - Validates authenticated caller under `EXECUTE` tier capability; caller identity spoofing is rejected.
  - Requires staged changes; commits with an empty staging index are blocked fail-closed.
  - Re-evaluates working tree fingerprint immediately before commit to prevent TOCTOU race conditions.
  - Executes git commit via sandboxed child process with argument array (no shell interpolation).
  - Preserves git hook execution; `--no-verify` is strictly prohibited.
  - Reconciles uncertain outcomes against HEAD commit advancement to eliminate duplicate or unrecorded commits.
  - Atomically marks the lease as consumed (single-use replay defense).
  - Emits full before/after audit records to `agent_audit_log`.

### Step 9: Git Pre-Commit Hook Management & Enforcement
- Repository-level enforcement ensures manual or external git commits cannot bypass verification:
  - Check status: `lifeos workspace hook status`
  - Install hook: `lifeos workspace hook install`
  - Uninstall hook: `lifeos workspace hook uninstall`
- Behavior of pre-commit hook:
  - Inspects `.git/lifeos/leases/` for an active, unexpired, unconsumed lease matching candidate state.
  - If a valid lease exists, commit proceeds immediately (exit code 0).
  - If no valid lease exists, commit is rejected with clear remediation instructions (exit code 1).
  - Non-destructive composition: pre-existing user hooks are backed up to `pre-commit.pre-lifeos` and chained automatically.

