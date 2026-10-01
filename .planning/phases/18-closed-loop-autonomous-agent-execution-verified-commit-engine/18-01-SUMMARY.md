---
phase: 18-closed-loop-autonomous-agent-execution-verified-commit-engine
plan: 01
one-liner: Plan execution observability, deterministic next-task resolution, and closed-loop autonomous step execution with bounded retries
requirements-completed:
  - WORK-01
  - WORK-02
  - WORK-03
  - MCP-02
  - MCP-03
  - SAFE-01
key-files:
  created:
    - src/server/agents/workspace/plan-inspector.ts
    - src/server/agents/workspace/step-executor.ts
    - src/server/mcp/resources/workspace.ts
    - scripts/tests/phase-18/plan-01/plan-observability.test.ts
    - scripts/tests/phase-18/plan-01/mcp-task-queries.test.ts
    - scripts/tests/phase-18/plan-01/closed-loop-execution.test.ts
  modified:
    - src/cli/commands/workspace.ts
    - src/server/mcp/tools/workspace-tools.ts
    - src/server/mcp/tools/task-tools.ts
    - src/server/mcp/resources/registry.ts
key-decisions:
  - "Eliminate False Progress: Plan steps only transition to completed upon passing verification checks"
  - "Bounded Retries: Tasks exceeding maxRetries mark TERMINAL_FAILURE to prevent infinite retry loops"
---

# Plan 18-01: Plan Execution Observability, Deterministic Next-Task Resolution & Closed-Loop Autonomous Execution — Summary

## Execution Summary

Plan 18-01 establishes the foundational autonomous agent execution loop and plan observability engine for Phase 18:

1. **Plan Execution Inspector & Deterministic Resolver (`src/server/agents/workspace/plan-inspector.ts`)**:
   - `getPlanExecutionStatus()`: Constructs a complete, machine-readable directed acyclic graph (DAG) representation of plan execution from database tasks with topological ordering, progress calculations, step state classifications (`COMPLETED`, `IN_PROGRESS`, `READY`, `BLOCKED`, `CANCELLED`), bottlenecks identification, and fail-closed cycle/self-dependency detection.
   - `getNextReadyPlanTask()`: Implements deterministic, priority-ordered next ready task resolution using strict tie-breakers (`orderIndex` -> in-progress status -> creation time -> lexicographical task ID). Returns explicit, actionable terminal states (`READY`, `COMPLETE`, `BLOCKED`, `INVALID`).

2. **Closed-Loop Step Execution & Reconciliation Engine (`src/server/agents/workspace/step-executor.ts`)**:
   - `executePlanStep()`: Executes the complete autonomous development step lifecycle:
     1. Inspects plan DAG and resolves next ready task.
     2. Atomically marks task `in_progress`.
     3. Runs pre-configured or default verification checks (`tsc --noEmit`, etc.) in the sandboxed project workspace.
     4. Verifies actual outcomes; only transitions task to `completed` upon verification pass (eliminates false progress).
     5. Enforces bounded retry logic (`maxRetries`, default 3). Exceeding retries marks task as `blocked` with explicit `TERMINAL_FAILURE` outcome, eliminating infinite retry loops.
     6. Supports interrupted execution recovery by prioritizing resuming orphaned `in_progress` tasks.
   - `runSandboxedPlanStepExecution()`: Gated under `EXECUTE` tier capability via `executeAgentOperation`, capturing full `beforeState` and `afterState` forensic audit records in `agent_audit_log`.

3. **Agent Surfaces Parity (CLI, MCP Tools, Resources)**:
   - CLI commands:
     - `lifeos workspace status --plan-id <id>` (progress bar, task status breakdown, bottleneck reporting).
     - `lifeos workspace next-task --plan-id <id>` (next actionable step resolution).
     - `lifeos workspace step --plan-id <id>` (autonomous step execution).
   - MCP tools:
     - `lifeos_workspace_plan_status` (`READ`)
     - `lifeos_workspace_next_task` (`READ`)
     - `lifeos_workspace_execute_step` (`EXECUTE`)
     - `lifeos_list_tasks` (`READ`, multi-criteria filtering parity)
     - `lifeos_get_task` (`READ`, canonical task retrieval parity)
   - Observational resource:
     - `lifeos://workspace/plans/{planId}`: Exposes live plan DAG state as JSON.

4. **Zero-Trust Safety & Permissions**:
   - Registered `workspace.plan.status`, `workspace.plan.next_task`, `workspace.step`, and MCP equivalents in `evaluator.ts`.
   - Enforces `READ` tier for status and next-task queries; `EXECUTE` tier for step mutations.
   - Caller anti-spoofing assertion (`assertNoCallerSpoofing`) rejecting user ID parameter injections.

---

## Verification & Test Results

| Test Suite | File | Tests Passed | Status |
|------------|------|--------------|--------|
| MCP Task Queries Parity | `scripts/tests/phase-18/plan-01/mcp-task-queries.test.ts` | 9 / 9 | PASS |
| Plan Observability & Resolver | `scripts/tests/phase-18/plan-01/plan-observability.test.ts` | 11 / 11 | PASS |
| Closed-Loop Autonomous Step Execution | `scripts/tests/phase-18/plan-01/closed-loop-execution.test.ts` | 11 / 11 | PASS |
| **Plan 18-01 Total** | 3 files | **31 / 31** | **PASS** |
