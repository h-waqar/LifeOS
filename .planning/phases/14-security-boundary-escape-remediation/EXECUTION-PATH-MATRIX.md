# Phase 14: Repository-Wide Zero-Trust Execution-Path Matrix

This matrix documents every reachable execution vector in the LifeOS repository, detailing how incoming requests authenticate, validate tenant identity, enforce the Phase 13 zero-trust security boundary, apply the financial shield, require HITL challenges, and transactionally persist immutable audit logs.

---

## 1. Execution Path Inventory & Invariants

| Vector | Entry Point | Authentication & Identity Resolution | Financial Shield | Permission Evaluation | HITL Challenge Gate | Transactional Audit Coupling | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Inbound Webhook** | `/api/integrations/webhooks/incoming` | Cryptographic HMAC / Agent Token (`resolveAgentByToken`) / Session Cookie. Header spoofing strictly eliminated. | N/A (Webhooks cannot mutate finance) | Evaluated before domain event dispatch | N/A | Logged to `audit_log` with verified actor attribution | **SEALED** |
| **GitHub Webhook** | `handleGitHubWebhook` | Mandatory HMAC-SHA256 signature verification. Fail-closed on missing secret. Removed arbitrary `limit(1)` fallback. | Blocked | Event-bound only to authenticated tenant | N/A | Logged to `audit_log` | **SEALED** |
| **AI Action Confirmation** | `/api/ai/actions/[id]/confirm` | Session cookie or Agent Bearer token verified against action's `userId`. | Strictly blocked: `assertFinancialShield` throws 403 on financial mutations | Canonical `executeAgentOperation` evaluation | Required for consequential actions | Transactional: `ai_actions` status update + `audit_log` share atomic transaction | **SEALED** |
| **AI Tool Interception** | `interceptToolCall` | `ToolContext.userId` bound to authenticated session/agent. | Strictly blocked: `assertFinancialShield` blocks execution and queuing | Tier classification (Tier 1/2 vs Tier 3 HITL) | Persists pending action preview for human approval | Logged | **SEALED** |
| **CLI Commands** | `src/cli/index.ts` | Bearer token / `LIFEOS_TOKEN` resolved via `resolveAgentByToken` or user session. Anti-spoofing flags enforced. | Prohibited for agent tokens | Evaluated via `executeAgentOperation` | `--challenge-id` required for DESTRUCTIVE / SENSITIVE | Atomic transaction coupling | **SEALED** |
| **MCP Tools** | `src/server/mcp/` | Agent token authenticated via `resolveAgentByToken`. Identity injected into MCP tool context. | Prohibited for agent tokens | Classified & evaluated through `executeAgentOperation` | Returns `CHALLENGE_REQUIRED` if unconfirmed | Durable `agent_audit_log` entry | **SEALED** |
| **Direct Service Callers** | `src/server/{tasks,notes,...}` | `guardFinancialMutation()` and `withAgentSafetyContext()` assert caller safety. | Prohibited under agent context | Explicit grant check | Required for DESTRUCTIVE operations | Immutable audit log in PostgreSQL | **SEALED** |
| **Challenge Sweeper** | `SchedulerEngine` | Background worker ticker with distributed idempotency lock. | N/A | Reconciliation of expired PENDING challenges | Transitions expired challenges to `EXPIRED` | Logged via sweeper execution summary | **SEALED** |

---

## 2. Invariant Proof Summary

1. **Zero Attacker-Controlled Identity Spoofing**:
   - No header string (`Authorization: Bearer <arbitrary>`, `x-lifeos-webhook-secret`, `--user-id`, etc.) can impersonate a user.
   - All identities must resolve cryptographically to an active `user` or `agent_tokens` record.

2. **Universal Financial Shield**:
   - Autonomous agent-originated mutations to financial ledgers, accounts, transactions, or transfers are blocked at all layers:
     - Pre-execution tool level (`assertFinancialShield`)
     - AI HITL gate interception level (`interceptToolCall`)
     - Action confirmation execution level (`confirmAndExecuteAction`)
     - Canonical safety boundary (`executeAgentOperation`)
     - Domain service level (`guardFinancialMutation`)

3. **Atomic Audit Persistence**:
   - On all executed agent mutations, mutation logic and `agent_audit_log` persistence share an atomic database transaction.
   - If audit persistence fails (disk error, constraint violation, serialization error), the transaction is immediately rolled back. State is NEVER modified without an immutable audit trail.
   - The `.catch(() => {})` silent error swallow pattern is eliminated on mutation execution paths.

4. **Challenge Expiration Sweeping & Argument Hashing**:
   - `challengeTtlSweeper` is registered in `SchedulerEngine` and runs as part of the background worker lifecycle.
   - Argument hashing canonicalization ignores hyphenated CLI flags (`--challenge-id`, `--token`, `--json`), preventing spurious tamper rejections.
