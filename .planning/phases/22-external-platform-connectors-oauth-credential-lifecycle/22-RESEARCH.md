# Phase 22: External Platform Connectors & OAuth Credential Lifecycle - Research

**Phase:** Phase 22 (External Platform Connectors & OAuth Credential Lifecycle)  
**Milestone:** v3.0 (Proactive Personal OS Orchestration & External Ecosystem)  
**Researched:** 2026-10-02  
**Confidence:** HIGH (100% verified against codebase, database schema, crypto engine, and previous migration history)

---

## 1. Executive Summary & Phase Boundary

Phase 22 establishes the external platform connectivity and OAuth credential lifecycle foundation for Milestone v3.0. It bridges LifeOS to external platforms—specifically **Twitter/X API v2**, **LinkedIn REST API**, and **Personal Blog Webhooks**—while enforcing zero-trust credential security, fail-closed state management, and strict concurrency safety.

### In-Scope Deliverables
1. **Database Schema Forward Evolution (Migration 0028)**:
   - Extend `integrationConnections.provider` in [`src/server/db/schema/integrations.ts`](file:///home/hw/Projects/LifeOS/src/server/db/schema/integrations.ts) to accept `'twitter'`, `'linkedin'`, and `'blog'`.
   - Update PostgreSQL check constraint `integration_connections_provider_check`.
   - Maintain linear Drizzle Kit snapshot continuity linked to migration 0027 (`0027_snapshot.json` id: `27272727-2727-4727-8727-272727272727`) with 0 schema drift under `drizzle-kit check`.
2. **Ephemeral OAuth 2.0 PKCE & State Storage (Decision D-01)**:
   - Stateless encrypted session cookies (`oauth_state_${provider}`) with 10-minute TTL.
   - Encrypted with AES-256-GCM via [`encryptJSON`](file:///home/hw/Projects/LifeOS/src/lib/crypto.ts#L106-L109) / [`decryptJSON`](file:///home/hw/Projects/LifeOS/src/lib/crypto.ts#L113-L117) to prevent CSRF and session fixation without temporary database table bloat.
3. **AES-256-GCM Credential Store & Zero-Leakage Policy (Decision D-03)**:
   - All OAuth access tokens, refresh tokens, and blog webhook shared secrets are encrypted at rest using [`encryptSecret`](file:///home/hw/Projects/LifeOS/src/lib/crypto.ts#L34-L46).
   - Zero plaintext exposure across application logs, database audit payloads, API response DTOs, and error messages.
4. **Proactive Concurrency-Safe Token Lifecycle Manager (Decision D-04)**:
   - Proactive auto-refresh triggered when `tokenExpiresAt - NOW() < 5 minutes`.
   - Serialized via PostgreSQL row-level pessimistic locking (`SELECT ... FOR UPDATE` on `integration_connections`).
   - Fail-closed transitions to `'expired'` or `'error'` upon unrecoverable authorization failures (e.g. `invalid_grant`, revoked tokens) with automatic token purging and transactional audit logging.
5. **Standardized `SocialPlatformAdapter` Contract & Isolated Adapters (Decisions D-05, D-06)**:
   - Standardized `SocialPlatformAdapter` isolating platform specifics behind common abstractions.
   - `TwitterAdapter`: Twitter API v2 OAuth 2.0 PKCE (`tweet.read`, `tweet.write`, `users.read`, `offline.access`), token exchange, token rotation refresh, and rate limit parsing.
   - `LinkedInAdapter`: LinkedIn OAuth 2.0 Authorization Code grant (`openid`, `profile`, `email`, `w_member_social`), token exchange, refresh, and profile fetching.
   - `BlogAdapter`: User-configured webhook URL and shared secret, verification ping dispatch, HMAC-SHA256 signature computation (`X-LifeOS-Signature-256`), and timing-safe verification.
   - Typed error hierarchy: `PlatformAuthenticationError`, `PlatformRateLimitError`, `PlatformNetworkError`, `PlatformPayloadError`.
6. **API Route Handlers & UI Surface**:
   - Next.js App Router endpoints for `/api/integrations/social/[provider]/auth`, `/callback`, `/status`, `/disconnect`, and blog `/configure` & `/ping`.
   - Settings UI integration in [`src/components/settings/integrations-settings-view.tsx`](file:///home/hw/Projects/LifeOS/src/components/settings/integrations-settings-view.tsx) allowing user connection, status monitoring, and disconnection.

### Explicit Out-of-Scope Boundaries
- **Autonomous social publishing and post dispatch** -> Deferred to Phase 23 (PUB-01, PUB-02, PUB-03).
- **Mandatory Zero-Trust HITL publishing approval challenges** -> Deferred to Phase 23 (PUB-01).
- **Social engagement analytics ingestion and metrics sync** -> Deferred to Phase 24 (ANLT-01, ANLT-02).
- **Multi-agent orchestration and coordination bus** -> Deferred to Phase 25 (ORCH-01, ORCH-02, ORCH-03).

---

## 2. User Decisions & Constraints Audit

From [`.planning/phases/22-external-platform-connectors-oauth-credential-lifecycle/22-CONTEXT.md`](file:///home/hw/Projects/LifeOS/.planning/phases/22-external-platform-connectors-oauth-credential-lifecycle/22-CONTEXT.md):

| Decision | Area | Specification & Non-Negotiable Rules |
|---|---|---|
| **D-01** | OAuth PKCE & State Storage | Ephemeral OAuth 2.0 PKCE code verifiers and CSRF state nonces are stored in encrypted HTTP-only session cookies (`oauth_state_${provider}`) with 10-minute TTL, encrypted via `encryptJSON` (AES-256-GCM) with authenticated tags. Rejects cross-user callback completion. |
| **D-02** | Schema & Migration 0028 | Database migration 0028 extends `integrationConnections` to add `'twitter'`, `'linkedin'`, and `'blog'` to `integration_connections.provider` and `integration_connections_provider_check`. Preserves linear snapshot continuity linked to migration 0027 (`0027_snapshot.json` id: `27272727-2727-4727-8727-272727272727`). |
| **D-03** | Credential Encryption | All access tokens, refresh tokens, and blog webhook secrets encrypted at rest via `encryptSecret` (`src/lib/crypto.ts`). Plaintext forbidden in logs, database audit payloads, API DTOs, errors, and URLs. |
| **D-04** | Token Refresh Concurrency | Proactive refresh triggered when `tokenExpiresAt - NOW() < 5 minutes`. Concurrency-safe via PostgreSQL row lock (`SELECT ... FOR UPDATE`). Re-checks expiration inside lock. Unrecoverable failures transition status to `'expired'`, wipe cached tokens, record sanitized error in metadata, and emit audit logs. |
| **D-05** | Platform Adapters | Isolated adapter classes implementing `SocialPlatformAdapter`: `TwitterAdapter` (API v2 PKCE, token rotation), `LinkedInAdapter` (OAuth 2.0 code grant, 60-day access / 365-day refresh), `BlogAdapter` (HMAC-SHA256 `X-LifeOS-Signature-256`, timing-safe verification). |
| **D-06** | Standardized Error Hierarchy | Normalized typed errors: `PlatformAuthenticationError` (401 / invalid grant -> unrecoverable), `PlatformRateLimitError` (429 -> extracts rate limit info), `PlatformNetworkError` (5xx / timeout -> retryable), `PlatformPayloadError` (400 / 422 -> validation defect). |

---

## 3. Technical Architecture & Component Design

```
+---------------------------------------------------------------------------------------------------+
|                                      LIFEOS APPLICATION LAYER                                      |
|                                                                                                   |
|    Settings UI Surface                     Next.js API Route Handlers                             |
|  (IntegrationsSettingsView)             (/api/integrations/social/[provider]/*)                   |
|           │                                         │                                             |
|           ▼                                         ▼                                             |
|  +─────────────────────────────────────────────────────────────────────────────────────────────+  |
|  |                             SocialIntegrationService & StateManager                         |  |
|  |    - Encrypted Cookie Store (`oauth_state_${provider}`) with AES-256-GCM & 10m TTL          |  |
|  |    - Initiates PKCE code challenge & generates state nonces                                 |  |
|  |    - Callback verification: validates user session binding & nonces                         |  |
|  +──────────────────────────────────────────────┬──────────────────────────────────────────────+  |
|                                                 │                                                 |
|                                                 ▼                                                 |
|  +─────────────────────────────────────────────────────────────────────────────────────────────+  |
|  |                             SocialTokenManager (Credential Store)                           |  |
|  |    - Proactive auto-refresh (< 5m threshold)                                                |  |
|  |    - Pessimistic DB Row-Locking (`SELECT ... FOR UPDATE`)                                   |  |
|  |    - AES-256-GCM Encryption / Decryption at Rest (`src/lib/crypto.ts`)                      |  |
|  |    - Fail-Closed Transitions (`expired` / `error`) & Token Purging                          |  |
|  |    - Audit Event Emission (`src/server/audit/index.ts`)                                     |  |
|  +──────────────────────┬───────────────────────────────────────┬──────────────────────────────+  |
|                         │                                       │                                 |
|                         ▼                                       ▼                                 |
|  +────────────────────────────────────────────────+  +─────────────────────────────────────────+  |
|  |          PostgreSQL 16 (Drizzle ORM)           |  |      SocialPlatformAdapter Contract     |  |
|  |  - `integration_connections` (Migration 0028)  |  |  - `TwitterAdapter` (API v2 PKCE)       |  |
|  |  - `audit_log` (Tamper-evident system logs)    |  |  - `LinkedInAdapter` (REST API)         |  |
|  |  - Check constraint: twitter/linkedin/blog     |  |  - `BlogAdapter` (HMAC Signed Webhook)  |  |
|  +────────────────────────────────────────────────+  +────────────────────┬────────────────────+  |
+---------------------------------------------------------------------------┼-----------------------+
                                                                            │
                                                HTTP (Fetch / Native Node)  │
                                                                            ▼
                                                +───────────────────────────────────────+
                                                |           External Platforms          |
                                                |   - Twitter/X API v2                  |
                                                |   - LinkedIn REST API                 |
                                                |   - Personal Blog Webhook Server      |
                                                +───────────────────────────────────────+
```

### 3.1 Database Schema Evolution (Migration 0028)

In [`src/server/db/schema/integrations.ts`](file:///home/hw/Projects/LifeOS/src/server/db/schema/integrations.ts):
```typescript
export const integrationConnections = pgTable(
  "integration_connections",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider", {
      enum: ["google_calendar", "github", "backup", "twitter", "linkedin", "blog"],
    }).notNull(),
    status: text("status", {
      enum: ["connected", "disconnected", "error", "expired"],
    })
      .notNull()
      .default("disconnected"),
    encryptedAccessToken: text("encrypted_access_token"),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    externalAccountId: text("external_account_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("integration_connections_user_provider_unique").on(
      table.userId,
      table.provider
    ),
    check(
      "integration_connections_status_check",
      sql`${table.status} IN ('connected', 'disconnected', 'error', 'expired')`
    ),
    check(
      "integration_connections_provider_check",
      sql`${table.provider} IN ('google_calendar', 'github', 'backup', 'twitter', 'linkedin', 'blog')`
    ),
    index("integration_connections_user_id_idx").on(table.userId),
    index("integration_connections_user_provider_idx").on(
      table.userId,
      table.provider
    ),
    index("integration_connections_status_idx").on(table.status),
  ]
);
```

#### Migration Snapshot Continuity Invariant
- **Migration SQL file**: `src/server/db/migrations/0028_social_platform_connectors.sql`
  ```sql
  ALTER TABLE "integration_connections" DROP CONSTRAINT IF EXISTS "integration_connections_provider_check";
  --> statement-breakpoint
  ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_provider_check" CHECK ("provider" IN ('google_calendar', 'github', 'backup', 'twitter', 'linkedin', 'blog'));
  ```
- **Journal entry** in `src/server/db/migrations/meta/_journal.json`:
  ```json
  {
    "idx": 28,
    "version": "7",
    "when": 1791200000000,
    "tag": "0028_social_platform_connectors",
    "breakpoints": true
  }
  ```
- **Snapshot file**: `src/server/db/migrations/meta/0028_snapshot.json`:
  - `"id": "28282828-2828-4828-8828-282828282828"`
  - `"prevId": "27272727-2727-4727-8727-272727272727"`
  - Updated `integration_connections_provider_check` value: `"\"integration_connections\".\"provider\" IN ('google_calendar', 'github', 'backup', 'twitter', 'linkedin', 'blog')"`
- Verified by: `pnpm exec drizzle-kit check` (must report zero drift).

---

### 3.2 Ephemeral OAuth PKCE & State Storage Architecture (Decision D-01)

RFC 7636 PKCE code exchange prevents authorization code injection and interception attacks. RFC 6749 state parameters prevent CSRF attacks.

1. **Generation (Initiation Phase)**:
   - Code Verifier: 32 bytes random URL-safe base64 string (43 characters).
     `codeVerifier = crypto.randomBytes(32).toString('base64url');`
   - Code Challenge: SHA-256 hash of `codeVerifier`, base64url-encoded:
     `codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');`
   - Code Challenge Method: `'S256'`
   - State Nonce: `crypto.randomUUID()`
2. **Encrypted Session Cookie**:
   - Cookie Name: `oauth_state_${provider}` (e.g. `oauth_state_twitter`, `oauth_state_linkedin`)
   - Payload:
     ```typescript
     interface OAuthStatePayload {
       userId: string;
       provider: 'twitter' | 'linkedin';
       stateNonce: string;
       codeVerifier?: string;
       redirectTarget: string;
       createdAt: number;
     }
     ```
   - Encryption: `encryptJSON(payload)` via [`src/lib/crypto.ts`](file:///home/hw/Projects/LifeOS/src/lib/crypto.ts#L106).
   - Cookie Settings:
     - `httpOnly: true` (prevents JavaScript/XSS exfiltration)
     - `secure: process.env.NODE_ENV === "production"`
     - `sameSite: "lax"` (required to allow browser to send cookie upon redirect back from external platform)
     - `path: "/"`
     - `maxAge: 600` (10 minutes)
3. **Verification (Callback Phase)**:
   - User session checked via [`requireAuthenticatedUser(req)`](file:///home/hw/Projects/LifeOS/src/server/auth/guard.ts).
   - Decrypt cookie via `decryptJSON<OAuthStatePayload>(cookieValue)`.
   - Security Invariants checked:
     - Cookie exists and decrypts successfully with authentic tag.
     - `cookie.userId === sessionUser.id` (strictly prevents cross-user session fixation / account attachment attacks).
     - `cookie.provider === provider`.
     - `cookie.stateNonce === query.state` (prevents CSRF).
     - `Date.now() - cookie.createdAt <= 10 * 60 * 1000` (10-minute expiry window).
   - Once verified, cookie is immediately deleted from browser response.

---

### 3.3 Credential Store & Token Lifecycle Manager (Decisions D-03, D-04)

Located at `src/server/integrations/social/token-manager.ts`:

#### 1. Proactive Auto-Refresh Threshold
- Evaluated as: `(tokenExpiresAt.getTime() - Date.now()) < 5 * 60 * 1000` (5 minutes).
- Ensures that downstream calls in Phase 23 (Publishing) and Phase 24 (Analytics) never encounter expired access tokens mid-operation.

#### 2. Pessimistic Concurrency Row Locking
- To eliminate race conditions between concurrent requests (e.g. background worker and manual user action simultaneously refreshing a token), the token refresh routine locks the row in PostgreSQL:
  ```typescript
  return await db.transaction(async (tx) => {
    const [conn] = await tx
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.userId, userId),
          eq(integrationConnections.provider, provider)
        )
      )
      .for("update");

    if (!conn) {
      throw new PlatformAuthenticationError(provider, `Connection not found for provider ${provider}`);
    }

    if (conn.status !== "connected") {
      throw new PlatformAuthenticationError(provider, `Connection status is '${conn.status}'`);
    }

    const now = Date.now();
    const expiresAt = conn.tokenExpiresAt ? conn.tokenExpiresAt.getTime() : 0;
    const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

    // Check if a concurrent transaction already completed the refresh
    if (expiresAt - now > REFRESH_THRESHOLD_MS) {
      return decryptSecret(conn.encryptedAccessToken!);
    }

    // Refresh execution...
  });
  ```

#### 3. Token Rotation & State Transitions
- **Twitter/X Token Rotation**: Twitter API v2 rotates refresh tokens on every refresh request. When a new refresh token is issued in the refresh response, it MUST immediately overwrite the old `encryptedRefreshToken`. If not rotated, the existing refresh token is preserved.
- **Fail-Closed Policy**:
  - If refresh encounters an unrecoverable authentication error (HTTP 401, `invalid_grant`, or revoked token):
    1. Status transitions to `'expired'`.
    2. Cached access and refresh tokens are wiped to `null`.
    3. Error details are sanitized (removing any potential tokens/secrets) and saved in `metadata.lastError`.
    4. Audit log emitted: `action: 'token_expired'`, `status: 'failure'`.
  - If refresh encounters transient network errors (HTTP 5xx / timeout):
    1. Status remains `'connected'` (or transitions to `'error'` if repeatedly failing).
    2. Cached tokens are preserved.
    3. Error logged, `PlatformNetworkError` thrown to allow caller retry.

---

### 3.4 Standardized `SocialPlatformAdapter` Contract (Decision D-05)

Located at `src/server/integrations/social/adapters/interface.ts`:

```typescript
export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number; // in seconds
  scope?: string;
  token_type?: string;
}

export interface UserProfile {
  id: string;
  username?: string;
  displayName?: string;
  email?: string;
  profileImageUrl?: string;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTimestamp: number; // Unix epoch timestamp in seconds
  retryAfterSeconds?: number;
}

export interface BlogVerificationResult {
  success: boolean;
  status: number;
  latencyMs: number;
  message?: string;
}

export interface SocialPlatformAdapter {
  readonly platform: 'twitter' | 'linkedin' | 'blog';

  /**
   * Generates authorization URL for OAuth 2.0 PKCE / Code Grant.
   * Throws if platform does not use OAuth (e.g. blog).
   */
  getAuthorizationUrl(params: {
    userId: string;
    redirectUri: string;
    state: string;
    codeChallenge?: string;
  }): string;

  /**
   * Exchanges authorization code for OAuth tokens.
   */
  exchangeCode(params: {
    code: string;
    redirectUri: string;
    codeVerifier?: string;
  }): Promise<OAuthTokens>;

  /**
   * Refreshes expiring access token using stored refresh token.
   */
  refreshToken(refreshToken: string): Promise<OAuthTokens>;

  /**
   * Fetches sanitized account identity from provider userinfo endpoint.
   */
  getUserProfile(accessToken: string): Promise<UserProfile>;

  /**
   * Best-effort token revocation upon user disconnection.
   */
  revokeToken?(accessToken: string): Promise<void>;

  /**
   * Normalizes provider rate limit response headers.
   */
  parseRateLimits(headers: Headers): RateLimitInfo | null;

  /**
   * Dispatches signed ping request to verify blog webhook URL and secret.
   */
  verifyWebhook?(params: {
    webhookUrl: string;
    secret: string;
  }): Promise<BlogVerificationResult>;

  /**
   * Computes HMAC-SHA256 signature for outgoing webhook payload.
   */
  computeSignature?(rawBody: string, secret: string): string;

  /**
   * Timing-safe verification of HMAC signature for incoming / outgoing test verification.
   */
  verifySignature?(rawBody: string, signatureHeader: string, secret: string): boolean;
}
```

---

### 3.5 Isolated Platform Adapter Specifications

#### 1. TwitterAdapter (`src/server/integrations/social/adapters/twitter-adapter.ts`)
- **OAuth Specification**: OAuth 2.0 Authorization Code Flow with PKCE (RFC 7636).
- **Endpoints**:
  - Auth: `https://twitter.com/i/oauth2/authorize`
  - Token Exchange & Refresh: `https://api.twitter.com/2/oauth2/token`
  - User Info: `https://api.twitter.com/2/users/me?user.fields=profile_image_url`
  - Revocation: `https://api.twitter.com/2/oauth2/revoke`
- **Required Scopes**: `tweet.read`, `tweet.write`, `users.read`, `offline.access`.
- **Token Exchange**: POST to token endpoint with `code_verifier`, `code`, `grant_type=authorization_code`, `redirect_uri`, `client_id`. If `TWITTER_CLIENT_SECRET` is configured, authenticate with HTTP Basic Auth header: `Basic base64(client_id:client_secret)`.
- **Token Refresh**: POST with `grant_type=refresh_token`, `refresh_token`, `client_id`. **Enforces token rotation** by persisting the newly returned refresh token.
- **Rate Limit Headers**: Parses `x-rate-limit-limit`, `x-rate-limit-remaining`, `x-rate-limit-reset`.

#### 2. LinkedInAdapter (`src/server/integrations/social/adapters/linkedin-adapter.ts`)
- **OAuth Specification**: OAuth 2.0 Authorization Code Grant.
- **Endpoints**:
  - Auth: `https://www.linkedin.com/oauth/v2/authorization`
  - Token Exchange & Refresh: `https://www.linkedin.com/oauth/v2/accessToken`
  - User Info: `https://api.linkedin.com/v2/userinfo` (OpenID Connect userinfo)
- **Required Scopes**: `openid`, `profile`, `email`, `w_member_social`.
- **Token Lifetimes**: Access token expires after 60 days (`expires_in: 5184000`), Refresh token (where available) expires after 365 days.
- **Rate Limit Headers**: Parses `x-ratelimit-remaining`, `x-ratelimit-reset`, `Retry-After`.

#### 3. BlogAdapter (`src/server/integrations/social/adapters/blog-adapter.ts`)
- **Specification**: Outbound HTTPS Webhook with HMAC-SHA256 signature.
- **Shared Secret Storage**: Generated (32 bytes hex) or user-supplied, encrypted at rest via `encryptSecret` in `integration_connections.encryptedAccessToken`.
- **Signature Calculation**:
  - Header: `X-LifeOS-Signature-256: sha256=<hex_digest>`
  - Computed as: `crypto.createHmac('sha256', secret).update(rawJsonBody).digest('hex')`.
- **Ping Payload**:
  ```json
  {
    "event": "lifeos.ping",
    "timestamp": "2026-10-02T12:00:00.000Z",
    "version": "1.0"
  }
  ```
- **Verification Routine**:
  - Dispatches POST request with timeout (5000ms).
  - Measures roundtrip latency.
  - Verifies HTTP 2xx response.
  - Fail-closed timing-safe signature comparison via `crypto.timingSafeEqual`.

---

### 3.6 Standardized Error Hierarchy (Decision D-06)

Located at `src/server/integrations/social/errors.ts`:

```typescript
export class PlatformError extends Error {
  readonly platform: 'twitter' | 'linkedin' | 'blog';
  readonly statusCode?: number;
  readonly retryable: boolean;

  constructor(platform: 'twitter' | 'linkedin' | 'blog', message: string, statusCode?: number, retryable = false) {
    super(`[${platform.toUpperCase()}] ${message}`);
    this.name = 'PlatformError';
    this.platform = platform;
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

export class PlatformAuthenticationError extends PlatformError {
  constructor(platform: 'twitter' | 'linkedin' | 'blog', message = 'Authentication or token authorization failed') {
    super(platform, message, 401, false);
    this.name = 'PlatformAuthenticationError';
  }
}

export class PlatformRateLimitError extends PlatformError {
  readonly rateLimits: RateLimitInfo;

  constructor(platform: 'twitter' | 'linkedin' | 'blog', rateLimits: RateLimitInfo, message = 'Rate limit exceeded') {
    super(platform, message, 429, true);
    this.name = 'PlatformRateLimitError';
    this.rateLimits = rateLimits;
  }
}

export class PlatformNetworkError extends PlatformError {
  constructor(platform: 'twitter' | 'linkedin' | 'blog', message: string, statusCode = 502) {
    super(platform, message, statusCode, true);
    this.name = 'PlatformNetworkError';
  }
}

export class PlatformPayloadError extends PlatformError {
  constructor(platform: 'twitter' | 'linkedin' | 'blog', message: string, statusCode = 400) {
    super(platform, message, statusCode, false);
    this.name = 'PlatformPayloadError';
  }
}
```

---

### 3.7 API Routes Architecture

Located under `src/app/api/integrations/social/`:

| Method | Endpoint | Description | Auth Requirement |
|---|---|---|---|
| `GET` | `/api/integrations/social/[provider]/auth` | Generates OAuth PKCE authorization URL, sets encrypted `oauth_state_${provider}` cookie, returns `{ url }`. | Authenticated User Session |
| `GET` | `/api/integrations/social/[provider]/callback` | Validates CSRF state and session cookie, exchanges code for tokens, saves connection, redirects to settings. | Authenticated User Session |
| `GET` | `/api/integrations/social/[provider]/status` | Returns sanitized `SocialConnectionDTO` (never raw tokens/secrets). | Authenticated User Session |
| `POST` | `/api/integrations/social/[provider]/disconnect` | Revokes remote tokens (best-effort), clears database tokens, logs audit entry. | Authenticated User Session |
| `POST` | `/api/integrations/social/blog/configure` | Sets blog webhook URL and secret, sends signed ping verification test. | Authenticated User Session |
| `POST` | `/api/integrations/social/blog/ping` | Sends immediate test ping with HMAC signature to verify connectivity. | Authenticated User Session |

---

### 3.8 Settings UI Surface Integration

In [`src/components/settings/integrations-settings-view.tsx`](file:///home/hw/Projects/LifeOS/src/components/settings/integrations-settings-view.tsx), introduce a dedicated **Social Connectors & Webhooks** card section alongside GitHub and Backups:
- **Twitter/X Section**: Shows connected account handle (`@username`) or disconnected badge; "Connect Twitter" triggers PKCE flow; "Disconnect" removes credentials.
- **LinkedIn Section**: Shows connected member name/email or disconnected badge; "Connect LinkedIn" triggers OAuth code flow; "Disconnect" removes credentials.
- **Personal Blog Webhook Section**: Configuration form with Webhook Endpoint URL input and Shared Secret key (with "Generate Secret" helper). Includes "Test Ping" button displaying roundtrip latency, status code, and HMAC verification confirmation.

---

## 4. Package & Environment Verification

### Zero New External npm Dependencies
All required capabilities are implemented using existing packages in `package.json`:
- **Node.js native `crypto`**: PBKDF2, random IV generation, AES-256-GCM cipher/decipher, timingSafeEqual, SHA-256, HMAC-SHA256.
- **Drizzle ORM (`drizzle-orm`) & PostgreSQL (`pg`)**: Relational tables, check constraints, row-level pessimistic locking (`.for("update")`).
- **Zod (`zod`)**: Runtime schema validation for query params, payloads, and DTOs.
- **Next.js 15 App Router (`next`)**: Dynamic Route Handlers, encrypted cookie management (`NextResponse.cookies.set`).
- **Better Auth (`better-auth`)**: Authenticated session resolution via `requireAuthenticatedUser`.

### Environment Configuration Variables
These optional credentials are read at runtime without failing startup if unconfigured:
- `TWITTER_CLIENT_ID`: Twitter OAuth 2.0 App Client ID.
- `TWITTER_CLIENT_SECRET`: Twitter OAuth 2.0 App Client Secret (optional for public PKCE, used if confidential).
- `TWITTER_REDIRECT_URI`: Overrides default `${BETTER_AUTH_URL}/api/integrations/social/twitter/callback`.
- `LINKEDIN_CLIENT_ID`: LinkedIn App Client ID.
- `LINKEDIN_CLIENT_SECRET`: LinkedIn App Client Secret.
- `LINKEDIN_REDIRECT_URI`: Overrides default `${BETTER_AUTH_URL}/api/integrations/social/linkedin/callback`.

---

## 5. Nyquist Validation Architecture & Test Matrix

In strict accordance with project conventions:
- **Clean `src/` Convention**: ZERO test files inside `src/`.
- All tests are placed in `scripts/tests/phase-22/plan-01/` and `scripts/tests/phase-22/plan-02/`.

### Plan 22-01 Test Suites (`scripts/tests/phase-22/plan-01/`)
1. `schema-and-migration.test.ts`:
   - Validates migration 0028 syntax and schema definitions.
   - Asserts linear snapshot linkage (`0028_snapshot.json` -> `0027_snapshot.json`).
   - Asserts valid providers (`'twitter'`, `'linkedin'`, `'blog'`) pass check constraints and invalid providers are rejected.
2. `crypto-and-cookies.test.ts`:
   - Validates AES-256-GCM encryption and decryption round-trip for OAuth access tokens, refresh tokens, and blog secrets.
   - Validates tampering rejection (modified ciphertext or tag throws authentication error).
   - Validates encrypted session cookie creation, decryption, and 10-minute expiration enforcement.
   - Asserts cross-user mismatch detection (state cookie bound to `user_a` rejected when completed by `user_b`).
3. `token-lifecycle.test.ts`:
   - Validates proactive token refresh triggering when `tokenExpiresAt - NOW() < 5 minutes`.
   - Validates pessimistic row-level locking (`SELECT ... FOR UPDATE`): simulates concurrent callers and proves duplicate HTTP refresh calls are prevented.
   - Validates fail-closed state transition: `invalid_grant` or revoked refresh token transitions status to `'expired'`, purges cached tokens, records sanitized error in metadata, and emits transactional audit log.
   - Validates token rotation handling (Twitter refresh token updated in database).

### Plan 22-02 Test Suites (`scripts/tests/phase-22/plan-02/`)
1. `twitter-adapter.test.ts`:
   - Tests PKCE code challenge generation (`S256`), code exchange, token rotation refresh, and user profile retrieval with deterministic mock HTTP harness.
   - Tests rate limit header parsing (`x-rate-limit-remaining`, `x-rate-limit-reset`) and error classification into `PlatformRateLimitError`.
2. `linkedin-adapter.test.ts`:
   - Tests OAuth 2.0 authorization code exchange, token refresh, and userinfo profile parsing.
   - Tests error normalization (401 -> `PlatformAuthenticationError`, 5xx -> `PlatformNetworkError`).
3. `blog-adapter.test.ts`:
   - Tests HMAC-SHA256 signature computation over raw body (`X-LifeOS-Signature-256`).
   - Tests timing-safe verification with matching and mismatched signatures.
   - Tests webhook ping dispatch using a local ephemeral HTTP server (`http.createServer`).
4. `social-api-routes.test.ts`:
   - End-to-end integration tests for `/auth`, `/callback`, `/status`, `/disconnect`, and blog `/configure` / `/ping` routes.
   - Verifies that all response DTOs strictly scrub raw tokens and secrets.

---

## 6. Execution Plan Breakdown & Dependencies

The phase is structured into 2 sequential execution plans:

### Plan 22-01: Forward Database Schema Evolution, Encrypted Credential Store & OAuth Lifecycle Token Manager
- **Deliverables**:
  1. Migration 0028 (`0028_social_platform_connectors.sql`), updated schema in [`src/server/db/schema/integrations.ts`](file:///home/hw/Projects/LifeOS/src/server/db/schema/integrations.ts), `0028_snapshot.json` linked to `0027`, and `_journal.json`.
  2. Types and error hierarchy in `src/server/integrations/social/types.ts` and `src/server/integrations/social/errors.ts`.
  3. Encrypted PKCE and CSRF state cookie manager in `src/server/integrations/social/cookie.ts`.
  4. Concurrency-safe, proactive `SocialTokenManager` in `src/server/integrations/social/token-manager.ts` with `SELECT ... FOR UPDATE` locking, proactive refresh, fail-closed transitions, and secret redaction.
  5. Test suite in `scripts/tests/phase-22/plan-01/`.

### Plan 22-02: Isolated Platform Adapters, Signed Blog Webhooks, API Routes & Settings UI
- **Deliverables**:
  1. `SocialPlatformAdapter` interface in `src/server/integrations/social/adapters/interface.ts`.
  2. `TwitterAdapter` in `src/server/integrations/social/adapters/twitter-adapter.ts` with PKCE S256 and token rotation.
  3. `LinkedInAdapter` in `src/server/integrations/social/adapters/linkedin-adapter.ts` with OIDC profile fetch.
  4. `BlogAdapter` in `src/server/integrations/social/adapters/blog-adapter.ts` with HMAC-SHA256 signing and timing-safe verification.
  5. Adapter registry/factory in `src/server/integrations/social/adapters/index.ts`.
  6. API routes under `src/app/api/integrations/social/`: `/auth`, `/callback`, `/status`, `/disconnect`, blog `/configure`, blog `/ping`.
  7. UI controls in [`src/components/settings/integrations-settings-view.tsx`](file:///home/hw/Projects/LifeOS/src/components/settings/integrations-settings-view.tsx).
  8. Test suite in `scripts/tests/phase-22/plan-02/`.

---

## 7. Critical Pitfalls, Edge Cases & Preventative Controls

| Pitfall / Edge Case | Risk | Preventative Control & Architecture Invariant |
|---|---|---|
| **Twitter Refresh Token Rotation** | Twitter API v2 invalidates the old refresh token as soon as a new one is issued. If not persisted immediately, all subsequent refreshes fail irreversibly. | `TwitterAdapter.refreshToken` returns the new refresh token, and `SocialTokenManager` atomically commits the new `encryptedRefreshToken` in the same database transaction. |
| **Concurrent Duplicate Refreshes (Thundering Herd)** | Multiple concurrent requests notice an expiring token and simultaneously hit Twitter/LinkedIn token endpoints, invalidating refresh tokens. | `SELECT ... FOR UPDATE` locks the connection row. Inside the lock, the expiration time is re-evaluated; if already refreshed by another worker, the fresh token is returned immediately without an HTTP request. |
| **Cross-User Session Fixation / CSRF** | Malicious actor initiates OAuth and convinces another user to complete the callback, linking the victim's LifeOS to the attacker's social account. | State cookie payload binds `userId` to the initiating session. Callback strictly validates `cookie.userId === session.user.id`. |
| **Plaintext Credential Leakage** | Leaking sensitive tokens or webhook secrets in logs, database audit payloads, error messages, or API responses. | All tokens/secrets encrypted with AES-256-GCM via `encryptSecret`. All public DTOs explicitly omit token fields. Audit logs and error messages record only sanitized metadata. |
| **Drizzle Kit Snapshot Chain Disruption** | Modifying check constraints or tables without creating valid snapshot json breaks `drizzle-kit check`. | Generate linear `0028_snapshot.json` pointing `prevId` to `27272727-2727-4727-8727-272727272727`, append entry to `_journal.json`, and run `pnpm exec drizzle-kit check`. |
| **Blog Webhook Timing Attacks** | Naive string comparison (`signature === computed`) susceptible to timing side-channel attacks. | Enforce `crypto.timingSafeEqual` with identical buffer lengths, failing closed on mismatch. |

---

*Phase 22 Research completed and verified for LifeOS v3.0.*
