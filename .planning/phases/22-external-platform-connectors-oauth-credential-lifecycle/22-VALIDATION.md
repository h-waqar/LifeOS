---
phase: "22"
slug: "external-platform-connectors-oauth-credential-lifecycle"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-02"
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.7 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `pnpm test scripts/tests/phase-22/plan-01/` |
| **Full suite command** | `pnpm test scripts/tests/phase-22/` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command for the active plan
- **After every plan wave:** Run `pnpm test scripts/tests/phase-22/`
- **Before `/gsd-verify-work`:** Full repository test suite must be green (`pnpm test`)
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 1 | CONN-01 | T-22-01 | Migration 0028 expands provider check to twitter, linkedin, blog with linear snapshot 0027 linkage | unit | `pnpm test scripts/tests/phase-22/plan-01/schema-and-migration.test.ts` | ❌ W0 | ⬜ pending |
| 22-01-02 | 01 | 1 | CONN-01 | T-22-02 | AES-256-GCM token encryption and encrypted PKCE state cookie verification with 10m TTL | unit | `pnpm test scripts/tests/phase-22/plan-01/crypto-and-cookies.test.ts` | ❌ W0 | ⬜ pending |
| 22-01-03 | 01 | 2 | CONN-02 | T-22-03 | Proactive auto-refresh (<5m) and PostgreSQL SELECT FOR UPDATE pessimistic concurrency lock | integration | `pnpm test scripts/tests/phase-22/plan-01/token-lifecycle.test.ts` | ❌ W0 | ⬜ pending |
| 22-02-01 | 02 | 1 | CONN-03 | T-22-04 | Twitter, LinkedIn, Blog adapters conform to SocialPlatformAdapter and normalize errors | unit | `pnpm test scripts/tests/phase-22/plan-02/social-adapters.test.ts` | ❌ W0 | ⬜ pending |
| 22-02-02 | 02 | 1 | CONN-01 | T-22-05 | Outbound blog webhook signed with X-LifeOS-Signature-256 and timing-safe verification | unit | `pnpm test scripts/tests/phase-22/plan-02/blog-webhook.test.ts` | ❌ W0 | ⬜ pending |
| 22-02-03 | 02 | 2 | CONN-01, CONN-02, CONN-03 | T-22-06 | Social integration API routes fail-closed, sanitize DTOs, and Settings UI displays connectors | integration | `pnpm test scripts/tests/phase-22/plan-02/api-routes.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/tests/phase-22/plan-01/schema-and-migration.test.ts` — stubs for Migration 0028 & schema checks
- [ ] `scripts/tests/phase-22/plan-01/crypto-and-cookies.test.ts` — stubs for token encryption & PKCE state cookies
- [ ] `scripts/tests/phase-22/plan-01/token-lifecycle.test.ts` — stubs for token refresh & concurrency lock
- [ ] `scripts/tests/phase-22/plan-02/social-adapters.test.ts` — stubs for Twitter/LinkedIn adapters & rate limits
- [ ] `scripts/tests/phase-22/plan-02/blog-webhook.test.ts` — stubs for blog webhook signatures & ping test
- [ ] `scripts/tests/phase-22/plan-02/api-routes.test.ts` — stubs for API endpoints & DTO sanitization

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Settings UI Rendering | CONN-01 | Visual layout & badge presentation | Verify Social Connectors card appears in `/settings` with Twitter, LinkedIn, and Blog controls |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
