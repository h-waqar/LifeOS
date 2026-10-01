---
phase: 16-controlled-project-workspace-execution-harness
plan: 01
one-liner: Project workspace isolation sandbox with realpath containment and validated command runner with bounded output
requirements-completed:
  - WORK-01
  - WORK-02
key-files:
  created:
    - src/server/agents/workspace/sandbox.ts
    - src/server/agents/workspace/command-runner.ts
    - src/server/agents/workspace/types.ts
    - scripts/tests/phase-16/plan-01/workspace-sandbox.test.ts
key-decisions:
  - "Workspace Sandboxing: Strict fs.realpath containment rejecting path traversals, null bytes, and symlink escapes"
  - "Validated Subprocess Runner: shell: false execution allowlisting test, typecheck, build, lint with 1MB bounds"
---

# Plan 16-01: Project Workspace Isolation Sandbox & Validated Command Runner — Summary

## Execution Summary

Plan 16-01 delivered the project-scoped execution sandbox and validated command runner for Phase 16, fulfilling requirements WORK-01 and WORK-02.

### Key Deliverables Implemented

1. **Workspace Containment Sandbox (`src/server/agents/workspace/sandbox.ts`) (WORK-01)**:
   - `assertSandboxPath()` and `isPathContained()`: Validates that all file targets reside strictly within the project repository root.
   - Enforces realpath resolution to defeat directory traversal (`..`), double URL encoding (`%2e%2e`), null bytes (`\0`), absolute external paths, and external symlink escapes.
   - Nearest-ancestor resolution ensures newly created target files cannot escape containment.

2. **Validated Command Runner (`src/server/agents/workspace/command-runner.ts`) (WORK-02)**:
   - Subprocess execution strictly restricted to allowlisted commands: `test`, `typecheck`, `build`, `lint`.
   - `child_process.spawn` invoked with `shell: false`, stripping dangerous environment variables (`NODE_OPTIONS`, `LD_PRELOAD`).
   - Process group isolation and hard execution timeouts (60s default, 120s build) with graceful `SIGTERM` -> `SIGKILL` escalation.
   - Bounded stdout/stderr streaming (1 MB limit) to prevent memory exhaustion.

---

## Verification Results

| Check | Command | Result |
|-------|---------|--------|
| TypeScript | `pnpm exec tsc --noEmit` | PASS (0 errors) |
| Plan 16-01 Tests | `pnpm test scripts/tests/phase-16/plan-01/workspace-sandbox.test.ts` | PASS (39/39 passed) |
