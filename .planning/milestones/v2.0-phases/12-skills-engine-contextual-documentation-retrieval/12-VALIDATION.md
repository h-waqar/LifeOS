---
phase: "12"
slug: "skills-engine-contextual-documentation-retrieval"
status: complete
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-01"
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.7 |
| **Config file** | `vitest.config.ts` (unit/runner) / `vitest.integration.config.ts` (integration) |
| **Quick run command** | `pnpm test scripts/tests/phase-12/` |
| **Full suite command** | `pnpm test && pnpm exec tsc --noEmit && pnpm build` |
| **Estimated runtime** | ~15 seconds (quick), ~50 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test scripts/tests/phase-12/`
- **After every plan wave:** Run `pnpm exec tsc --noEmit && pnpm test scripts/tests/phase-12/`
- **Before phase completion:** Full suite (`pnpm test`, `pnpm exec tsc --noEmit`, `pnpm build`) must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | SKILL-02 | T-12-01 | Frontmatter schema validation & safe YAML parser | unit/contract | `pnpm test scripts/tests/phase-12/plan-01/skills-registry.test.ts` | ✅ W0 | ✅ green |
| 12-01-02 | 01 | 1 | SKILL-01 | T-12-02 | Curated skills authoring & discovery in skills registry | unit/contract | `pnpm test scripts/tests/phase-12/plan-01/skills-registry.test.ts` | ✅ W0 | ✅ green |
| 12-01-03 | 01 | 1 | SKILL-01, SKILL-02 | T-12-03 | CLI skills commands & MCP skills tools/resources | unit/contract | `pnpm test scripts/tests/phase-12/plan-01/skills-registry.test.ts` | ✅ W0 | ✅ green |
| 12-02-01 | 02 | 2 | SKILL-03 | T-12-04 | Path traversal sandbox strictly contains doc requests to allowed roots | unit/security | `pnpm test scripts/tests/phase-12/plan-02/doc-search.test.ts` | ✅ W0 | ✅ green |
| 12-02-02 | 02 | 2 | SKILL-03 | T-12-05 | In-memory doc search indexes markdown with BM25 ranking & snippet extraction | unit/contract | `pnpm test scripts/tests/phase-12/plan-02/doc-search.test.ts` | ✅ W0 | ✅ green |
| 12-02-03 | 02 | 2 | SKILL-04 | T-12-06 | Planning graph inspector extracts state, decisions, summaries, and roadmap | unit/contract | `pnpm test scripts/tests/phase-12/plan-02/doc-search.test.ts` | ✅ W0 | ✅ green |
| 12-02-04 | 02 | 2 | SKILL-03, SKILL-04 | T-12-07 | CLI docs commands & MCP doc tools/resources | unit/contract | `pnpm test scripts/tests/phase-12/plan-02/doc-search.test.ts` | ✅ W0 | ✅ green |
| 12-03-01 | 03 | 3 | SKILL-01..04 | T-12-08 | Real stdio MCP subprocess client verifies skills and doc tools/resources | e2e/integration | `pnpm test scripts/tests/phase-12/plan-03/skills-integration.test.ts` | ✅ W0 | ✅ green |
| 12-03-02 | 03 | 3 | SKILL-01..04 | T-12-09 | Adversarial tests: traversal injection, caller spoofing, secret scrubbing, zero migrations | adversarial | `pnpm test scripts/tests/phase-12/plan-03/docs-adversarial.test.ts` | ✅ W0 | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `scripts/tests/phase-12/plan-01/skills-registry.test.ts` — verified for SKILL-01, SKILL-02 skills registry and metadata engine
- [x] `scripts/tests/phase-12/plan-02/doc-search.test.ts` — verified for SKILL-03, SKILL-04 doc search and planning inspector
- [x] `scripts/tests/phase-12/plan-03/skills-integration.test.ts` — end-to-end integration test suite across skills and docs
- [x] `scripts/tests/phase-12/plan-03/docs-adversarial.test.ts` — adversarial security, path traversal rejection, and zero-migration suite

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None | All | N/A | All Phase 12 procedural skills, documentation retrieval, planning inspection, path containment, and security boundaries have automated test coverage. |

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** verified (2026-10-01)
