# LifeOS Authentication & Server Authorization Boundary

## 1. Threat Model & Security Invariants

LifeOS is designed as a single-tenant personal operating system where sensitive personal data (tasks, finances, knowledge, health, and credentials) is unified in PostgreSQL. The authentication and authorization architecture defends against:

1. **Unauthenticated Access**: Direct requests to protected endpoints or queries without an active, authentic session must fail closed (`401 Unauthorized`).
2. **Session Forgery & Tampering**: Client-manipulated tokens or fabricated cookies must be detected and rejected (`401 Unauthorized`). Session tokens in cookies are HMAC-SHA256 signed using `BETTER_AUTH_SECRET`.
3. **Session Replay After Revocation**: When a user logs out (`signOut`) or an admin resets credentials (`auth:reset`), the server immediately deletes the session in PostgreSQL. Any subsequent attempt to reuse that session token fails closed (`401 Unauthorized`).
4. **Session Expiration**: Stale sessions past their 30-day window cannot access data (`401 Unauthorized`).
5. **Insecure Direct Object Reference (IDOR)**: A malicious actor possessing a valid session cannot read or mutate data belonging to another user. Authorization is derived exclusively from the validated server-side session, never from `request.userId`, route parameters, query strings, or body payloads.
6. **Query-Level Data Leakage**: Ownership is enforced at the SQL query level (`WHERE user_id = $session_user_id`) rather than fetching resources and checking ownership in memory.
7. **Client Secret Leakage**: Database pool instances, PostgreSQL credentials, and secret environment variables (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `LIFEOS_ENCRYPTION_KEY`) must never be imported into client components or browser bundles.

---

## 2. Authentication Flow

```text
HTTP Request (Cookie: better-auth.session_token=<token>.<sig>)
   │
   ▼
Better Auth Cookie Verifier (HMAC-SHA256 Signature Check)
   │ (rejects if signature invalid or forged)
   ▼
PostgreSQL Session Lookup (SELECT * FROM session WHERE token = $token AND expires_at > NOW())
   │ (rejects if session missing, revoked, or expired)
   ▼
User Identity Resolution (JOIN user ON session.user_id = user.id)
   │
   ▼
requireAuthenticatedUser() (Returns { user, session })
   │
   ▼
Query-Level Ownership Scoping (WHERE user_id = user.id)
   │
   ▼
PostgreSQL Database Operation
```

### Single-User Registration Lock (Decision D-01, Plan 01-04.1)
LifeOS is strictly dedicated to a single owner. The system guarantees single-user cardinality at both the application boundary and the PostgreSQL storage engine layer:
- **Storage Engine Constraint (`single_user_lock`)**:
  The `user` table enforces cardinality via:
  ```sql
  single_user_lock boolean DEFAULT true NOT NULL,
  CONSTRAINT user_single_user_lock_unique UNIQUE (single_user_lock),
  CONSTRAINT user_single_user_lock_check CHECK (single_user_lock = true)
  ```
  PostgreSQL's B-tree unique index locks the tuple key `true`. Under concurrent registration races, exactly one transaction can insert; concurrent or subsequent transactions fail with `23505 unique_violation`. Direct SQL inserts and Better Auth bypass attempts are strictly rejected at the database level.
- **HTTP Hook (`hooks.before`)**: Fast fail-closed pre-check intercepting `/sign-up` requests. If `SELECT id FROM user LIMIT 1` returns any record, immediately throws `APIError("FORBIDDEN", 403)`.
- **Database Hook (`databaseHooks.user.create.before`)**: Fast fail-closed check at the adapter level before statement execution.
- Subsequent registration attempts are rejected with `403 Forbidden`.

---

## 3. Session Lifecycle & Cookie Configuration

- **Storage**: Sessions are stored in the PostgreSQL `session` table (`id`, `user_id`, `token`, `expires_at`, `ip_address`, `user_agent`, `created_at`, `updated_at`).
- **TTL**: 30 days (`expiresIn: 2592000s`), with sliding window renewal every 24 hours on activity (`updateAge: 86400s`).
- **Cookie Security**:
  - `HttpOnly: true` (inaccessible to browser JavaScript / XSS).
  - `SameSite: "lax"` (mitigates CSRF).
  - `Secure: true` in production (`NODE_ENV === "production"`).
  - `Path: "/"`
  - Signed value: `<token>.<hmac_signature>` generated via `better-auth/crypto`.

---

## 4. Server Authorization Primitives

Located in `src/server/auth/guard.ts`:

### `requireAuthenticatedUser(source?)`
Resolves incoming headers (from explicit request arguments, `{ headers: ... }` dictionaries, or Next.js `headers()`), validates the session via Better Auth, and returns `{ user, session }`.
- **Fails Closed**: Throws `AuthenticationError` (`status: 401`, `code: "UNAUTHORIZED"`).
- Never trusts client-supplied user IDs.

