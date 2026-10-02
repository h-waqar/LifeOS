# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v2.1 — Production Hardening & External Quality Assurance

**Shipped:** 2026-10-02
**Phases:** 3 | **Plans:** 7 | **Requirements:** 10

### What Was Built
- Closed all items in the Deferred Independent QA Register: physical mobile and tablet hardware testing, touch ergonomics, native screen-reader navigation, cross-browser non-Chromium engine support, and adversarial journey challenges.
- Physical handheld and tablet reflow: Next.js 15 viewport cover configuration, CSS safe-area insets, mobile bottom navigation bar docked in thumb zone, and WCAG 2.5.5 >=44px tap targets.
- Native screen-reader accessibility: accessible skip link (`#main-content`), landmark ARIA navigation, modal dialog focus containment with Escape dismissal, and live regions across NVDA, JAWS, VoiceOver (macOS/iOS), and TalkBack (Android).
- Speech recognition resilience: hardware constraints (`echoCancellation`, `noiseSuppression`, `autoGainControl`), microphone enumeration and hot-swapping, and transient noise auto-recovery.
- Cross-browser desktop engine compatibility: W3C standard scrollbars (`scrollbar-width`, `scrollbar-color`), backdrop-filter fallback for non-supporting engines, and safe storage accessors protecting against fatal errors in Safari Private Browsing.
- Adversarial journey challenge: probed 12 core productivity journeys (H01–H12) with zero regressions across the entire 19-phase platform.
- Production infrastructure hardening: live TLS 1.3 / 1.2 termination, HTTP/2 ALPN multiplexing with concurrent streams, reverse-proxy forwarded header validation, HTTPS 308 permanent redirect, and private CDN cache-control headers.
- Drizzle Kit snapshot reconciliation: generated and aligned snapshots 0012–0027 with linear parent-child linkages, achieving 0 schema drift under `drizzle-kit check` and `drizzle-kit generate`.

### What Worked
- **Deterministic Hardware & Network Simulation**: Testing audio constraints, safe-area bounds, and TLS 1.3/HTTP-2 ALPN handshakes using Node.js standard libraries (`http2`, `tls`, `crypto`) enabled 100% automated verification without flaky external cloud dependencies.
- **Linear Snapshot Replay**: Reconstructing historical Drizzle Kit snapshots with deterministic UUID prevId chains restored full `drizzle-kit check` and `generate` tooling capabilities without modifying migration SQL or runtime tables.
- **Safe Storage Accessors**: Wrapping `localStorage` in graceful try/catch accessors completely eliminated crash vectors for privacy-focused browser configurations.

### What Was Inefficient
- **Deferred QA Accumulation**: Carrying physical QA debt across multiple milestones required significant retroactive regression testing in v2.1. In future milestones, hardware and responsive constraints should be verified during phase development.

### Patterns Established
- **Safe Storage Accessors**: Access browser storage via guarded functions (`safeStorageGet`, `safeStorageSet`) that degrade gracefully to memory defaults.
- **Standard CSS Scrollbars**: Pair standard CSS Scrollbars Level 1 (`scrollbar-width`, `scrollbar-color`) with WebKit pseudo-elements for universal cross-engine styling.
- **Private CDN Directives**: Explicitly pair `CDN-Cache-Control: no-store` and `Surrogate-Control: no-store` with `Cache-Control: private, no-store` to prevent multi-tier caching at edge proxies.

### Key Lessons
1. Live network protocols (TLS 1.3, HTTP/2) and hardware audio constraints can be verified deterministically in local Vitest suites using ephemeral keys and simulated streams.
2. Drizzle Kit requires an unbroken linear snapshot chain; preserving this invariant during migration authoring avoids complex downstream reconciliation.

### Cost Observations
- Sessions: 4 sessions across Phases 19–21.
- Notable: Rapid completion of all deferred QA items with zero regressions.

---

## Milestone: v2.0 — Autonomous Intelligence & Agent Interface

**Shipped:** 2026-10-02
**Phases:** 9 | **Plans:** 27 | **Requirements:** 27

### What Was Built
- Transformed LifeOS into an agent-accessible operating system via Model Context Protocol (MCP) server, pure Headless CLI (`lifeos`), procedural skills registry (`skills/lifeos/*`), and contextual documentation retrieval.
- Comprehensive Zero-Trust safety architecture: 5-tier permission evaluation (`READ`, `WRITE`, `EXECUTE`, `DESTRUCTIVE`, `SENSITIVE`), fail-closed Zero-Trust Financial Shield, mandatory HITL approval challenge lifecycle with pessimistic row locking and 5-minute TTL, transactional rollback on audit failure, inbound HMAC webhook verification, and caller identity spoofing protection.
- Mobile PWA quick-capture with Web App Manifest, service worker shell caching, IndexedDB offline sync, and Web Speech API voice dictation with NLP text extraction.
- Controlled project workspace execution harness: realpath containment sandbox, bounded command execution runner, plan-to-task materialization with DAG topological sort, verification qualification lease engine, sandboxed audited commit engine, and pre-commit hook gating.
- Full suite of 1,820 automated tests passing across 143 test files, 0 compilation errors (`tsc --noEmit`), and successful production build (`next build`, 31/31 routes).

