---
phase: "21"
name: "Production Infrastructure Hardening & Migration Baseline Alignment"
created: 2026-10-02
---

# Phase 21: Production Infrastructure Hardening & Migration Baseline Alignment — Context

## Governance & Origin

Executes requirements **PROD-01** and **PROD-03** from Milestone v2.1:
- **PROD-01**: Production deployment testing under TLS termination, reverse-proxy forwarding, HTTP/2 or HTTP/3, and private CDN/cache-control behavior (executes Item 7 of the Deferred Independent QA Register `docs/qa/deferred-independent-qa.md`).
- **PROD-03**: Drizzle Kit migration snapshot and baseline reconciliation for historical migrations `0012–0026` (and `0027`), with zero schema drift and no migration journal disruption.

## Objectives & Scope

1. **PROD-01 (Production Infrastructure & Network Hardening):**
   - Verify the complete production request path under reverse-proxy and TLS termination:
     - `X-Forwarded-Proto`, `X-Forwarded-Host`, `X-Forwarded-For` header handling.
     - Framework-level reverse-proxy trusted header handling and host header validation.
     - Secure cookie and session attributes (`Secure`, `SameSite=Lax`, `HttpOnly`) when HTTPS terminates upstream at a proxy.
     - Redirect and canonical URL construction under forwarded HTTPS.
     - Rejection or sanitization of unsafe/spoofed forwarding headers.
     - HTTP/2 protocol compatibility and multiplexing over TLS.
     - Private CDN and cache-control behavior:
       - Authenticated and sensitive responses (`/api/*`, user-specific pages, server action mutations) must return `private, no-cache, no-store, max-age=0, must-revalidate` directives, preventing public CDN caching of private data.
       - Static immutable assets (`/_next/static/*`) maintain long-lived public cacheability.
       - PWA assets (`/manifest.webmanifest`, `/sw.js`, icons) maintain appropriate revalidation headers.
     - Permissions-Policy adjustment: permit microphone for `self` (`microphone=(self)`) to support voice quick capture without opening third-party permissions.
     - HSTS (`Strict-Transport-Security`) header enforcement in production.
     - Reproducible local TLS, HTTP/2, reverse proxy, and CDN harness with automated regression tests.

2. **PROD-03 (Drizzle Kit Migration Baseline Reconciliation):**
   - Audit the complete Drizzle migration chain (`0000_productive_lord_hawal.sql` through `0027_agent_safety_and_audit.sql`).
   - Reconcile the historical snapshot gap in `src/server/db/migrations/meta/` for migrations `0012–0026` (and `0027`).
   - Maintain strict journal integrity in `src/server/db/migrations/meta/_journal.json` without modifying existing migration order, tags, or timestamps.
   - Prove zero schema drift between:
     1. Authoritative TypeScript Drizzle schema (`src/server/db/schema/index.ts`).
     2. Drizzle Kit snapshots (`meta/*_snapshot.json`).
     3. Applied PostgreSQL database schema.
   - Prove that a fresh, empty PostgreSQL database reaches the exact authoritative schema deterministically when running migrations (`runMigrations()`).
   - Prove that `drizzle-kit check` and `drizzle-kit generate` execute with zero errors, zero warnings, and detect zero unwanted diffs ("No schema changes, nothing to migrate 😴").

## Environmental & Infrastructure Boundaries

In accordance with Phase 21 execution guidelines:
- **Local / CI Execution Environment:** Node.js 26.7.0 LTS with OpenSSL 3.6.4, curl 8.22.0 (with HTTP/2 and HTTP/3 support), local PostgreSQL 16.8 with pgvector.
- **Simulated vs. Physical Provider Boundary:**
  - Real TLS termination and HTTP/2 multiplexing are verified locally using a native Node.js TLS/HTTP2 reverse-proxy harness with generated TLS certificates and real `curl --http2` client requests.
  - External edge CDN behaviors (Cloudflare, AWS CloudFront, Vercel Edge) are verified against the authoritative HTTP response contracts (`Cache-Control`, `CDN-Cache-Control`, `Surrogate-Control`, `Vary`) and reverse-proxy header contracts (`X-Forwarded-*`).
  - Native public cloud infrastructure (e.g. AWS ALB, Cloudflare DNS, physical external multi-region CDN nodes) is not physically provisioned in this local environment; this boundary is explicitly documented and validated via reproducible local integration harnesses.

## Key Decisions

- **Snapshot Generation Architecture:** Generate verified Drizzle Kit schema snapshots for migrations `0012` through `0027` linking sequentially to `0011_snapshot.json`, validating with `drizzle-kit check` and proving zero drift against `src/server/db/schema/index.ts`.
- **Journal Non-Disruption:** Preserve existing `_journal.json` entries 0 through 27 without altering migration entries, checksums, or timestamps.
- **Production Headers & Middleware:** Implement Next.js security and cache-control headers in `next.config.ts` and add Next.js edge-compatible middleware (`src/middleware.ts`) to validate proxy headers, protect private CDN caching, and enforce HTTPS forwarding semantics.
- **Permissions-Policy Refinement:** Update `Permissions-Policy` to `camera=(), microphone=(self), geolocation=()`, allowing LifeOS voice dictation while blocking unauthorized third-party embeds.
- **Automated Verification Harness:** Place all Phase 21 tests in `scripts/tests/phase-21/plan-01/` and `scripts/tests/phase-21/plan-02/`, adhering strictly to the repository test organization convention.
