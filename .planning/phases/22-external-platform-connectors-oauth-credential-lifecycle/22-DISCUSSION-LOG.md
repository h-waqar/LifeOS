# Phase 22: External Platform Connectors & OAuth Credential Lifecycle - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-02
**Phase:** 22-external-platform-connectors-oauth-credential-lifecycle
**Areas discussed:** OAuth PKCE & State Storage, Database Schema & Migration Invariant, Credential Encryption & Secret Redaction, Token Refresh Concurrency & Recovery Locking, Platform Capabilities & Blog Webhook Contract, Adapter Error Normalization & Rate Limiting

---

## OAuth PKCE & State Storage Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| Encrypted HTTP-only Cookie | Store PKCE code verifier and state nonce in an encrypted HTTP-only cookie with 10-minute TTL | ✓ |
| Ephemeral Database Table | Store PKCE state in a dedicated PostgreSQL table with periodic TTL cleanup | |
| Stateless JWT | Sign and encrypt state within the OAuth state query parameter | |

**User's choice:** Encrypted HTTP-only Cookie with AES-256-GCM.
**Notes:** Provides browser-session binding preventing session fixation / CSRF while eliminating transient database table overhead.

---

## Database Schema & Migration Invariant

| Option | Description | Selected |
|--------|-------------|----------|
| Expand `integration_connections.provider` via Migration 0028 | Add 'twitter', 'linkedin', and 'blog' to existing table and check constraint | ✓ |
| Create Separate `social_connections` Table | Introduce a separate table specifically for social networks | |

**User's choice:** Expand `integration_connections.provider` via Migration 0028.
**Notes:** Reuses established connection model, foreign keys, and indexes. Maintains linear snapshot linkage to migration 0027 (`0027_snapshot.json`).

---

## Credential Encryption & Secret Redaction

| Option | Description | Selected |
|--------|-------------|----------|
| AES-256-GCM via `src/lib/crypto.ts` | 96-bit random IV, 128-bit authentication tag, strict secret redaction across DTOs and logs | ✓ |
| Alternative Cipher / Library | Introduce new cryptographic package | |

**User's choice:** AES-256-GCM via `src/lib/crypto.ts`.
**Notes:** Preserves zero external crypto dependencies and adheres to established repository security standards.

---

## Token Refresh Concurrency & Recovery Locking

| Option | Description | Selected |
|--------|-------------|----------|
| PostgreSQL Row-Level Lock (`SELECT ... FOR UPDATE`) | Proactive refresh (<5 mins) with pessimistic row lock and status transition to 'expired' on invalid grant | ✓ |
| Optimistic Version Check | Attempt update with version counter and retry loop | |
| In-Memory Mutex | Local in-process mutex lock | |

**User's choice:** PostgreSQL Row-Level Lock (`SELECT ... FOR UPDATE`).
**Notes:** Prevents race conditions and duplicate refresh requests in multi-process/container environments. Fail-closed transition to `expired` upon unrecoverable authorization failure.

---

## Platform Capabilities & Blog Webhook Contract

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated Adapters with `X-LifeOS-Signature-256` | Isolated Twitter (PKCE), LinkedIn (Auth Code), and Blog (HMAC-SHA256 signed JSON) adapters | ✓ |
| Generic HTTP Adapter | Single generic adapter for all platforms | |

**User's choice:** Dedicated Adapters with `X-LifeOS-Signature-256`.
**Notes:** Twitter requires PKCE; LinkedIn requires specialized OAuth parameters; Personal blog requires signed JSON webhook delivery with timing-safe HMAC verification.

---

## Adapter Error Normalization & Rate Limiting

| Option | Description | Selected |
|--------|-------------|----------|
| Typed Error Hierarchy & Rate-Limit Metadata | Normalize errors into PlatformAuthenticationError, PlatformRateLimitError, PlatformNetworkError, PlatformPayloadError | ✓ |
| Raw HTTP Exceptions | Let callers handle raw HTTP status codes and error bodies | |

**User's choice:** Typed Error Hierarchy & Rate-Limit Metadata.
**Notes:** Isolates platform quirks and enables deterministic retry policies in downstream publishing (Phase 23) and analytics (Phase 24).

---

## the agent's Discretion

- Selection of test fixtures and local HTTP mocking harness for offline verification.
- Internal helper file structuring in `src/server/integrations/social/`.

## Deferred Ideas

- Autonomous social publishing and scheduled distribution daemon (Phase 23).
- Zero-Trust HITL preview modal and approval challenge (Phase 23).
- Periodic social engagement analytics synchronization (Phase 24).
