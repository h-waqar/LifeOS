# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — Full Personal Operating System

**Shipped:** 2026-09-30
**Phases:** 9 | **Plans:** 41 | **Sessions:** 15

### What Was Built
- Full personal operating system connecting productivity, knowledge, finance, content, AI assistance, automations, external integrations, and predictive analytics.
- 9 capability phases, 41 plans, and 82 requirements satisfied with 1,171 automated tests passing and zero TypeScript errors.
- Robust Next.js 15 App Router architecture with strict server/client boundary, Better Auth authentication, server-side resource ownership validation, and AES-256-GCM encrypted secrets.

### What Worked
- **Strict Separation of Concerns**: Isolating authentication from resource ownership authorization (`withUserScope` and explicit `user_id` validation) prevented any multi-tenant leakage.
- **Vertical-Slice Database Evolution**: Introducing schemas phase-by-phase prevented premature schema bloat and ensured domain logic always accompanied table definitions.
- **Clean Repository Convention**: Centralizing all test files under `scripts/tests/{phase}/{plan}/` kept `src/` 100% focused on production code and simplified Next.js compilation.
- **Zero-Trust AI with HITL**: Human-in-the-loop action interception with row locks (`SELECT ... FOR UPDATE`) and 5-minute TTL prevented unintended state mutation while enabling rich AI assistance.
- **Deterministic Math Engines**: Keeping finance, analytics, and risk scoring as pure TypeScript calculation functions isolated from UI and API routes enabled 100% automated test coverage.

### What Was Inefficient
- **Handwritten SQL Migrations Drift**: Hand-authoring migrations 0012–0026 without running `drizzle-kit generate` created a snapshot gap in Drizzle Kit metadata, requiring documented technical debt for future schema-generation workflows.
- **Route Handler Helper Exports**: Exporting testing helpers directly from Next.js route handlers triggered Next.js 15 App Router type check errors during `next build`, resolved by moving helpers to dedicated server modules.

### Patterns Established
- **Centralized Test Location**: All tests strictly located in `scripts/tests/{phase}/{plan}/...`, never in `src/`.
- **Pure Domain Calculations**: Isolate calculation algorithms into pure TypeScript functions (`calculations.ts`) accompanied by comprehensive test suites.
- **Runtime Server Context Guard**: Domain services enforce `if (typeof window !== "undefined" && !process.env.VITEST) throw new Error(...)`.
- **Security Cache Headers**: API routes return `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`.

### Key Lessons
1. Next.js 15 Route Handlers strictly enforce export types: never export test helpers or internal functions from `route.ts` files; place them in `src/server/...` modules.
2. Dynamic search params in Next.js client components must be wrapped in React `<Suspense>` boundaries to allow clean static page prerendering during production builds.
3. Establish a baseline Drizzle Kit introspection strategy before relying on automatic migration diff generation when schema migrations are handwritten.

### Cost Observations
- Notable: High efficiency through specification-driven planning and automated test suites.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | 15 | 9 | Initial release: Full 9-phase personal operating system with vertical-slice architecture |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | 1,171 passed (105 test files) | 100% core business logic | Zero-dependency AWS SigV4 signer, custom 5-field cron parser, pure deterministic calculation engines |

### Top Lessons (Verified Across Milestones)

1. Specification-driven development with strict boundary guards and automated acceptance tests ensures high velocity without architectural drift.
2. Production build verification (`next build`) and type check (`tsc --noEmit`) must be run early and often to catch framework-specific type restrictions.
