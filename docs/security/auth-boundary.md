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

### Single-User Registration Lock (Decision D-01)
LifeOS is dedicated to a single owner. When the first user registers, that user claims ownership of the system:
- **HTTP Hook (`hooks.before`)**: Intercepts `/sign-up` requests. If `SELECT id FROM user LIMIT 1` returns any record, immediately throws `APIError("FORBIDDEN", 403)`.
- **Database Hook (`databaseHooks.user.create.before`)**: Defense-in-depth trigger at the adapter level preventing user row insertion if a user already exists.
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
Resolves incoming headers (from explicit request arguments or Next.js `headers()`), validates the session via Better Auth, and returns `{ user, session }`.
- **Fails Closed**: Throws `AuthenticationError` (`status: 401`, `code: "UNAUTHORIZED"`).
- Never trusts client-supplied user IDs.

### `requireResourceOwnership(resourceUserId, authenticatedUserId)`
Validates that a targeted resource owner ID matches the authenticated user ID.
- **Fails Closed**: Throws `AuthorizationError` (`status: 403`, `code: "FORBIDDEN"`).

### `withUserScope(column, authenticatedUserId, extraCondition?)`
Helper that constructs a Drizzle SQL condition enforcing query-level ownership filtering:
```ts
eq(column, authenticatedUserId)
```

---

## 5. Emergency Account Recovery (Decision D-04)

In the event of lost credentials, the CLI recovery script `pnpm auth:reset` (`scripts/auth-reset.ts`) allows resetting credentials directly from the host terminal:
```bash
pnpm auth:reset --email <email> --password <new_password>
```
1. Computes high-entropy password hash using `better-auth/crypto`.
2. Updates credentials in the `account` table.
3. Immediately revokes all active sessions from the `session` table.
4. Writes an immutable audit record to `audit_log` with `action: "auth.cli_reset"`, `category: "security"`.

---

## 6. Verification Commands

```bash
# Run all unit and boundary tests
pnpm test

# Run live PostgreSQL integration tests with authenticity enforcement
REQUIRE_DB=true pnpm test:integration

# Type check
npx tsc --noEmit

# Production build
pnpm build
```
