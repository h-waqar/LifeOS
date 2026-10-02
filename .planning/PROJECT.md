# LifeOS

## What This Is

LifeOS is a greenfield personal operating system designed to help one person (Hamza) manage, understand, and improve their entire life from a single, unified system. It unifies tasks, projects, goals, daily planning, calendar, habits, notes, knowledge, finances, learning, relationships, and content creation into an interconnected personal information graph, execution engine, and contextual AI assistant.

## Core Value

A single source of truth connecting goals, projects, tasks, time, knowledge, money, learning, relationships, and content—powered by an AI layer that understands context and helps plan and execute without fragmented tools, duplicate entry, or siloed data.

## Business Context

- **Primary User**: Hamza (single-tenant owner model with forward-compatible schema)
- **Deployment Model**: Self-hosted web application (Docker / VPS / local-first where practical)
- **Success Metric / Ultimate Test**: If the user stopped using every other productivity application tomorrow, LifeOS can still tell them what matters right now, what they need to do, why it matters, how they are progressing, and what they should do next.
- **Strategy Notes**: Master product requirements defined in prd.md (v1.0 master specification).

## Current State

- **Shipped v1.0**: Full Personal Operating System (Phases 1–9, 41 plans, 82 requirements, 1,171 tests).
- **Shipped v2.0**: Autonomous Intelligence & Agent Interface (Phases 10–18, 27 plans, 27 requirements, 1,820 tests, zero-trust safety boundary, stdio MCP server, headless CLI, procedural skills, sandboxed workspace execution harness, and verified commit engine).
- **Shipped v2.1**: Production Hardening & External Quality Assurance (Phases 19–21, 7 plans, 10 requirements, 1,899 tests, physical handheld/tablet touch verification, native screen readers, cross-browser compatibility, production reverse proxy TLS/H2 hardening, and Drizzle Kit snapshot alignment).
- **Next Milestone**: v3.0 — Proactive Personal OS Orchestration & External Ecosystem.

## Next Milestone Goals (v3.0)

**Goal:** Transform LifeOS from a reactive execution assistant into a proactive life orchestrator with multi-agent coordination, autonomous calendar rebalancing, and direct external social ecosystem sync.

## Requirements

### Validated

