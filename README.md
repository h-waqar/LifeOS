# LifeOS

LifeOS is a personal operating system designed to manage, understand, and improve life from a single unified system.

## Prerequisites

- **Node.js**: 20+ LTS
- **pnpm**: 9+
- **Docker & Docker Compose**: (for local PostgreSQL service)

## Quick Start

### 1. Environment Configuration

Generate secure local environment secrets:

```bash
pnpm env:generate
```

This creates `.env.local` with cryptographically secure values for `BETTER_AUTH_SECRET` and `LIFEOS_ENCRYPTION_KEY` with restricted `0600` permissions.

### 2. Start PostgreSQL Container

Start the local PostgreSQL container via Docker Compose:

```bash
docker compose up -d postgres
```

> **Note on Linux Permissions**: If your user is not in the `docker` group, run with `sudo docker compose up -d postgres` or add your user:
> ```bash
> sudo usermod -aG docker $USER && newgrp docker
> ```

### 3. Database Migrations

Generate schema migrations (when schema definitions change):

```bash
pnpm db:generate
```

Apply pending migrations to PostgreSQL:

```bash
pnpm db:migrate
```

Launch Drizzle Studio for visual database inspection:

```bash
pnpm db:studio
```

### 4. Running Tests

Run all unit, schema, configuration, and architecture boundary tests:

```bash
pnpm test
```

Run live integration tests (requires running PostgreSQL container):

```bash
pnpm test:integration
```

Run typecheck and production build verification:

```bash
npx tsc --noEmit
pnpm build
```

## Architecture Boundaries & Conventions

- **Modular Monolith**: Clean layer separation (`src/features/*`, `src/lib/*`, `src/server/*`).
- **Clean `src/` Rule**: All tests must reside under `scripts/tests/{phase}/{plan}/...`. Zero test files are permitted in `src/`.
- **Database Scope**: Phase 1 database tables are strictly limited to foundational infrastructure (`user`, `session`, `account`, `verification`, `passkey`, `user_preferences`, `audit_log`). Domain tables are added incrementally in later phases.
- **Server-Only Protection**: Database pool and secrets cannot be imported into browser/client bundles.
- **Audit-Log Security & Privilege Separation**: The `audit_log` table enforces an application-role append-only boundary. The application role (`lifeos_app`) possesses `SELECT` and `INSERT` privileges only (zero `UPDATE`, `DELETE`, or `TRUNCATE` access). Direct deletion is blocked by the BEFORE DELETE trigger `trg_audit_log_prevent_direct_delete`, which verifies transaction-local purge context (`lifeos.in_purge_procedure`). Pruning is strictly mediated by the `SECURITY DEFINER` procedure `purge_expired_audit_logs(retention_days)` with a fixed `search_path = pg_catalog`, maximum retention cap (36500 days), and a non-bypassable 90-day minimum retention wall. (Note: Immutability applies to `lifeos_app`; PostgreSQL table owners and superusers retain administrative DDL control).
- **Security Advisory (Credential Rotation)**: The prior development role password `'lifeos_app_password'` was committed in initial migration iterations and must be considered compromised. Any environment where migration 0002 previously executed must rotate the role password (`ALTER ROLE lifeos_app WITH PASSWORD '<new_secret>';`). All migrations now provision `lifeos_app NOLOGIN` without static passwords.
- **Connection Lifecycle State Machine**: The database lifecycle follows a formal finite state machine (`IDLE` -> `CONNECTING` -> `READY` -> `CLOSING` -> `CLOSED`). State `READY` denotes that the pool resource is allocated and ready for lazy connections; live query connectivity is validated via `checkDatabaseHealth()`. To prevent race conditions, calling `getPool()` or `getDb()` during `CLOSING` immediately throws an explicit error.
- **Integration Test Authenticity Contract**: Integration tests (`pnpm test:integration`) adhere to a verified three-state contract:
  - PostgreSQL offline + `REQUIRE_DB` unset → tests genuinely SKIPPED (never reported as passed).
  - PostgreSQL offline + `REQUIRE_DB=true` → suite FAILS with non-zero exit code.
  - PostgreSQL online → live integration tests execute and pass.
- **Authentication & Identity Boundary**: Better Auth 1.7.4 is integrated via `drizzleAdapter` backed by the singleton database client (`src/server/auth/index.ts`). User identity is derived strictly from validated server-side sessions; client-supplied `userId` values in request bodies, query parameters, URL segments, or headers are never trusted.
- **Single-User Auto-Lock (Decision D-01)**: The first account created claims ownership of LifeOS. Both HTTP middleware hooks (`hooks.before`) and database hooks (`databaseHooks.user.create.before`) reject subsequent registrations with `403 Forbidden`.
- **Session Security & Lifecycle**: Sessions are persisted in PostgreSQL with a 30-day sliding TTL renewed on activity. Session cookies are HTTP-only, `SameSite=lax`, secure in production, and HMAC-SHA256 signed with `BETTER_AUTH_SECRET`. Logout (`signOut`) immediately deletes the session in PostgreSQL, rendering subsequent requests unauthenticated and preventing replay attacks.
- **Server Authorization Boundary**: Protected operations enforce session verification via `requireAuthenticatedUser()` (`src/server/auth/guard.ts`), which fails closed (401 Unauthorized) on missing, expired, revoked, or forged tokens. Resource ownership is enforced via `requireResourceOwnership()` (403 Forbidden) and query-level scoping `withUserScope()` / `WHERE user_id = authenticated_user_id` (preventing IDOR).
- **CLI Emergency Account Recovery (Decision D-04)**: When locked out, owner credentials can be recovered directly via `pnpm auth:reset` (`scripts/auth-reset.ts`). This updates the password hash in the `account` table, immediately revokes all active sessions, and logs an immutable security audit entry.
