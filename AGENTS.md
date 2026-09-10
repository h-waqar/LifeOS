<!-- GSD:project-start source:PROJECT.md -->

## Project

**LifeOS**

LifeOS is a greenfield personal operating system designed to help one person (Hamza) manage, understand, and improve their entire life from a single, unified system. It unifies tasks, projects, goals, daily planning, calendar, habits, notes, knowledge, finances, learning, relationships, and content creation into an interconnected personal information graph, execution engine, and contextual AI assistant.

**Core Value:** A single source of truth connecting goals, projects, tasks, time, knowledge, money, learning, relationships, and content—powered by an AI layer that understands context and helps plan and execute without fragmented tools, duplicate entry, or siloed data.

### Constraints

- **Tech Stack**: TypeScript with strict mode (noImplicitAny), PostgreSQL for all relational data, Drizzle ORM for type-safe schema definitions and migrations, modern web UI (React / Next.js with Tailwind CSS & shadcn/ui components).
- **Security & Privacy**: Strict session verification via Better Auth; authentication and authorization remain separate concerns; application authorization must enforce resource ownership using the authenticated user's user_id on all resource access; sensitive credentials (API keys, social tokens) encrypted at rest and never exposed to the client; comprehensive audit logging.
- **Architecture**: Modular monolith with clear domain boundaries (src/features/*, src/lib/*, src/server/*), typed API contracts, server-side input validation (Zod), and database transactions for all multi-entity mutations.
- **Database Scope & Vertical-Slice Rule**: Domain schemas must be introduced with the phase that implements their corresponding functionality. Do not build the entire database schema upfront. Phase 1 database work is strictly limited to foundational/authentication infrastructure required by the first vertical slice: users, sessions / Better Auth required tables, preferences (if required by Phase 1 design), and audit_log. Domain tables (Task, Project, Goal, Habit, Calendar, Note, Person, Interaction, Finance, Content, AI, etc.) are strictly prohibited during Phase 1 unless explicitly required by an approved Phase 1 vertical slice.
- **Deployment**: Docker containerization with docker-compose for PostgreSQL, app server, and background workers.
- **Testing & Test Organization**: Mandatory test coverage for business logic (goal progress, habit calculations, finance summaries, priority scoring) and integration tests for API contracts. All test files MUST reside in `scripts/tests/{phase}/{plan}/...` (e.g. `scripts/tests/phase-01/plan-01/...`). Test files MUST NOT be placed inside `src/`, keeping `src/` cleanly dedicated to production application code.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Core Technologies

### Frontend & UI Layer

- **Framework:** Next.js 15 (App Router, React 19, TypeScript)
- **Styling & Components:** Tailwind CSS v3/v4 + shadcn/ui (Radix UI primitives)
- **Icons & Visualization:** Lucide React, Recharts / Tremor for personal analytics, TanStack Table for dense tabular data.
- **State & Realtime UI:** React Server Components + React Context / Zustand for local client state (modal capture, command palette).

### Backend & Application Layer

- **Runtime:** Node.js 20+ LTS
- **Routing & Endpoints:** Next.js Route Handlers & Server Actions
- **Validation:** Zod (typed schema validation for all API inputs, forms, and AI tool calling contracts)
- **Authentication & Sessions:** Better Auth (session cookies, CSRF protection; strict separation between authentication and resource ownership authorization via user_id)

### Data Layer

- **Database:** PostgreSQL 16+
- **ORM & Migrations:** Drizzle ORM (type-safe SQL, Drizzle Kit migrations; adheres strictly to vertical-slice schema evolution)
- **Full-Text & Search:** PostgreSQL native `tsvector` + `pg_trgm` for Phase 1-3 full-text search; `pgvector` for semantic embeddings in Phase 9.

### AI & Agent Layer

- **Framework:** Vercel AI SDK (`ai` package)
- **Supported Providers:** Google Gemini (`@ai-sdk/google`), Anthropic (`@ai-sdk/anthropic`), OpenAI (`@ai-sdk/openai`), Local Ollama
- **Tool Calling & Safety:** Strict schema-based function calling with human-in-the-loop confirmation gates for mutations.

### Infrastructure & Deployment

- **Containerization:** Docker & Docker Compose
- **Testing:** Vitest (unit & calculation tests), Testing Library (component tests), Playwright (end-to-end user journeys).

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

- **Test File Organization & Clean Repository**: All test files MUST be placed in `scripts/tests/{phase}/{plan}/...` (e.g. `scripts/tests/phase-01/plan-01/`). Test files MUST NEVER be co-located inside `src/`.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.agents/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