- ✓ **Phase 1 (Foundation)**: TypeScript project architecture, Next.js / modular structure, PostgreSQL database with Drizzle ORM (foundational/auth tables only: users, sessions / Better Auth tables, preferences, audit_log), Better Auth authentication & secure sessions, server-side resource ownership authorization via authenticated user_id, design system & navigation shell, audit logging, and user settings — v1.0
- ✓ **Phase 2 (Core Productivity)**: Tasks, Projects, Goals, Calendar & Time Blocking, Daily Planning & Evening Review, Habits & Streaks, and Unified Dashboard ("What matters right now?") — v1.0
- ✓ **Phase 3 (Knowledge, Learning & Relationships)**: Markdown Notes with bi-directional linking ([[note]]), Tags, Knowledge Graph relations, Global Search, Learning System (items, courses, progress), and Relationships / People CRM (Person, Interaction entities, contact metadata, follow-ups, and relationship types) — v1.0
- ✓ **Phase 4 (Personal Finance)**: Accounts, Transactions (income/expense/transfers), Categories, Budgets, Financial Goals link, and Net Worth reports — v1.0
- ✓ **Phase 5 (Content & Social Media)**: Content ideas, rich editor, platform-specific variations, Content Calendar, media attachments, and content analytics data models — v1.0
- ✓ **Phase 6 (AI Layer & Assistant)**: Multi-provider abstraction (Gemini, Claude, OpenAI, Ollama), Context Retrieval (RAG over personal graph), Tool calling, Side-effect confirmation gates, and Chat / Command Palette universal capture — v1.0
- ✓ **Phase 7 (Automation & Event Bus)**: Event bus, Trigger-condition-action workflow engine, Background jobs / scheduler, and System notifications — v1.0
- ✓ **Phase 8 (External Integrations)**: Google Calendar two-way sync, GitHub activity tracking, Email/Social API adapters, and Cloud storage backup — v1.0
- ✓ **Phase 9 (Intelligence & Predictive Analytics)**: Personal analytics dashboard, Predictive trend detection, Goal risk scoring, Schedule/Time optimization, and Semantic embeddings — v1.0
- ✓ **Phase 10 (Shared Application Services & Headless CLI)**: Pure headless service contracts, CLI runner foundation, entity CRUD commands, unified context inspection (`lifeos context`), and daily planning workflows — v2.0
- ✓ **Phase 11 (LifeOS Model Context Protocol Server)**: Standard stdio MCP transport, personal graph context resources, structured tools delegating to canonical domain services, and agent session negotiation — v2.0
- ✓ **Phase 12 (Skills Engine & Contextual Documentation Retrieval)**: Curated procedural skills registry (`skills/lifeos/*`), machine-readable frontmatter, and contextual documentation search over `.planning/` and architecture specifications — v2.0
- ✓ **Phase 13 (Zero-Trust Agent Safety, Permissions & Attribution Audit)**: Five-tier agent capability permissions, mandatory HITL approval gates for high-impact mutations, zero-trust financial shield, time-bound challenge expiration, and granular `agent_audit_log` — v2.0
- ✓ **Phase 14 (Security Boundary Escape Remediation & Repository-Wide Zero-Trust Closure)**: Webhook HMAC verification, unified legacy AI tools under `executeAgentOperation`, transactional audit rollback, and background challenge TTL sweeper — v2.0
- ✓ **Phase 15 (Mobile PWA & Voice Dictation Quick Capture)**: Web App Manifest, offline service worker caching with IndexedDB sync, and native Web Speech API voice capture in universal quick capture modal — v2.0
- ✓ **Phase 16 (Controlled Project Workspace Execution Harness)**: Project root sandboxing, realpath containment, validated command runner, plan-to-task materialization with DAG topology, and pre-commit verification gates — v2.0
- ✓ **Phase 17 (Workspace Agent Surface & Development Workflow Integration)**: Expose workspace operations via Headless CLI (`lifeos workspace`), MCP Server tools (`lifeos_workspace_*`), procedural skill, and full development lifecycle integration test suite — v2.0
- ✓ **Phase 18 (Closed-Loop Autonomous Agent Execution & Verified Commit Engine)**: Plan execution state inspection (`lifeos workspace status / next-task`), MCP task query parity (`lifeos_list_tasks`, `lifeos_get_task`), time-bound Verification Qualification Lease, sandboxed audited commit execution (`lifeos workspace commit`), and pre-commit hook gating — v2.0
- ✓ **Phase 19 (External Platform, Mobile Hardware & Assistive Device Validation)**: Physical smartphone & tablet testing (iOS Safari, Android Chrome, iPadOS), touch ergonomics (thumb zone, >=44px tap targets, momentum scrolling), native screen readers (NVDA, JAWS, VoiceOver macOS/iOS, TalkBack), and mobile audio hardware noise suppression — v2.1
- ✓ **Phase 20 (Cross-Browser Engine & Adversarial Journey Regression)**: Desktop Firefox (Gecko), Apple Safari (WebKit), Edge compatibility, Safari Private Browsing safe storage accessors, adversarial H01–H12 scenario challenge, and holistic project-wide regression — v2.1
- ✓ **Phase 21 (Production Infrastructure Hardening & Migration Baseline Alignment)**: Production cloud deployment verification under TLS 1.3/1.2, HTTP/2 ALPN multiplexing, edge reverse-proxy forwarding, private CDN caching headers, and linear Drizzle Kit snapshot reconciliation (0012–0027) with 0 schema drift — v2.1

### Active

- [ ] **ORCH-01**: Multi-agent proactive orchestration layer (Planner, Analyst, Creator) coordinating life data — v3.0
- [ ] **ORCH-02**: "Plan my week" natural language synthesis integrating goals, calendar, deadlines, habits, energy, and workload — v3.0
- [ ] **ORCH-03**: Proactive daily interventions and automated schedule rebalancing based on detected energy dips — v3.0
- [ ] **PUB-01**: Automated multi-platform OAuth publishing to Twitter/X, LinkedIn, and personal blog — v3.0
- [ ] **PUB-02**: Two-way social analytics synchronization for published post impressions and engagements — v3.0

