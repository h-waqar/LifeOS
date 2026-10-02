# Phase 22: External Platform Connectors & OAuth Credential Lifecycle - Context

**Gathered:** 2026-10-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 22 establishes secure external platform connectors and OAuth credential lifecycle management for LifeOS Milestone v3.0. It delivers:
1. Secure OAuth 2.0 Authorization Code with PKCE and signed webhook connections for Twitter/X API v2, LinkedIn REST API, and personal blogs.
2. Production-grade token lifecycle handling: proactive auto-refresh prior to expiration (<= 5-minute threshold), concurrency control via PostgreSQL row-level locking (`SELECT ... FOR UPDATE`), and fail-closed state transitions to `expired` or `error` upon authentication failure.
3. AES-256-GCM encryption at rest for all access tokens, refresh tokens, and webhook secrets using `src/lib/crypto.ts` with zero plaintext leakage in logs, audit payloads, DTOs, or errors.
4. A standardized `SocialPlatformAdapter` interface isolating platform-specific rate limits, payload serialization, and API error code mappings.
5. Signed outbound blog webhook delivery using HMAC-SHA256 (`X-LifeOS-Signature-256`) and timing-safe verification.

Out of scope for Phase 22:
- Autonomous social publishing and post dispatch (Phase 23).
- Mandatory Zero-Trust HITL publishing approval challenges (Phase 23).
- Social engagement analytics ingestion and metrics sync (Phase 24).
- Multi-agent orchestration (Phase 25).
</domain>

<decisions>
## Implementation Decisions

### 1. OAuth PKCE & State Storage Architecture
- **D-01:** Ephemeral OAuth 2.0 PKCE code verifiers and CSRF state nonces are stored in encrypted HTTP-only session cookies (`oauth_state_${provider}`) with 10-minute TTL, encrypted via `encryptJSON` (AES-256-GCM) with authenticated tags.
  - **Reversibility:** costly — Changes the callback exchange contract and cookie handling across server routes.
  - **Rationale:** Stateless encrypted cookies bind the authorization initiation to the specific browser session completing the callback, preventing session fixation and login CSRF without requiring transient database table garbage collection.

### 2. Database Schema & Migration Invariant (Migration 0028)
- **D-02:** Database migration 0028 extends `integrationConnections` (`src/server/db/schema/integrations.ts`) to add `'twitter'`, `'linkedin'`, and `'blog'` to `integration_connections.provider` and the `integration_connections_provider_check` check constraint. The migration preserves linear snapshot continuity linked to migration 0027 (`0027_snapshot.json` id: `27272727-2727-4727-8727-272727272727`).
  - **Reversibility:** one-way — Migration 0028 modifies PostgreSQL check constraints; rollback requires a down migration.
  - **Rationale:** Expands valid provider enum values while strictly adhering to the vertical-slice rule and maintaining zero schema drift under `drizzle-kit check`.

### 3. Credential Encryption & Secret Redaction
- **D-03:** All OAuth access tokens, refresh tokens, and blog webhook secrets are encrypted at rest using `encryptSecret` from `src/lib/crypto.ts` (AES-256-GCM with 96-bit random IV and 128-bit authentication tag). Plaintext tokens and secrets are strictly forbidden in logs, database audit payloads, API response DTOs, error messages, and URLs.
  - **Reversibility:** costly — Affects all token persistence and presentation layers.
  - **Rationale:** Preserves zero-trust and encryption-at-rest security invariants established in Phase 8 and Phase 14.

### 4. Token Refresh Concurrency & Recovery Locking
- **D-04:** Token refresh is proactive (triggered when `tokenExpiresAt - NOW() < 5 minutes`) and concurrency-safe via PostgreSQL row-level locking (`SELECT ... FOR UPDATE` on `integration_connections`). Inside the transaction lock, the token expiration timestamp is re-evaluated; if already refreshed by a concurrent worker, the freshly stored token is returned immediately without duplicate HTTP requests. Unrecoverable authorization failures (e.g. `invalid_grant`, revoked tokens) transition connection status to `'expired'`, wipe cached tokens, record sanitized error details in metadata, and emit transactional audit logs.
  - **Reversibility:** costly — Modifies database locking patterns and error handling flow in the token service.
  - **Rationale:** Prevents race conditions, duplicate refresh requests, and stale token overwrites when concurrent requests require external platform access.

### 5. Provider Adapters & Platform Boundaries
- **D-05:** Implement isolated adapter classes conforming to `SocialPlatformAdapter`:
  - `TwitterAdapter`: Supports Twitter API v2 OAuth 2.0 PKCE (`tweet.read`, `tweet.write`, `users.read`, `offline.access`), token exchange, and refresh.
  - `LinkedInAdapter`: Supports LinkedIn OAuth 2.0 (`openid`, `profile`, `email`, `w_member_social`), token exchange, and refresh handling.
  - `BlogAdapter`: Manages user-configured webhook URL and shared secret; dispatches verification ping payloads and computes HMAC-SHA256 signatures for `X-LifeOS-Signature-256`.
  - **Reversibility:** costly — Defines the adapter interface consumed by Phase 23 (Publishing) and Phase 24 (Analytics).
  - **Rationale:** Keeps provider quirks (endpoints, scopes, header formats) completely isolated behind the common adapter contract.

