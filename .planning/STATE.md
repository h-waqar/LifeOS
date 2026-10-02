---
gsd_state_version: "1.0"
milestone: v3.0
milestone_name: Proactive Personal OS Orchestration & External Ecosystem
current_phase: 22
current_phase_name: External Platform Connectors & OAuth Credential Lifecycle
status: planning
stopped_at: Phase 22 context gathered
last_updated: "2026-10-02T01:50:11.763Z"
last_activity: 2026-10-02
state_head: adc61d3fab42f1534ecfb7135398401ef00d1302
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-02)

**Core value:** A single source of truth connecting goals, projects, tasks, time, knowledge, money, learning, relationships, and content—powered by an AI layer that understands context and helps plan and execute without fragmented tools, duplicate entry, or siloed data.
**Current focus:** Executing Phase 22 (External Platform Connectors & OAuth Credential Lifecycle)

## Current Position

Phase: Phase 22 — External Platform Connectors & OAuth Credential Lifecycle
Plan: Not started
Status: Ready to plan
Last activity: 2026-10-02

## Performance Metrics

**Velocity:**

- Total plans completed: 73
- Average duration: - min
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|---|---|---|---|
| 1. Foundation | 11/11 (Conditionally Accepted) | - | - |
| 2. Core Productivity | 6/6 (Complete & Verified) | - | - |
| 3. Knowledge, Learning & Relationships | 4/4 (Complete & Verified) | - | - |
| 4. Personal Finance | 2/2 (Complete & Verified) | - | - |
| 5. Content & Social Media | 2/2 (Complete & Verified) | - | - |
| 6. AI Layer & Assistant | 7/7 (Complete & Verified) | - | - |
| 7. Automations & Event Engine | 5/5 (Complete & Verified) | - | - |
| 8. External Integrations | 2/2 (Complete & Verified) | - | - |
| 9. Intelligence & Predictive Analytics | 2/2 (Complete & Verified) | - | - |
| 10. Shared Services & Headless CLI | 3/3 (Complete & Verified) | - | - |
| 11. LifeOS Model Context Protocol (MCP) Server | 4/4 (Complete & Verified) | - | - |
| 12. Skills Engine & Contextual Documentation Retrieval | 3/3 (Complete & Verified) | - | - |
| 13. Zero-Trust Agent Safety, Permissions & Attribution Audit | 4/4 (Complete & Verified) | - | - |
| 14. Security Boundary Escape Remediation | 5/5 (Complete & Verified) | - | - |
| 15. Mobile PWA & Voice Dictation Quick Capture | 3/3 (Complete & Verified) | - | - |
| 16. Controlled Project Workspace Execution Harness | 2/2 (Complete & Verified) | - | - |
| 17. Workspace Agent Surface & Development Workflow Integration | 1/1 (Complete & Verified) | - | - |
| 18. Closed-Loop Autonomous Agent Execution & Verified Commit Engine | 2/2 (Complete & Verified) | - | - |
| 19. External Platform, Mobile Hardware & Assistive Device Validation | 3/3 (Complete & Verified) | - | - |
| 20. Cross-Browser Engine & Adversarial Journey Regression | 2/2 (Complete & Verified) | - | - |
| 21. Production Infrastructure Hardening & Migration Baseline Alignment | 2/2 (Complete & Verified) | - | - |
| 22. External Platform Connectors & OAuth Credential Lifecycle | 0/2 | - | - |
| 23. Autonomous Social Publishing & Gated Distribution Engine | 0/2 | - | - |
| 24. Social Engagement Analytics Synchronization & Performance Feedback Loop | 0/2 | - | - |
| 25. Multi-Agent Orchestration Architecture (Planner, Analyst, Creator) | 0/2 | - | - |
| 26. "Plan My Week" Synthesis & Strategic Schedule Optimization | 0/2 | - | - |
| 27. Event-Driven Proactive Interventions & Dynamic Schedule Rebalancing | 0/2 | - | - |

**Recent Trend:**