### `requireResourceOwnership(resourceUserId, authenticatedUserId)`
Validates that a targeted resource owner ID matches the authenticated user ID.
- **Fails Closed**: Throws `AuthorizationError` (`status: 403`, `code: "FORBIDDEN"`) if either ID is empty, whitespace-only, non-string, null, undefined, or mismatched (preventing IDOR / BOLA).

### `withUserScope(column, authenticatedUserId, extraCondition?)`
Helper that constructs a Drizzle SQL condition enforcing query-level ownership filtering:
```ts
eq(column, authenticatedUserId.trim())
```
Guarantees non-empty trimmed string identity before database query generation.

---

## 5. Emergency Account Recovery (Decision D-04)

In the event of lost credentials, the CLI recovery script `pnpm auth:reset` (`scripts/auth-reset.ts`) allows resetting credentials directly from the host terminal:
```bash
pnpm auth:reset --email <email> --password <new_password>
```
1. Computes high-entropy password hash using `better-auth/crypto`.
2. Updates credentials in the `account` table and revokes all active sessions in the `session` table inside an **atomic PostgreSQL database transaction** (`db.transaction`).
3. Writes an immutable audit record to `audit_log` with `action: "auth.cli_reset"`, `category: "security"`.

---

## 6. Plan 01-05 Adversarial Hardening & Boundary Defense

An adversarial security audit of all API boundaries, authentication hooks, and storage-engine constraints established:

1. **Audit Log FK Sanitization**: `createAuditLog` sanitizes `userId` (`params.userId?.trim() || null`). Empty strings or whitespace do not violate PostgreSQL foreign key constraints (`audit_log_user_id_user_id_fk`), ensuring security event logs are never dropped.
2. **Atomic Upsert Concurrency**: `updateUserPreferences` uses a single atomic `INSERT INTO ... ON CONFLICT (user_id) DO UPDATE` query rather than check-then-act. Concurrent mutations cannot fail with unique constraint violations or 500 errors.
3. **Strict Payload Boundaries**: `updatePreferencesSchema` is strictly closed (`.strict()`). Unrecognized properties (`ownerId`, `user_id`, `id`, `singleUserLock`, `admin`) are rejected immediately with `400 Bad Request`.
4. **Whitespace & Type Confusion Defense**: All authorization guards and services validate that user identifiers and formatting parameters are non-empty trimmed strings.
5. **Fail-Closed API Surface**: Unauthenticated requests to `/api/preferences` (GET, PATCH, PUT) and Better Auth internal endpoints (`list-sessions`, `revoke-session`, `update-user`, `delete-user`, passkeys) fail closed with `401 Unauthorized` without leaking stack traces or internal SQL.

---

## 7. Plan 01-06 Adversarial Application & API Boundary Hardening

An adversarial security audit of application endpoints, browser security headers, payload boundaries, and data-access flows established:

1. **Cache-Control & User Data Isolation**: Authenticated API routes (`/api/preferences`) enforce dynamic execution (`export const dynamic = "force-dynamic"`) and set `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` and `Pragma: no-cache` on all responses, preventing proxy or CDN response caching across users.
2. **Payload Size Guard (DoS Defense)**: Mutation routes enforce dual-layer byte length limits: checking `Content-Length` and verifying raw body byte size `<= 32KB` before JSON parsing, preventing memory exhaustion (OOM) denial-of-service attacks.
3. **MIME / Content-Type Enforcement**: Mutation endpoints verify `Content-Type: application/json` and reject non-JSON payloads with `415 Unsupported Media Type`.
4. **Stored XSS Prevention**: Preference formatting schemas (`dateFormat`) strictly forbid HTML tags (`<script>`, `<img>`), JavaScript pseudoprotocols, ASCII control characters, and null bytes via character allowlist regex (`/^[a-zA-Z0-9\s/._\-:,]+$/`).
5. **Audit Log Ingress Sanitization**: `createAuditLog` bounds and sanitizes incoming IP addresses (max 128 chars) and User-Agent headers (max 512 chars) and validates non-empty action strings, preventing table bloat and log poisoning.
6. **Browser Security Headers**: Global Next.js configuration enforces `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `X-XSS-Protection: 0`, and `Cross-Origin-Opener-Policy: same-origin`.
7. **CLI Password Length Boundary**: The emergency recovery script (`scripts/auth-reset.ts`) enforces password length between 8 and 128 characters, matching Better Auth's password hashing policy.

For complete audit documentation and mutation testing evidence, see `docs/security/api-security-audit.md`.

---

## 8. Verification Commands

```bash
# Run all unit, adversarial guard, and boundary tests
pnpm test

# Run live PostgreSQL integration tests with authenticity enforcement
REQUIRE_DB=true pnpm test:integration

# Type check
npx tsc --noEmit

# Production build
pnpm build
```
