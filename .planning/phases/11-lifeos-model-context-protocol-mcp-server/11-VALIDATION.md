---
phase: "11"
slug: "lifeos-model-context-protocol-mcp-server"
status: draft
nyquist_compliant: true
wave_0_complete: false
created: "2026-09-30"
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.7 |
| **Config file** | `vitest.config.ts` (unit/runner) / `vitest.integration.config.ts` (integration) |
| **Quick run command** | `pnpm test scripts/tests/phase-11/` |
| **Full suite command** | `pnpm test && pnpm exec tsc --noEmit && pnpm build` |
| **Estimated runtime** | ~15 seconds (quick), ~50 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test scripts/tests/phase-11/`
- **After every plan wave:** Run `pnpm exec tsc --noEmit && pnpm test scripts/tests/phase-11/`
- **Before milestone transition:** Full suite (`pnpm test`, `pnpm exec tsc --noEmit`, `pnpm build`) must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | MCP-01, MCP-05 | T-11-01 | Protocol handshake negotiation and token authentication | unit/contract | `pnpm test scripts/tests/phase-11/plan-01/mcp-handshake.test.ts` | ❌ W0 | ⬜ pending |
| 11-01-02 | 01 | 1 | MCP-01, MCP-05 | T-11-02 | Stdio transport, signal handling, DB teardown, clean stdout | unit/contract | `pnpm test scripts/tests/phase-11/plan-01/mcp-handshake.test.ts` | ❌ W0 | ⬜ pending |
| 11-02-01 | 02 | 2 | MCP-02 | T-11-03 | Context overview resource delegates to canonical services | unit/contract | `pnpm test scripts/tests/phase-11/plan-02/mcp-resources.test.ts` | ❌ W0 | ⬜ pending |
| 11-02-02 | 02 | 2 | MCP-02 | T-11-04 | Entity resources (tasks, goals, projects, finance, daily-plan) return bounded deterministic JSON | unit/contract | `pnpm test scripts/tests/phase-11/plan-02/mcp-resources.test.ts` | ❌ W0 | ⬜ pending |
| 11-02-03 | 02 | 2 | MCP-02 | T-11-05 | Standard agent prompts render formatted templates with fresh context | unit/contract | `pnpm test scripts/tests/phase-11/plan-02/mcp-resources.test.ts` | ❌ W0 | ⬜ pending |
| 11-03-01 | 03 | 3 | MCP-03, MCP-04 | T-11-06 | Tool input schemas validated through Zod; user_id caller injection rejected | unit/contract | `pnpm test scripts/tests/phase-11/plan-03/mcp-tools.test.ts` | ❌ W0 | ⬜ pending |
| 11-03-02 | 03 | 3 | MCP-03, MCP-04 | T-11-07 | Task/Project/Goal/Note/Search/Habit tools delegate strictly to canonical services | unit/contract | `pnpm test scripts/tests/phase-11/plan-03/mcp-tools.test.ts` | ❌ W0 | ⬜ pending |
| 11-04-01 | 04 | 4 | MCP-01..05 | T-11-08 | Subprocess stdio client harness verifies full protocol conversation | e2e/integration | `pnpm test scripts/tests/phase-11/plan-04/mcp-integration.test.ts` | ❌ W0 | ⬜ pending |
| 11-04-02 | 04 | 4 | MCP-01..05 | T-11-09 | Adversarial tests: identity spoofing, token tampering, secret scrubbing, cross-user isolation | adversarial | `pnpm test scripts/tests/phase-11/plan-04/mcp-adversarial.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/tests/phase-11/plan-01/mcp-handshake.test.ts` — stubs for MCP-01, MCP-05 server foundation
- [ ] `scripts/tests/phase-11/plan-02/mcp-resources.test.ts` — stubs for MCP-02 resource and prompt contracts
- [ ] `scripts/tests/phase-11/plan-03/mcp-tools.test.ts` — stubs for MCP-03, MCP-04 tool execution contracts
- [ ] `scripts/tests/phase-11/plan-04/mcp-test-client.ts` — lightweight stdio JSON-RPC 2.0 client test harness
- [ ] `scripts/tests/phase-11/plan-04/mcp-integration.test.ts` — end-to-end subprocess client verification
- [ ] `scripts/tests/phase-11/plan-04/mcp-adversarial.test.ts` — adversarial security and authorization test suite

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None | All | N/A | All Phase 11 MCP protocol behaviors, resources, tools, and security boundaries have automated stdio subprocess test coverage. |

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending (2026-09-30)