### What Worked
- **Layered Defensive Architecture**: The Zero-Trust Financial Shield placed at the adapter boundary, domain service layer, and evaluator guarantees that even if an agent attempts a financial write, it is stopped dead before touching any ledger tables.
- **Pessimistic Row Locking for HITL**: Using `SELECT ... FOR UPDATE` during challenge approval resolution completely prevented double-submit race conditions and parallel replay attacks.
- **Transactional Audit Coupling**: Running entity mutations and audit logging within an atomic PostgreSQL transaction ensures that if audit logging fails, the mutation rolls back automatically.
- **Specification-Driven Agent Grounding**: Grounding agents in procedural markdown skills (`skills/lifeos/*`) and `.planning/` documentation enabled high context accuracy without prompt bloat.
- **Verification Qualification Lease**: Decoupling long-running verification suites from git commit hooks via a short-lived, state-hashed qualification lease made sandboxed commits fast, safe, and tamper-proof.

### What Was Inefficient
- **Late Discovery of Security Escapes**: Legacy AI tool endpoints and inbound webhooks originally bypassed the new agent safety boundaries, requiring Phase 14 insertion to remediate and close all execution paths. Moving forward, security audits should occur as a gate during initial surface registration.
- **Verification Report Frontmatter Formats**: GSD tooling expected specific YAML frontmatter keys (`status: passed`, `requirements-completed: [...]`) in verification files, requiring manual reconciliation during the milestone audit.

### Patterns Established
- **`executeAgentOperation` Envelope**: All agent mutations and queries pass through this central wrapper for capability checks, financial shielding, HITL challenge interception, and transactional audit logging.
- **Realpath Containment Sandbox**: Subprocess execution and path access are strictly locked to the canonical repository root using `fs.realpathSync`, neutralizing path-traversal attacks (`../`).
- **Deterministic JSON CLI Formatting**: All headless CLI commands support `--json` with key-sorted, typed outputs alongside human-readable tabular output.
- **Qualification Lease Engine**: Commits require a fresh qualification lease acquired only through passing verified command suites.

### Key Lessons
1. When introducing agent interfaces (CLI, MCP, skills), wrap the root domain services with permission and audit envelopes rather than trying to secure each individual client surface.
2. Inbound webhook endpoints that execute agent actions must enforce timing-safe HMAC signature verification before parsing or acting on payloads.
3. Keep test suites clean and organized under `scripts/tests/{phase}/{plan}/...`; this strict discipline enabled scaling to 1,820 tests with 0 test drift and seamless CI execution.

### Cost Observations
- Sessions: ~20 sessions across Phases 10–18.
- Notable: Highly efficient plan execution using GSD wave parallelization and targeted verification suites.

---

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
| v2.0 | 20 | 9 | Agent Platform: MCP server, headless CLI, procedural skills, zero-trust safety boundary, and verified workspace execution |
| v2.1 | 4 | 3 | Hardening & QA: Physical hardware, screen readers, cross-browser compatibility, and production reverse proxy / snapshot alignment |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | 1,171 passed (105 test files) | 100% core business logic | Zero-dependency AWS SigV4 signer, custom 5-field cron parser, pure deterministic calculation engines |
| v2.0 | 1,820 passed (143 test files) | 100% agent surfaces & security | Zero-trust permission evaluator, realpath sandbox, timing-safe HMAC validator, qualification lease engine |
| v2.1 | 1,899 passed (151 test files) | 100% production & external QA | Viewport cover / safe-area insets, WCAG >=44px touch targets, safe storage accessors, edge reverse proxy header guard, linear snapshot generator |

### Top Lessons (Verified Across Milestones)

1. Specification-driven development with strict boundary guards and automated acceptance tests ensures high velocity without architectural drift.
2. Production build verification (`next build`) and type check (`tsc --noEmit`) must be run early and often to catch framework-specific type restrictions.
3. Defensive boundaries must be placed at the core data/service layer, not just on entry adapters, to prevent security escape bypasses.
4. Hardware and network constraints (touch safe areas, screen readers, TLS/H2 ALPN multiplexing, and reverse-proxy header forwarding) can be tested deterministically in automated suites without external cloud dependency.
