---
phase: "13"
slug: "zero-trust-agent-safety-permissions-attribution-audit"
status: pending
nyquist_compliant: true
wave_0_complete: false
created: "2026-10-01"
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.7 |
| **Config file** | `vitest.config.ts` (unit/runner) / `vitest.integration.config.ts` (integration) |
| **Quick run command** | `pnpm test scripts/tests/phase-13/` |
| **Full suite command** | `pnpm test && pnpm exec tsc --noEmit && pnpm build` |
| **Estimated runtime** | ~15 seconds (quick), ~75 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test scripts/tests/phase-13/`
- **After every plan wave:** Run `pnpm exec tsc --noEmit && pnpm test scripts/tests/phase-13/`
- **Before phase completion:** Full suite (`pnpm test`, `pnpm exec tsc --noEmit`, `pnpm build`) must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | SAFE-01, SAFE-04 | T-13-01 | Forward migration 0027 creates agent tables with correct keys and constraints | unit/schema | `pnpm test scripts/tests/phase-13/plan-01/schema-migration.test.ts` | ⬜ W0 | ⬜ pending |
| 13-01-02 | 01 | 1 | SAFE-01, SAFE-04 | T-13-02 | Migration journal integrity preserved and historical migrations untouched | unit/schema | `pnpm test scripts/tests/phase-13/plan-01/schema-migration.test.ts` | ⬜ W0 | ⬜ pending |
| 13-02-01 | 02 | 2 | SAFE-01 | T-13-03 | Five-tier capability classification & denial by default | unit/security | `pnpm test scripts/tests/phase-13/plan-02/permission-evaluator.test.ts` | ⬜ W0 | ⬜ pending |
| 13-02-02 | 02 | 2 | SAFE-01 | T-13-04 | Privilege escalation rejected; agent identity decoupled from user claims | unit/security | `pnpm test scripts/tests/phase-13/plan-02/permission-evaluator.test.ts` | ⬜ W0 | ⬜ pending |
| 13-02-03 | 02 | 2 | SAFE-03 | T-13-05 | Zero-trust financial shield active below MCP/CLI blocking mutations | unit/security | `pnpm test scripts/tests/phase-13/plan-02/permission-evaluator.test.ts` | ⬜ W0 | ⬜ pending |
| 13-03-01 | 03 | 3 | SAFE-02 | T-13-06 | Cryptographic challenge generation bound to agent, user, args, and operation | unit/contract | `pnpm test scripts/tests/phase-13/plan-03/challenge-lifecycle.test.ts` | ⬜ W0 | ⬜ pending |
| 13-03-02 | 03 | 3 | SAFE-02 | T-13-07 | Human approval lifecycle (approve/reject) and tamper detection via arg hash | unit/contract | `pnpm test scripts/tests/phase-13/plan-03/challenge-lifecycle.test.ts` | ⬜ W0 | ⬜ pending |
| 13-03-03 | 03 | 3 | SAFE-05 | T-13-08 | Synchronous TTL expiration & background sweeper reconciliation | unit/contract | `pnpm test scripts/tests/phase-13/plan-03/challenge-lifecycle.test.ts` | ⬜ W0 | ⬜ pending |
| 13-03-04 | 03 | 3 | SAFE-02 | T-13-09 | Concurrency-safe atomic challenge consumption & replay prevention | unit/security | `pnpm test scripts/tests/phase-13/plan-03/challenge-lifecycle.test.ts` | ⬜ W0 | ⬜ pending |
| 13-04-01 | 04 | 4 | SAFE-04 | T-13-10 | Agent attribution logger captures forensic snapshots with secret scrubbing | unit/audit | `pnpm test scripts/tests/phase-13/plan-04/agent-security.integration.test.ts` | ⬜ W0 | ⬜ pending |
| 13-04-02 | 04 | 4 | SAFE-01..05 | T-13-11 | Real MCP adapter integration with safety boundary and HITL challenge gating | e2e/integration | `pnpm test scripts/tests/phase-13/plan-04/agent-security.integration.test.ts` | ⬜ W0 | ⬜ pending |
| 13-04-03 | 04 | 4 | SAFE-01..05 | T-13-12 | Full adversarial attack suite verifying 20 attack vectors | adversarial | `pnpm test scripts/tests/phase-13/plan-04/agent-security.integration.test.ts` | ⬜ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/tests/phase-13/plan-01/schema-migration.test.ts` — verified for SAFE-01, SAFE-04 schema and migration
- [ ] `scripts/tests/phase-13/plan-02/permission-evaluator.test.ts` — verified for SAFE-01, SAFE-03 capability evaluator & financial shield
- [ ] `scripts/tests/phase-13/plan-03/challenge-lifecycle.test.ts` — verified for SAFE-02, SAFE-05 challenge lifecycle & TTL sweeper
- [ ] `scripts/tests/phase-13/plan-04/agent-security.integration.test.ts` — verified for SAFE-01..05 full integration & 20-vector adversarial suite
