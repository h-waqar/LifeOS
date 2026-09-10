# Project Research Summary

**Project:** LifeOS
**Domain:** Greenfield Personal Operating System
**Researched:** 2026-09-10
**Confidence:** HIGH

## Executive Summary

LifeOS is an ambitious, unified personal operating system specified in `prd.md` (v1.0 master specification). Unlike typical productivity apps that fragment life management into isolated silos (Todoist for tasks, Notion for notes, Google Calendar for time, YNAB for finance, Buffer for social), LifeOS builds an interconnected personal information graph and execution system with a single source of truth.

The recommended architectural approach is a full-stack modular monolith built with TypeScript, Next.js 15 (App Router), Tailwind CSS, shadcn/ui, and PostgreSQL 16+ managed via Drizzle ORM. This stack provides maximum velocity, end-to-end type safety, strict relational integrity, and effortless self-hosted Docker deployment on a single VPS or local machine.

The critical risks are specification drift, premature third-party API integration, uncontrolled AI side effects, and relational schema degradation into unstructured JSON blobs. By adhering to the 9-phase roadmap defined in `prd.md` and enforcing strict confirmation gates for AI operations, LifeOS can be built systematically with robust quality.

## Key Findings

### Recommended Stack
- **Full-Stack Framework:** Next.js 15 (App Router, TypeScript, React 19)
- **UI Components:** Tailwind CSS, shadcn/ui (Radix primitives), Lucide React
- **Database & Persistence:** PostgreSQL 16+ with Drizzle ORM, strict relational schema, migrations, and ACID transactions; strictly follows vertical-slice schema evolution
- **Authentication & Sessions:** Better Auth with HTTP-only cookies and CSRF protection; strict separation between authentication and resource ownership authorization via authenticated `user_id`
- **AI Integration:** Vercel AI SDK with multi-provider abstraction (Gemini, Claude, OpenAI, Ollama)
- **Deployment:** Containerized Docker Compose setup with volume persistence and automated backup scripts

### Expected Features
- **Table Stakes (MVP):** Authentication, Unified Dashboard ("What matters right now?"), Tasks, Projects, Goals, Calendar & Time Blocking, Daily Planning & Review, Habits, Notes with bi-directional links, Relationships / People CRM (Person & Interaction tracking), Basic Personal Finance, Content drafting & calendar, Global Command Palette, and Contextual AI Assistant.
- **Differentiators:** Interconnected personal information graph, human-in-the-loop AI safety gates, cross-domain analytics, and friction-free universal capture.
- **Anti-Features:** Multi-tenant SaaS, team collaboration, autonomous unconfirmed mutations, and microservices.

### Architecture Approach
A layered modular monolith structured into domain features (`src/features/*`), shared infrastructure (`src/lib/*`), and server contracts. Data flows cleanly from UI through validated server actions to relational PostgreSQL tables, with all significant actions logged to an audit trail. Authentication (Better Auth) is strictly separated from authorization (resource ownership validation via `user_id`). The database adheres strictly to the vertical-slice rule: Phase 1 introduces only foundational/auth tables (`users`, `sessions`, `preferences`, `audit_log`), while domain schemas are deferred to their respective feature phases.

### Critical Pitfalls
1. **Specification Drift:** Mitigated by treating `prd.md` as the product contract and using GSD traceability.
2. **Uncontrolled AI Actions:** Mitigated by mandatory user confirmation gates for all side-effecting tools.
3. **Schema De-normalization:** Mitigated by strict relational tables and rejecting raw JSON blob shortcuts.
4. **Premature External Integrations:** Mitigated by completing internal domain models in Phases 1-5 before external adapters in Phase 8.
5. **Upfront Monolithic Schema Creation:** Mitigated by enforcing the vertical-slice rule and restricting Phase 1 DB work to foundational/auth infrastructure.

## Implications for Roadmap

Based on research and PRD Sections 71-80, the suggested 9-phase structure directly follows:

### Phase 1: Foundation
**Rationale:** Establishes the core architecture, PostgreSQL database with Drizzle ORM, Better Auth authentication, design system, navigation, settings, and audit logging before any business logic is built. Database scope is strictly restricted to foundational/auth tables.
**Delivers:** Running Next.js application, foundational DB migrations, secure auth & resource ownership guards, shell UI, settings, and automated testing baseline.
**Avoids:** Tech stack confusion, schema instability, upfront domain bloat, and missing audit logging.

### Phase 2: Core Productivity
**Rationale:** Delivers the primary execution engine: Goals → Projects → Tasks → Calendar / Time Blocking → Habits → Dashboard.
**Delivers:** Full productivity workflow allowing the user to set a goal, break it into projects/tasks, schedule them on the calendar, log habits, and view today's priorities.
**Avoids:** Siloed productivity tools and duplicate data entry.

### Phase 3: Knowledge, Learning & Relationships
**Rationale:** Connects notes, learning items, and important relationships (People CRM) to existing tasks, projects, and goals.
**Delivers:** Markdown note editor, bi-directional linking (`[[note]]`), tags, global search, learning system tracking, and People CRM (Person & Interaction management with follow-ups).
**Avoids:** Disconnected notes, forgotten reading lists, and siloed relationship context.

### Phase 4: Personal Finance
**Rationale:** Self-contained financial ledger that connects financial activity to long-term goals.
**Delivers:** Accounts, transactions, categories, budgets, and net worth reports.
**Avoids:** Unverified financial calculations (requires 100% test coverage).

### Phase 5: Content & Social Media
**Rationale:** Internal content creation pipeline prior to any external publishing automation.
**Delivers:** Content ideation, editor, multi-platform drafts, content calendar, and metrics data model.
**Avoids:** Premature social media API dependency.

### Phase 6: AI Layer & Assistant
**Rationale:** Introduces intelligent assistant and natural language capture across the already-established personal graph.
**Delivers:** Provider abstraction, personal graph RAG retrieval, structured tool execution with confirmation gates, and conversational assistant.
**Avoids:** Hallucinations and unauthorized data modifications.

### Phase 7: Automation & Event Bus
**Rationale:** Automates recurring workflows, triggers, conditions, and background routines across all modules.
**Delivers:** Event bus, workflow trigger-action rules, notifications, and scheduled background workers.
**Avoids:** Manual repetitive tasks and missed reviews.

### Phase 8: External Integrations
**Rationale:** Connects LifeOS to external third-party services now that internal APIs are mature.
**Delivers:** Google Calendar 2-way sync, GitHub activity ingestion, and cloud backup adapters.
**Avoids:** External API rate limit and schema churn during early core development.

### Phase 9: Intelligence & Predictive Analytics
**Rationale:** Advanced personal analytics, predictive trends, and semantic search over historical data.
**Delivers:** Predictive trend detection, goal risk assessment, time allocation insights, and semantic vector embeddings.
**Avoids:** Premature machine learning before sufficient personal data exists.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Next.js + TypeScript + PostgreSQL + Tailwind is the gold standard for personal OS apps |
| Features | HIGH | Exhaustively detailed in PRD v1.0 across 110 sections |
| Architecture | HIGH | Modular monolith with clean domain boundaries fits all functional requirements |
| Pitfalls | HIGH | Clear guardrails established in PRD sections 43, 59, 87, 107 |

**Overall confidence:** HIGH

## Sources

### Primary (HIGH confidence)
- prd.md — Master Product Requirements Document v1.0 (2,600+ lines)
- Next.js Documentation & React 19 Specifications
- PostgreSQL 16 Official Manual & Drizzle ORM Documentation

---
*Research completed: 2026-09-10*
*Ready for roadmap: yes*
