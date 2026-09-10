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

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] **Phase 1 (Foundation)**: TypeScript project architecture, Next.js / modular structure, PostgreSQL database with Drizzle ORM (foundational/auth tables only: users, sessions / Better Auth tables, preferences, audit_log), Better Auth authentication & secure sessions, server-side resource ownership authorization via authenticated user_id, design system & navigation shell, audit logging, and user settings.
- [ ] **Phase 2 (Core Productivity)**: Tasks, Projects, Goals, Calendar & Time Blocking, Daily Planning & Evening Review, Habits & Streaks, and Unified Dashboard ("What matters right now?").
- [ ] **Phase 3 (Knowledge, Learning & Relationships)**: Markdown Notes with bi-directional linking ([[note]]), Tags, Knowledge Graph relations, Global Search, Learning System (items, courses, progress), and Relationships / People CRM (Person, Interaction entities, contact metadata, follow-ups, and relationship types).
- [ ] **Phase 4 (Personal Finance)**: Accounts, Transactions (income/expense/transfers), Categories, Budgets, Financial Goals link, and Net Worth reports.
- [ ] **Phase 5 (Content & Social Media)**: Content ideas, rich editor, platform-specific variations, Content Calendar, media attachments, and content analytics data models.
- [ ] **Phase 6 (AI Layer & Assistant)**: Multi-provider abstraction (Gemini, Claude, OpenAI, Ollama), Context Retrieval (RAG over personal graph), Tool calling, Side-effect confirmation gates, and Chat / Command Palette universal capture.
- [ ] **Phase 7 (Automation & Event Bus)**: Event bus, Trigger-condition-action workflow engine, Background jobs / scheduler, and System notifications.
- [ ] **Phase 8 (External Integrations)**: Google Calendar two-way sync, GitHub activity tracking, Email/Social API adapters, and Cloud storage backup.
- [ ] **Phase 9 (Intelligence & Predictive Analytics)**: Personal analytics dashboard, Predictive trend detection, Goal risk scoring, Schedule/Time optimization, and Semantic embeddings.

### Out of Scope

- **Multi-tenant SaaS for teams**: LifeOS is designed as a single-user personal OS for the owner; team collaboration features, workspaces, and tenant billing are excluded for v1.
- **Unconstrained autonomous execution**: AI agents must never execute destructive actions, delete data, or publish externally without explicit human confirmation.
- **Distributed microservices**: No Kubernetes or multi-repo microservice architecture; a modular monolith running in Docker on a single VPS or locally minimizes operational overhead.
- **Direct automated social publishing in MVP**: Publishing integrations are deferred to Phase 8; Phase 5 focuses on content ideation, drafting, and scheduling.
- **Replacing relational modeling with unstructured JSON blobs**: Core business entities must be strictly normalized with foreign keys and migrations in PostgreSQL.
- **Upfront monolithic database schema**: Building the complete domain database schema upfront violates the vertical-slice rule.

## Context

- Master specification defined in prd.md (110 sections, 2,600+ lines).
- Greenfield codebase; development must follow specification-driven development with AI paired-programming and atomic GSD tracking.
- The system must prevent architecture drift: prd.md is the product contract, code is the implementation, and any divergence must be explicitly documented and resolved.

## Constraints

- **Tech Stack**: TypeScript with strict mode (noImplicitAny), PostgreSQL for all relational data, Drizzle ORM for type-safe schema definitions and migrations, modern web UI (React / Next.js with Tailwind CSS & shadcn/ui components).
- **Security & Privacy**: Strict session verification via Better Auth; authentication and authorization remain separate concerns; application authorization must enforce resource ownership using the authenticated user's user_id on all resource access; sensitive credentials (API keys, social tokens) encrypted at rest and never exposed to the client; comprehensive audit logging.
- **Architecture**: Modular monolith with clear domain boundaries (src/features/*, src/lib/*, src/server/*), typed API contracts, server-side input validation (Zod), and database transactions for all multi-entity mutations.
- **Database Scope & Vertical-Slice Rule**: Domain schemas must be introduced with the phase that implements their corresponding functionality. Do not build the entire database schema upfront. Phase 1 database work is strictly limited to foundational/authentication infrastructure required by the first vertical slice: users, sessions / Better Auth required tables, preferences (if required by Phase 1 design), and audit_log. Domain tables (Task, Project, Goal, Habit, Calendar, Note, Person, Interaction, Finance, Content, AI, etc.) are strictly prohibited during Phase 1 unless explicitly required by an approved Phase 1 vertical slice.
- **Deployment**: Docker containerization with docker-compose for PostgreSQL, app server, and background workers.
- **Testing**: Mandatory test coverage for business logic (goal progress, habit calculations, finance summaries, priority scoring) and integration tests for API contracts.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Next.js App Router + TypeScript Full-Stack | Unified TypeScript codebase, server actions / route handlers, React Server Components, and seamless SSR/client hydration | Decided (Authoritative) |
| Drizzle ORM with PostgreSQL | PRD mandates strict relational modeling, migrations, foreign keys, transaction safety, and indexing. Drizzle provides type-safe SQL, explicit schema definitions, automated migrations, and zero-runtime overhead. Prisma is rejected to eliminate unresolved ORM choices. | Decided (Authoritative) |
| Better Auth for Authentication & Sessions | Better Auth provides secure session cookies, CSRF protection, and standard auth tables with clean TypeScript/Drizzle integration. Replaces NextAuth and custom Argon2 alternatives. | Decided (Authoritative) |
| Strict Separation of Auth and Resource Ownership | Authentication and authorization remain separate concerns. Authentication verifies identity; application authorization enforces resource ownership using the authenticated user's user_id on all endpoints and server actions. Client-supplied user IDs are never trusted. | Decided (Authoritative) |
| Relationships / People CRM in Phase 3 | Person and Interaction entities from PRD Section 25 are not deferred to v2. Add Relationships / People CRM to Phase 3 alongside Knowledge & Learning, enabling notes, tasks, and search to link to contacts. | Decided (Authoritative) |
| Vertical-Slice Database Scope (Phase 1 Boundary) | Domain schemas must be introduced with the phase implementing their corresponding functionality. Do not build the entire database schema upfront. Phase 1 database scope is strictly limited to foundational/authentication infrastructure (users, sessions / Better Auth required tables, preferences if required by Phase 1 design, audit_log). Domain tables are prohibited in Phase 1. | Decided (Authoritative) |
| Modular Monolith Architecture | Keeps local execution simple, eliminates distributed system failure modes, allows easy Docker VPS deployment | Decided (Authoritative) |
| Multi-Provider AI Abstraction Layer | Enables switching between Gemini, Anthropic Claude, OpenAI, and local Ollama without rewriting business logic | Decided (Authoritative) |
| Mandatory Human-in-the-Loop Confirmation Gate | Destructive mutations or external communications triggered by AI require explicit confirmation | Decided (Authoritative) |
| Single-Owner User Model with Multi-User Schema Readiness | Ensures maximum privacy and speed for Hamza while tables retain user_id foreign keys for clean multi-user migration | Decided (Authoritative) |

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
*Last updated: 2026-09-10 after initialization*
