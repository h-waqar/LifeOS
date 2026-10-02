---
phase: 21
plan: 02
title: Production Deployment Hardening, TLS Termination, Reverse Proxy Forwarding, HTTP/2 & CDN Cache Control
status: complete
completed: 2026-10-02
requirements: [PROD-01]
files:
  - next.config.ts
  - src/middleware.ts
  - src/server/auth/index.ts
  - scripts/tests/phase-21/plan-02/production-infrastructure.test.ts
---

# Plan 21-02: Production Deployment Hardening, TLS Termination, Reverse Proxy Forwarding, HTTP/2 & CDN Cache Control — Summary

## Outcomes
1. **Next.js Production Header Configuration (`next.config.ts`)**:
   - Enforced production HSTS: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`.
   - Refined `Permissions-Policy`: `camera=(), microphone=(self), geolocation=()`, allowing Web Speech voice dictation while blocking untrusted origins.
   - Configured static asset immutable cache: `Cache-Control: public, max-age=31536000, immutable` for `/_next/static/:path*`.
   - Configured PWA asset caching for `/manifest.webmanifest`, `/icons/:path*`, and non-cacheable `/sw.js`.
   - Configured server actions `allowedOrigins` support via environment configuration.
2. **Reverse Proxy & Private CDN Guard Middleware (`src/middleware.ts`)**:
   - Added Next.js edge-compatible middleware validating `X-Forwarded-Proto`, `X-Forwarded-Host`, `X-Forwarded-For`.
   - Implemented strict rejection (400 Bad Request) for malformed host headers, CRLF injection attempts, and invalid protocol schemes.
   - Enforced production HTTPS 308 permanent redirect when requests arrive unencrypted (`x-forwarded-proto: http`).
   - Guarded all `/api/*` endpoints and dynamic stateful routes (`/dashboard`, `/tasks`, `/finance`, etc.) with `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`, `CDN-Cache-Control: no-store`, and `Surrogate-Control: no-store`, guaranteeing zero CDN cache leakage of personal user data.
3. **Cookie Security Alignment (`src/server/auth/index.ts`)**:
   - Enhanced Better Auth cookie configuration to enforce `Secure` attributes when running under production, trusted proxies, or forced secure cookies.
4. **Live Cryptographic TLS & HTTP/2 Reverse Proxy Test Harness**:
   - Implemented a local network harness utilizing Node.js `http2.createSecureServer` with ephemeral RSA-2048 certificates and RFC 7540/9113 hop-by-hop header filtering.
   - Verified real TLS handshake and HTTP/2 stream multiplexing with 5 concurrent requests over a single TLS connection.
   - Verified HTTP/1.1 backward compatibility over TLS.
   - Modeled RFC-compliant CDN caching proxy proving that sensitive API requests are never cached across users while static assets are properly cached.
5. **Environmental Boundary Explicitly Documented**:
   - Documented clear separation between verified local cryptographic TLS, HTTP/2 multiplexing, and reverse-proxy header contracts vs. physical external multi-region cloud edge networks (Cloudflare, AWS CloudFront, Fastly).
6. **Automated Test Suite**:
   - 6 tests passing in `scripts/tests/phase-21/plan-02/production-infrastructure.test.ts`.

## Verification Evidence
- `pnpm test scripts/tests/phase-21/plan-02/production-infrastructure.test.ts` ➔ 6/6 tests passed (100%)
- Live HTTP/2 multiplexing verified (`alpnProtocol === 'h2'`)
- Cache pollution protection verified (0% leakage on private routes, 100% hit rate on static bundles)