### Out of Scope

- **Multi-tenant SaaS for teams**: LifeOS is designed as a single-user personal OS for the owner; team collaboration features, workspaces, and tenant billing are excluded.
- **Unconstrained autonomous execution**: AI agents must never execute destructive actions, delete data, or publish externally without explicit human confirmation.
- **Distributed microservices**: No Kubernetes or multi-repo microservice architecture; a modular monolith running in Docker on a single VPS or locally minimizes operational overhead.
- **Direct automated social publishing**: Publishing integrations are deferred; content focuses on ideation, drafting, and scheduling.
- **Replacing relational modeling with unstructured JSON blobs**: Core business entities must be strictly normalized with foreign keys and migrations in PostgreSQL.
- **Upfront monolithic database schema**: Building the complete domain database schema upfront violates the vertical-slice rule.

## Context

- Master specification defined in prd.md (110 sections, 2,600+ lines).
- 1,899 automated tests across 151 test files covering 100% of domain business logic, agent security boundaries, cross-browser compatibility, and production deployment conditions.
- Zero-drift architecture: prd.md is the product contract, code is the implementation, and any divergence must be explicitly documented and resolved.

## Constraints

- **Tech Stack**: TypeScript with strict mode (noImplicitAny), PostgreSQL for all relational data, Drizzle ORM for type-safe schema definitions and migrations, modern web UI (React / Next.js with Tailwind CSS & shadcn/ui components).
- **Security & Privacy**: Strict session verification via Better Auth; authentication and authorization remain separate concerns; application authorization must enforce resource ownership using the authenticated user's user_id on all resource access; sensitive credentials (API keys, social tokens) encrypted at rest and never exposed to the client; comprehensive audit logging.
- **Architecture**: Modular monolith with clear domain boundaries (src/features/*, src/lib/*, src/server/*), typed API contracts, server-side input validation (Zod), and database transactions for all multi-entity mutations.
- **Database Scope & Vertical-Slice Rule**: Domain schemas must be introduced with the phase that implements their corresponding functionality. Do not build the entire database schema upfront. Phase 1 database work is strictly limited to foundational/authentication infrastructure required by the first vertical slice: users, sessions / Better Auth required tables, preferences (if required by Phase 1 design), and audit_log. Domain tables (Task, Project, Goal, Habit, Calendar, Note, Person, Interaction, Finance, Content, AI, etc.) are strictly prohibited during Phase 1 unless explicitly required by an approved Phase 1 vertical slice.
- **Deployment**: Docker containerization with docker-compose for PostgreSQL, app server, and background workers.
- **Testing & Test Organization**: Mandatory test coverage for business logic (goal progress, habit calculations, finance summaries, priority scoring) and integration tests for API contracts. All test files MUST reside in `scripts/tests/{phase}/{plan}/...` (e.g. `scripts/tests/phase-01/plan-01/...`). Test files MUST NOT be placed inside `src/`, keeping `src/` cleanly dedicated to production application code.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Next.js App Router + TypeScript Full-Stack | Unified TypeScript codebase, server actions / route handlers, React Server Components, and seamless SSR/client hydration | Decided (Authoritative) |
| Drizzle ORM with PostgreSQL | PRD mandates strict relational modeling, migrations, foreign keys, transaction safety, and indexing. Drizzle provides type-safe SQL, explicit schema definitions, automated migrations, and zero-runtime overhead. | Decided (Authoritative) |
| Better Auth for Authentication & Sessions | Better Auth provides secure session cookies, CSRF protection, and standard auth tables with clean TypeScript/Drizzle integration. | Decided (Authoritative) |
| Strict Separation of Auth and Resource Ownership | Authentication and authorization remain separate concerns. Authentication verifies identity; application authorization enforces resource ownership using authenticated user_id on all endpoints and server actions. | Decided (Authoritative) |
| Vertical-Slice Database Scope | Domain schemas must be introduced with the phase implementing corresponding functionality. Prevents speculative schema bloat. | Decided (Authoritative) |
| Modular Monolith Architecture | Keeps local execution simple, eliminates distributed system failure modes, allows easy Docker VPS deployment | Decided (Authoritative) |
| Multi-Provider AI Abstraction Layer | Enables switching between Gemini, Anthropic Claude, OpenAI, and local Ollama without rewriting business logic | Decided (Authoritative) |
| Mandatory Human-in-the-Loop Confirmation Gate | Destructive mutations or external communications triggered by AI require explicit confirmation | Decided (Authoritative) |
| Clean `src/` & Centralized Test Hierarchy | All test files are centralized in `scripts/tests/{phase}/{plan}/...` to guarantee a clean production codebase in `src/`. | Decided (Authoritative) |
| In-App Typed Event Bus | In-process asynchronous event bus with post-commit emission, error containment, and depth-3 cycle guards | Decided (Authoritative) |
| Idempotent PostgreSQL-Backed Scheduler | Dual HTTP cron and worker daemon with distributed locks in PostgreSQL (`scheduler_locks`), eliminating external queue dependencies | Decided (Authoritative) |
| Official Stdio MCP Transport | Standardizes agent integration protocol for desktop and CLI agent harnesses without network socket overhead | Decided (Authoritative — v2.0) |
| Five-Tier Agent Capability Matrix | READ, WRITE, EXECUTE, DESTRUCTIVE, SENSITIVE tiers enforce granular capability bounding across all caller paths | Decided (Authoritative — v2.0) |
| Zero-Trust Financial Shield | Absolute fail-closed boundary prohibiting automated agent mutations to financial ledgers, accounts, or budgets | Decided (Authoritative — v2.0) |
| Pessimistic Row Locking for HITL Approvals | `SELECT ... FOR UPDATE` row locks prevent double-submit and replay race conditions on approval challenges | Decided (Authoritative — v2.0) |
| Transactional Audit Logging Coupling | Database mutations and `agent_audit_log` records are committed atomically; failure of audit log rolls back mutation | Decided (Authoritative — v2.0) |
| Realpath Workspace Sandbox Containment | Canonical repository path verification eliminates directory traversal and unauthorized script execution | Decided (Authoritative — v2.0) |
| Verification Qualification Lease Engine | Time-bound state-hashed qualification leases decouple pre-commit gating from long test runs while preserving safety | Decided (Authoritative — v2.0) |
| Viewport Cover & Safe-Area Insets | Export Next.js 15 viewport cover and CSS env safe-area insets to prevent UI clipping by device notches or home indicators | Decided (Authoritative — v2.1) |
| Mobile Bottom Navigation in Thumb Zone | Dock ergonomic navigation bar at bottom of mobile viewports (`md:hidden`) with padding offset to keep primary actions reachable | Decided (Authoritative — v2.1) |
| WCAG 2.5.5 >=44px Tap Target Bounds | Enforce touch button size variants with minimum 44x44px bounding boxes for all interactive elements | Decided (Authoritative — v2.1) |
| Cross-Browser Standard CSS Scrollbars | Declare standard CSS Scrollbars Level 1 properties alongside WebKit pseudo-elements for universal cross-browser styling | Decided (Authoritative — v2.1) |
| Safe Browser Storage Accessors | Guard `localStorage` access with graceful in-memory fallback to prevent fatal crashes in Safari Private Browsing | Decided (Authoritative — v2.1) |
| Edge Reverse Proxy Header Guard & CDN Directives | Enforce host validation, 308 HTTPS redirect, and inject `CDN-Cache-Control: no-store` / `Surrogate-Control: no-store` to prevent CDN cache pollution | Decided (Authoritative — v2.1) |
| Drizzle Kit Linear Snapshot Chain Invariant | Maintain strictly linear parent-child `prevId` linkages across all migration snapshots to guarantee zero drift under `drizzle-kit check` and `generate` | Decided (Authoritative — v2.1) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via /gsd-transition):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via /gsd-complete-milestone):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-02 after v2.1 milestone*
