---
phase: "10"
slug: "shared-application-services-headless-cli"
status: draft
nyquist_compliant: true
wave_0_complete: false
created: "2026-09-30"
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.7 |
| **Config file** | `vitest.config.ts` (unit/runner) / `vitest.integration.config.ts` (integration) |
| **Quick run command** | `pnpm test scripts/tests/phase-10/` |
| **Full suite command** | `pnpm test && pnpm exec tsc --noEmit && pnpm build` |
| **Estimated runtime** | ~10 seconds (quick), ~45 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test scripts/tests/phase-10/`
- **After every plan wave:** Run `pnpm exec tsc --noEmit && pnpm test scripts/tests/phase-10/`
- **Before milestone transition:** Full suite (`pnpm test`, `pnpm exec tsc --noEmit`, `pnpm build`) must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | CLI-01 | T-10-01 | Enforce token validation and 0o600 file permission | unit/contract | `pnpm test scripts/tests/phase-10/plan-01/cli-runner.test.ts` | ❌ W0 | ⬜ pending |
| 10-01-02 | 01 | 1 | CLI-02 | T-10-02 | Deterministic JSON sorting, secret scrubbing, clean stdout | unit/contract | `pnpm test scripts/tests/phase-10/plan-01/cli-runner.test.ts` | ❌ W0 | ⬜ pending |
| 10-02-01 | 02 | 2 | CLI-03 | T-10-03 | Context inspection delegates to canonical services without raw SQL | integration | `pnpm test scripts/tests/phase-10/plan-02/cli-commands.test.ts` | ❌ W0 | ⬜ pending |
| 10-02-02 | 02 | 2 | CLI-04 | T-10-04 | Entity CRUD input validated through Zod, foreign userId rejected | integration | `pnpm test scripts/tests/phase-10/plan-02/cli-commands.test.ts` | ❌ W0 | ⬜ pending |
| 10-02-03 | 02 | 2 | CLI-05 | T-10-05 | Daily plan workflows delegate to canonical planning services | integration | `pnpm test scripts/tests/phase-10/plan-02/cli-commands.test.ts` | ❌ W0 | ⬜ pending |
| 10-03-01 | 03 | 3 | CLI-01..05 | T-10-06 | Subprocess execution, exit code stability, stream separation | e2e/integration | `pnpm test scripts/tests/phase-10/plan-03/cli-integration.test.ts` | ❌ W0 | ⬜ pending |
| 10-03-02 | 03 | 3 | CLI-01..05 | T-10-07 | Adversarial test: caller spoofing, token tampering, secret scrubbing | adversarial | `pnpm test scripts/tests/phase-10/plan-03/cli-adversarial.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/tests/phase-10/plan-01/cli-runner.test.ts` — stubs for CLI-01, CLI-02 runner contracts
- [ ] `scripts/tests/phase-10/plan-02/cli-commands.test.ts` — stubs for CLI-03, CLI-04, CLI-05 command handlers
- [ ] `scripts/tests/phase-10/plan-03/cli-integration.test.ts` — subprocess execution and stream separation harness
- [ ] `scripts/tests/phase-10/plan-03/cli-adversarial.test.ts` — adversarial security and authorization test harness

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None | All | N/A | All Phase 10 requirements have automated CLI and subprocess test coverage. |

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending (2026-09-30)
