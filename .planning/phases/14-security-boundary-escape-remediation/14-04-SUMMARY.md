---
phase: 14-security-boundary-escape-remediation
plan: 04
one-liner: Challenge TTL sweeper production registration in SchedulerEngine and deterministic CLI runner argument hashing
requirements-completed:
  - SAFE-05
key-files:
  created:
    - src/server/scheduler/jobs/challenge-ttl.ts
    - scripts/tests/phase-14/plan-04/scheduler-ttl-cli.test.ts
  modified:
    - src/server/scheduler/engine.ts
    - src/instrumentation.ts
    - src/server/agents/challenges/challenge-service.ts
key-decisions:
  - "CLI Runner Flag Immunity: Argument hashing ignores runner infrastructure flags (--challenge-id, --token, --json)"
---

# Plan 14-04: Challenge TTL Sweeper Production Integration & CLI Argument Hashing — Summary

## Execution Summary

Plan 14-04 registered the challenge TTL sweeper into the production `SchedulerEngine` with automatic Next.js instrumentation boot and made CLI runner argument hashing deterministic, fulfilling requirement SAFE-05.

### Key Deliverables Implemented

1. **Scheduler Engine Integration (`src/server/scheduler/jobs/challenge-ttl.ts`, `engine.ts`)**:
   - Registered 60-second periodic sweeper cleaning up expired pending challenges.
   - Connected to Next.js `register()` hook in `src/instrumentation.ts`.

2. **Deterministic Argument Hashing (`src/server/agents/challenges/challenge-service.ts`)**:
   - Canonicalized arguments ignore runner flags (`--challenge-id`, `--token`, `--json`, `--config`), guaranteeing hash consistency between API and CLI paths.

---

## Verification Results

| Check | Command | Result |
|-------|---------|--------|
| TypeScript | `pnpm exec tsc --noEmit` | PASS (0 errors) |
| Plan 14-04 Tests | `pnpm test scripts/tests/phase-14/plan-04/scheduler-ttl-cli.test.ts` | PASS (5/5 passed) |