### 6. Standardized Adapter Contract & Error Hierarchy
- **D-06:** Establish a typed error hierarchy normalizing external API failures into typed errors:
  - `PlatformAuthenticationError` (HTTP 401 / invalid grant -> unrecoverable, transitions connection to `expired`).
  - `PlatformRateLimitError` (HTTP 429 -> extracts `x-rate-limit-remaining`, `x-rate-limit-reset`, or `Retry-After`).
  - `PlatformNetworkError` (HTTP 5xx / timeout -> transient, retryable).
  - `PlatformPayloadError` (HTTP 400 / 422 -> validation defect).
  - **Reversibility:** reversible — Internal TypeScript class hierarchy.
  - **Rationale:** Ensures downstream callers (Phase 23 publishing queue, Phase 24 analytics fetcher) can handle retries and failures deterministically without inspecting provider-specific HTTP bodies.

### the agent's Discretion
- Selection of deterministic mock fixtures and local HTTP mocking harness for unit and integration tests.
- Exact JSON payload structure for blog webhook verification requests.
- Internal helper utility organization under `src/server/integrations/social/`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Architecture Specifications
- `.planning/PROJECT.md` — Core vision, constraints, and key decisions.
- `.planning/REQUIREMENTS.md` § External Platform Connectors — Explicit acceptance criteria for CONN-01, CONN-02, and CONN-03.
- `.planning/ROADMAP.md` § Phase 22 — Phase 22 scope, dependencies, success criteria, and plans.
- `.planning/research/ARCHITECTURE.md` § 1 — Social connectors layer and `SocialPlatformAdapter` contract.
- `.planning/research/PITFALLS.md` § 1 & 6 — Social rate limits and Drizzle Kit snapshot linear continuity.
- `.planning/research/STACK.md` — Recommended protocols, Twitter API v2, LinkedIn REST, HMAC signatures.

### Existing Implementation Code
- `src/lib/crypto.ts` — Authoritative AES-256-GCM encryption (`encryptSecret`, `decryptSecret`, `encryptJSON`, `decryptJSON`).
- `src/server/db/schema/integrations.ts` — `integrationConnections` table schema and constraint definitions.
- `src/server/db/migrations/meta/_journal.json` — Migration history journal (0000–0027).
- `src/server/db/migrations/meta/0027_snapshot.json` — Preceding migration snapshot metadata for migration 0028 linkage.
- `src/server/integrations/google-calendar/oauth-service.ts` — Established pattern for OAuth state verification, token refresh, and connection DTOs.
- `src/server/integrations/webhooks/handler.ts` — Established pattern for HMAC-SHA256 signature verification with `crypto.timingSafeEqual`.
- `src/server/audit/index.ts` — Canonical audit logging system for connection lifecycle events.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/crypto.ts`: `encryptSecret`, `decryptSecret`, `encryptJSON`, `decryptJSON` provide battle-tested AES-256-GCM encryption with NIST-recommended 96-bit IVs and 128-bit authentication tags.
- `src/server/audit/index.ts`: `createAuditLog` provides structured, tamper-evident audit logging for connection creation, refresh, expiration, and disconnection.
- `src/server/auth/guard.ts`: `requireAuthenticatedUser` enforces server-side session authentication and ownership validation.
- `src/server/db/index.ts`: PostgreSQL Drizzle database client with transaction support.

### Established Patterns
- **Provider Status Lifecycle**: Status values `['connected', 'disconnected', 'error', 'expired']` with sanitized public DTOs that strip all raw tokens and secret keys.
- **Fail-Closed Timing-Safe HMAC**: `crypto.timingSafeEqual` used across GitHub webhooks and agent challenge verification.
- **Pessimistic Concurrency Locking**: `SELECT ... FOR UPDATE` row locks inside PostgreSQL transactions to serialize sensitive state mutations.
- **Centralized Test Hierarchy**: All tests located in `scripts/tests/{phase}/{plan}/...`, strictly never in `src/`.

### Integration Points
- `src/server/db/schema/integrations.ts` & `src/server/db/migrations/0028_*.sql`: Database schema extension.
- `src/server/integrations/social/`: New domain module housing adapters, credential manager, and OAuth handlers.
- `src/app/api/integrations/social/[provider]/`: Route handlers for OAuth authorization redirect and callback handling.
- `src/server/integrations/social/adapters/`: `TwitterAdapter`, `LinkedInAdapter`, `BlogAdapter` implementing `SocialPlatformAdapter`.

</code_context>

<specifics>
## Specific Ideas

- Twitter/X API v2 OAuth 2.0 PKCE requires `code_challenge_method=S256` with base64url-encoded SHA-256 hash of the random code verifier.
- LinkedIn OAuth authorization uses standard OAuth 2.0 Authorization Code grant. Access tokens expire after 60 days, refresh tokens after 365 days where available.
- Personal Blog signed webhook uses header `X-LifeOS-Signature-256: sha256=<hex_digest>` computed using the shared secret over the exact raw UTF-8 JSON request body.
- Deterministic mock HTTP servers in Vitest allow comprehensive testing of token exchange, expiration, rate limit parsing, and error recovery without external network dependencies.

</specifics>

<deferred>
## Deferred Ideas

- Direct social publishing execution engine and scheduled dispatch daemon — Deferred to Phase 23 (PUB-01, PUB-02, PUB-03).
- Zero-Trust HITL preview modal and approval challenge for social posts — Deferred to Phase 23 (PUB-01).
- Automatic periodic social engagement metrics synchronization — Deferred to Phase 24 (ANLT-01, ANLT-02).
- Video and multi-image carousel rendering — Deferred to v4.0+ (PUB-F01).

</deferred>

---

*Phase: 22-External Platform Connectors & OAuth Credential Lifecycle*
*Context gathered: 2026-10-02*