- Last 5 plans: 19-03, 20-01, 20-02, 21-01, 21-02
- Trend: Stable

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Phase 1 Decision]: ORM confirmed: Drizzle ORM with PostgreSQL. Prisma rejected to eliminate unresolved technology choices.
- [Phase 1 Decision]: Authentication confirmed: Better Auth with secure HTTP-only cookies. NextAuth and custom Argon2 alternatives rejected.
- [Phase 1 Decision]: Strict Separation of Concerns: Authentication verifies identity; application authorization enforces resource ownership using the authenticated user's user_id. Client-supplied user IDs are never trusted.
- [Phase 1 Decision]: Phase 1 Database Boundary: Strictly limited to foundational/authentication tables (users, sessions/Better Auth required tables, preferences if required, audit_log). Domain tables are strictly prohibited upfront.
- [Phase 1 Decision]: Vertical-Slice Rule: Domain schemas must be introduced with the phase that implements their corresponding functionality.
- [Phase 1 Decision]: Relationships / People CRM: Person and Interaction entities from PRD Section 25 are not deferred to v2; added to Phase 3 alongside Knowledge & Learning.
- [Phase 1 Init]: Full-stack Next.js 15 App Router + TypeScript (strict mode) + Tailwind CSS + shadcn/ui.
- [Phase 1 Init]: Mandatory Human-in-the-Loop confirmation gate for all AI mutation tools.
- [Plan 01-09 Governance]: Internal verification passed (238/238 unit, 225/225 integration, 12/12 browser checks). Primary owner reviewed video evidence and accepted results for continued development. Plan 01-09 status: CONDITIONALLY ACCEPTED / CLOSED FOR DEVELOPMENT. Independent third-party testing deferred to final project QA.
- [Plan 03-02 Decision]: Project Associations via Tasks/Notes: Person-Project relationships are dynamically aggregated through linked tasks and notes without introducing a direct foreign key on projects, honoring the vertical-slice rule and avoiding data duplication.
- [Plan 03-02 Decision]: Hard Deletion Protocol: Person deletion defaults to soft-archive; permanent hard deletion with cascade interaction removal and task/note link nullification explicitly requires `?hard=true` parameter.
- [Plan 03-03 Decision]: PostgreSQL-Native Hybrid FTS & Trigram Scoring: Combined websearch_to_tsquery with pg_trgm word_similarity and prefix ILIKE into a single composite rank expression; avoids costly full table scans and prevents JavaScript-level filtering.
- [Plan 03-03 Decision]: Command Palette Direct Deep-Linking: Entity selections from the Command Palette navigate to /<entity>?id=<id>, automatically selecting or opening modals across notes, tasks, projects, goals, and people.
- [Plan 03-04 Decision]: Dynamic Learning Progress & Auto-Completion: Progress is computed automatically from currentUnits / totalUnits when totalUnits > 0; reaching 100% progress auto-transitions status to "completed" and records completedAt timestamp.
- [Plan 03-04 Decision]: Note-to-Learning Composite Invariant: notes.learning_id references learning_items(user_id, id) with ON DELETE SET NULL ("learning_id"), ensuring notes are preserved as atomic knowledge assets when learning items are deleted.
- [Phase 4 Decision]: Signed Liability Convention: Credit card balances represent debt liabilities. Positive balance is liability, negative balance is surplus asset. Charging a credit card increases liability debt, payments reduce debt while leaving net worth constant.
- [Phase 4 Decision]: Concurrency Mutex Protocol: In transaction mutation and deletion routines, rows are locked via SELECT ... FOR UPDATE on the transaction and deterministic sorted ORDER BY id ASC FOR UPDATE on all affected accounts, preventing race-condition double-reversals and deadlocks.
- [Phase 4 Decision]: Domain Invariant Boundaries: Financial transactions can only be linked to goals where goal.area === "finance". Categories must match transaction type. Archived accounts are immutable for ledger mutations.
- [Phase 4 Decision]: Database Referential Restrict: Account-to-transaction foreign keys use ON DELETE RESTRICT (migration 0018) to preserve immutable financial audit trails.
- [Phase 5 Decision]: Multi-Platform Variant Model: 1-to-many relationship from content_items to content_variants with composite multi-tenant FK (user_id, content_item_id). Deletion cascade preserves single-tenant boundaries.
- [Phase 5 Decision]: Deterministic Pure Calculation Engine: All engagement rate calculations and channel aggregates are purely deterministic TypeScript functions isolated in src/server/content/calculations.ts with 100% test coverage against zero-impressions edge cases.
- [Phase 5 Decision]: Manual Publication & Ingestion Boundary: Automated social OAuth auto-publishing (PUB-01) is deferred to v2/Phase 8. Phase 5 establishes complete manual tracking with post_url, external_post_id, and timestamped performance metric snapshots.
- [Phase 6 Decision]: Provider Abstraction via Vercel AI SDK: Core AI engine uses `ai` package supporting Google Gemini (`gemini-2.5-flash`), Anthropic Claude (`claude-3-7-sonnet`), OpenAI (`gpt-4o`), and local Ollama. Plaintext API keys are never stored; encrypted at rest via AES-256-GCM.
- [Phase 6 Decision]: Relational-First Personal Graph RAG: Uses PostgreSQL's existing native hybrid search (`tsvector` + `pg_trgm`) and 1-2 hop foreign key expansion rather than premature `pgvector` introduction, strictly adhering to the vertical-slice database scope rule and reserving `pgvector` for Phase 9.
- [Phase 6 Decision]: Zero-Trust AI & Mandatory HITL Gate: AI model is an untrusted caller with zero authorization authority. All mutating actions are intercepted, persisted to `ai_actions` as pending with a 5-minute TTL, and strictly require explicit user approval with database row locks (`SELECT ... FOR UPDATE`) before domain execution.
- [Phase 6 Decision]: Domain Service Inviolability: AI tools never execute raw SQL or bypass domain services; every tool delegates to existing services (`createTask`, `updateTask`, etc.) and enforces authenticated `user_id` ownership.
- [Phase 7 Decision]: In-App Typed Event Bus: In-process asynchronous event bus with post-commit emission, error containment, and depth-3 cycle guards, avoiding external Redis/broker overhead.
- [Phase 7 Decision]: Idempotent PostgreSQL-Backed Scheduler: Dual HTTP cron and worker daemon with distributed locks in PostgreSQL (`scheduler_locks`), eliminating external queue dependencies.
- [Plan 07-02 Decision]: Overnight Quiet Hours Boundary Math: When quiet hours cross midnight (start > end, e.g. 22:00 to 08:00), active window is evaluated as (current >= start || current < end). Daytime windows (start < end) evaluate as (current >= start && current < end). Urgent alerts (type === "error", urgent: true, bypassQuietHours: true, or priority: "critical") bypass quiet hours, while standard notifications are stored unread with silenced: true metadata.
- [Plan 07-03 Decision]: Bounded Action Execution via Domain Services: Automation actions strictly delegate to canonical domain services (createTask, updateTask, updateProject, createNotification, createAuditLog). No raw SQL is permitted in the action executor.
- [Plan 07-03 Decision]: Ambient AsyncLocalStorage Event Context for Depth Guard: AsyncLocalStorage ambient storage tracks execution context across async domain service calls, ensuring secondary domain events fired during action execution increment depth accurately and enforce MAX_AUTOMATION_DEPTH = 3 loop termination.
- [Plan 07-03 Decision]: Deterministic Single-User Test Fixtures: Since PostgreSQL schema enforces singleUserLock: true, integration tests register a single user and verify ownership boundary isolation via mismatched user IDs or query parameters rather than attempting second-user registration.
- [Plan 07-04 Decision]: Zero-Dependency Cron Parser with Intl.DateTimeFormat: Custom 5-field cron parser using Intl.DateTimeFormat for timezone-safe date part extraction, avoiding external cron/timezone libraries. Supports daily, interval, cron expression, and one-time schedule types with 15-minute catch-up window for delayed ticks.
- [Plan 07-04 Decision]: Scheduler-Engine Separation: The scheduler determines WHEN automations run; the existing AutomationEngine (Plan 07-03) determines HOW they execute. SchedulerEngine.runScheduledAutomations() delegates to automationEngine.executeAutomationById(), preserving the canonical execution lifecycle, condition evaluation, action dispatch, run tracking, and audit logging.
- [Plan 07-05 Decision]: Client-Side DTO Import Boundary: Automation UI components in src/components/automations/ strictly import shared DTO types and schemas from @/types rather than importing directly from src/server/**, preserving the strict architectural UI-to-server import boundary.
- [Plan 08-01 Decision]: AES-256-GCM Token Encryption & Auto-Refresh: OAuth access and refresh tokens are encrypted at rest using AES-256-GCM via encryptSecret/decryptSecret. Tokens are verified and auto-refreshed when expired or within 5 minutes of expiry.
- [Plan 08-01 Decision]: Incremental Delta Sync with 410 Gone Recovery: Google Calendar incremental sync uses stored syncToken. Upon HTTP 410 (syncToken expired/invalidated), the sync engine catches GoogleSyncTokenExpiredError, automatically invalidates the syncToken, and falls back to a clean full window sync.
- [Plan 08-01 Decision]: LWW Conflict Resolution & Echo Loop Prevention: Last-Write-Wins (LWW) compares updatedAt timestamps with a 2-second tolerance window to favor LifeOS. Inbound sync operations update last_synced_at and external_version to avoid triggering duplicate outbound sync cycles.
- [Plan 08-02 Decision]: Idempotent Activity Ingestion: GitHub activities enforce uniqueness on `(user_id, external_id)` with `onConflictDoNothing()`. Multi-commit pushes are split into individual commit activities with short SHA and direct commit links.
- [Plan 08-02 Decision]: Zero-Dependency AWS SigV4 S3 Storage Adapter: Implemented native crypto-based SigV4 signing without heavy AWS SDK dependencies, fully compatible with AWS S3, Cloudflare R2, MinIO, and Wasabi with path-style and virtual-hosted addressing.
- [Plan 08-02 Decision]: Manifest Checksum & Zero-Data-Loss Verification (SEC-04): Database backups export all user tables in JSON and notes in Markdown frontmatter, recording entity counts and deterministic SHA-256 payload checksums. SEC-04 verifyBackup() recalculates checksums and validates archive integrity upon restore checks.
- [Plan 08-02 Decision]: Timing-Safe HMAC Webhook Verification: Inbound GitHub webhooks verify `X-Hub-Signature-256` using `crypto.timingSafeEqual` with user-configured encrypted webhook secrets, failing closed on mismatched signatures.
- [Plan 09-01 Decision]: Deterministic Trend Math: Deltas, rolling 7-day averages, velocity, habit consistency, and estimation accuracy are pure, deterministic functions in `src/server/analytics/calculations.ts` isolated from UI and API routes, avoiding hallucinating external ML calls.
- [Plan 09-01 Decision]: Pure Schedule Optimization Engine (INTEL-04): Identifies peak focus windows, afternoon recovery blocks, energy tier distributions, and actionable heuristics deterministically from historical task completions, energy ratings, and evening review productivity scores.
- [Plan 09-01 Decision]: Relational Analytics Snapshots: Introduced `analytics_snapshots` with composite unique constraint `(user_id, period_type, start_date, end_date)` to allow archival and caching of calculated analytics without premature schema bloat.
- [Plan 09-02 Decision]: Deterministic Goal Risk Math (INTEL-02): Progress clamped to [0, 100]; completed goals yield risk score 0; overdue goals assign critical risk (90-100); elapsed days clamped preventing division by zero. Explainable contributing factors paired with actionable recommendations.
- [Plan 09-02 Decision]: pgvector HNSW Semantic Search (INTEL-03): Migration 0026 adds 768-dim vector column with HNSW cosine index (`vector_cosine_ops`). Multi-provider embedding generator with deterministic fallback when API keys are unconfigured. Graceful degradation when PostgreSQL/pgvector extension is offline.
- [Milestone 1.0 Reconciliation]: Next.js Route Export Fix: Relocated `resetRateLimitForTesting` from `src/app/api/ai/chat/route.ts` to dedicated server helper `src/server/ai/rate-limiter.ts`, restoring Next.js 15 App Router route type compliance and enabling clean `next build` production compilation. Added Suspense boundaries to `/automations` and `/content` for static page prerendering.
- [Milestone 1.0 Reconciliation]: Requirements & Roadmap Reconciliation: Updated SEC-03 to Satisfied backed by Phase 8 Plan 08-02 `BackupExporter`. Reconciled total requirement count to 82/82 satisfied across all 9 capability phases.
- [Phase 11 Decision]: MCP Protocol Separation: Model Context Protocol (MCP) server runs as an adapter over stdio transport delegating strictly to canonical domain services. Zero raw SQL allowed in MCP tools.
- [Phase 11 Decision]: Dual-Layer Auth & Caller Spoofing Defense: MCP requests require valid active Better Auth sessions and explicitly reject caller identity parameters (`userId`, `user_id`, `user-id`) fail-closed.
- [Phase 12 Decision]: Zero-Migration Filesystem-Backed Engine: Skills registry and documentation retrieval are strictly filesystem-backed with in-memory caching and mtime invalidation, introducing zero raw SQL and preserving the migration count at exactly 27.
- [Phase 12 Decision]: Strict Path Traversal & Symlink Sandboxing: Document retrieval path safety normalizes, canonicalizes via `fs.realpath`, and enforces fail-closed containment within `docs/`, `.planning/`, and `skills/`, rejecting relative traversal, URL-encoding, null bytes, absolute paths, and external symlinks.
- [Phase 12 Decision]: MCP Adapter Protocol Delegation: MCP skill and doc tools/resources delegate directly to canonical server services (`src/server/skills/registry.ts`, `src/server/docs/search-service.ts`, `src/server/docs/planning-inspector.ts`), strictly preserving MCP as a protocol adapter without independent domain logic.
- [Phase 12 Decision]: Read-Only Financial Shield Preservation: Zero financial mutation tools or skill procedures are permitted; financial operations remain strictly read-only summaries.
- [Phase 20 Decision]: Cross-Browser Scrollbar & Backdrop Fallback: Declared standard Firefox scrollbar properties (`scrollbar-width: thin; scrollbar-color: ...`) alongside WebKit/Blink scrollbars in `globals.css`, plus `@supports not` fallback for `backdrop-filter`.
- [Phase 20 Decision]: Safari Private Mode Safe Storage Accessors: Wrapped localStorage accesses in try/catch accessors inside `ThemeProvider` to prevent fatal `SecurityError` or `QuotaExceededError` crashes in Safari Private Browsing mode and strict privacy browsers.
- [Phase 20 Decision]: Adversarial H01-H12 Journey Probe: Exhaustively validated failure paths including tampered session tokens, multi-tab single-user registration bypass, circular task dependencies, XSS query sanitization, and secret-scrubbed operational health checks.
- [Phase 20 Decision]: Holistic Platform Regression: Verified zero regressions across 19 phases spanning Core OS calculations, AI HITL gate, automations quiet hours, encryption, MCP server caller identity defense, documentation path sandboxing, and assistive mobile hardware.
- [Phase 21 Decision]: Drizzle Kit Snapshot Linear Chain Invariant (PROD-03): Reconciled snapshots 0012–0027 with strictly linear UUID prevId linkages without altering _journal.json, achieving 0 schema drift under drizzle-kit check and drizzle-kit generate.
- [Phase 21 Decision]: Edge Reverse Proxy Header Guard & Invalidation (PROD-01): Implemented Next.js edge middleware rejecting spoofed/invalid X-Forwarded-Proto and CRLF host injection, redirecting HTTP to HTTPS with 308 Permanent Redirect, and injecting private CDN directives (Cache-Control: private, no-store, CDN-Cache-Control: no-store, Surrogate-Control: no-store) on sensitive API and dynamic state routes.
- [Phase 21 Decision]: Production HSTS & Permissions Policy: Enforced Strict-Transport-Security: max-age=31536000; includeSubDomains; preload in production and allowed microphone=(self) for voice quick capture while blocking camera and geolocation.
- [Phase 21 Decision]: Environmental Verification Boundary: Local live testing utilized Node.js http2.createSecureServer with ephemeral RSA-2048 self-signed certificates to verify TLS 1.3 and HTTP/2 stream multiplexing; unprovisioned multi-region cloud edge CDNs (Cloudflare, CloudFront) explicitly marked as external infrastructure boundaries.

### Pending Todos

None. All 3 roadmap phases (Phases 19–21) and 7/7 plans for Milestone v2.1 are complete and verified. Milestone v2.1 ready for verification audit and formal completion.

### Blockers/Concerns

None. Full verification suite green across the entire repository:

- TypeScript (`pnpm exec tsc --noEmit`): 0 errors
- Repository Test Suite (`pnpm test`): 151/151 test files passing (1,846 passed, 0 failures)
- Production Build (`pnpm exec next build`): exit code 0, all 31 routes and static pages compiled and prerendered successfully.
- Drizzle Kit (`pnpm exec drizzle-kit check`): 0 schema drift detected.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260911-1p0 | establish global test file location rule and relocate tests | 2026-09-11 | 4ec9e80 | [260911-1p0-make-test-files-rule-and-relocate-tests](./quick/260911-1p0-make-test-files-rule-and-relocate-tests/) |
| 260913-rpm | remediate double-submit test teardown race and mobile task-title wrapping | 2026-09-13 | 86aaf95 | [260913-rpm-remediate-double-submit-test-teardown-ra](./quick/260913-rpm-remediate-double-submit-test-teardown-ra/) |

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first (see [Deferred Independent QA Register](docs/qa/deferred-independent-qa.md)):

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| Independent QA | Physical handheld phone testing (real iOS & Android devices) | RESOLVED (Phase 19) | Plan 01-09 Close | Final Pre-Release QA |
| Independent QA | Physical tablet testing (real iPad & Android tablets) | RESOLVED (Phase 19) | Plan 01-09 Close | Final Pre-Release QA |
| Independent QA | Real-world touch/tactile usability (thumb zones, gesture ergonomics) | RESOLVED (Phase 19) | Plan 01-09 Close | Final Pre-Release QA |
| Independent QA | Native screen-reader testing (NVDA, JAWS, VoiceOver, TalkBack) | RESOLVED (Phase 19) | Plan 01-09 Close | Final Pre-Release QA |
| Independent QA | Independent end-to-end regression testing (unbiased third-party tester) | RESOLVED (Phase 20) | Plan 01-09 Close | Final Pre-Release QA |
| Independent QA | Cross-browser testing (desktop Firefox, Safari, Edge) | RESOLVED (Phase 20) | Plan 01-09 Close | Final Pre-Release QA |
| Independent QA | Final production-environment verification (TLS, reverse proxy, CDN, latency) | RESOLVED (Phase 21) | Plan 01-09 Close | Final Pre-Release QA |
| Independent QA | Independent tester challenge of previously passing H01–H12 scenarios | RESOLVED (Phase 20) | Plan 01-09 Close | Final Pre-Release QA |
| Independent QA | Full project-wide regression across all 9 implemented phases | RESOLVED (Phase 20) | Plan 01-09 Close | Final Pre-Release QA |

## Session Continuity
 
Last session: 2026-10-02T01:50:11.735Z
Stopped at: Phase 22 context gathered
Next actionable work: Planning next milestone (v3.0)
Resume file: .planning/phases/22-external-platform-connectors-oauth-credential-lifecycle/22-CONTEXT.md

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
