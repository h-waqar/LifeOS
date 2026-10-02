# Stack Research: Milestone v3.0

**Domain:** Proactive Personal OS Orchestration & External Social Ecosystem
**Researched:** 2026-10-02
**Confidence:** HIGH

## Recommended Stack Additions

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TypeScript (Strict) | ^5.6.0 | Core logic, contracts & scheduling algorithms | Already foundational; ensures type safety across all inter-agent messages and social payloads |
| Next.js App Router | ^15.0.0 | Server actions, route handlers, OAuth callbacks | Unified execution environment; SSR and edge compatibility |
| Drizzle ORM & PostgreSQL | ^0.34.0 / PG 16+ | Relational data, migrations, distributed locking | Proven zero-overhead ORM; existing 50 tables, distributed locks via `scheduler_locks` |
| Vercel AI SDK (`ai`) | ^3.4.0 | Multi-agent model routing, structured schema output | Native support for multi-provider switching (Gemini, Claude, OpenAI, Ollama), `generateObject` schema validation |
| AES-256-GCM (`src/lib/crypto.ts`) | Native Node `crypto` | OAuth token encryption at rest | In-repo validated cryptographic foundation with PBKDF2 salt and auth tags; 0 external dependencies |

### Supporting Libraries & Protocols

| Library / Protocol | Version | Purpose | When to Use |
|--------------------|---------|---------|-------------|
| Twitter/X API v2 Protocol | OAuth 2.0 PKCE / REST v2 | Post & thread creation, media upload, metrics | Used in Twitter social adapter for single/thread posts and public engagement retrieval |
| LinkedIn Community API | REST v2 (`/rest/posts`) | LinkedIn post publishing and engagement metrics | Used in LinkedIn social adapter with OAuth 2.0 authorization code grant |
| Webhook / REST Dispatch | HTTPS with HMAC-SHA256 | Personal blog / custom CMS publication | Used in Blog adapter with signed payload headers (`X-LifeOS-Signature-256`) |
| Zod | ^3.23.0 | API payload & agent schema validation | Used for all inter-agent message contracts, tool parameters, and OAuth payload parsing |
| Native Date / Interval Math | Standard TS/JS | Calendar conflict detection & constraint solver | Keeps schedule optimization deterministic, reproducible, and 100% unit-testable without external solver bloat |

### Development & Testing Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Vitest | Fast unit, calculation & integration tests | Existing test framework; all tests reside in `scripts/tests/` |
| Node.js `http`/`https` / MSW Fixtures | Mock HTTP server for social APIs | Enables deterministic offline verification of OAuth, publishing, and analytics sync without flaky live credentials |
| Drizzle Kit | Schema migrations & snapshot validation | Strict linear snapshot chain (0027 -> 0028) verified under `drizzle-kit check` |

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Native TypeScript Constraint Solver | MiniZinc / Google OR-Tools | Only if scheduling constraints exceed thousands of variables; LifeOS single-tenant calendar requires lightweight deterministic slot matching |
| PostgreSQL Scheduler Engine | BullMQ / Redis / Celery | Only if job volume exceeds thousands/sec; LifeOS single-user workload runs reliably with zero extra infrastructure via `scheduler_locks` |
| Direct Provider REST Adapters | Third-party aggregators (Buffer, Ayrshare) | Avoids third-party subscription costs, data privacy exposure, and external failure dependencies |
| In-repo Multi-Agent Coordinator | LangChain / CrewAI / AutoGen | Heavy Python runtimes violate Next.js/TS monolith architecture; Vercel AI SDK provides direct, typed agent handoffs |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Redis / Celery / RabbitMQ | Unnecessary infrastructure overhead for single-user system | PostgreSQL-backed `SchedulerEngine` with distributed locks |
| Heavy Python Agent Frameworks | Violates clean TypeScript architecture, adds cold starts and process bridges | Type-safe TypeScript agent personas using Vercel AI SDK and canonical domain services |
| Un-gated Automated Publishing | Extreme brand/reputation risk; AI hallucination could broadcast unintended text | Zero-Trust HITL preview and approval challenges (`agentChallenges`) |
| Storing Plaintext Access Tokens | Severe security risk if database backup is exposed | AES-256-GCM encryption with user-scoped keys |

## Version Compatibility

| Package / Surface | Compatible With | Notes |
|-------------------|-----------------|-------|
| Drizzle ORM ^0.34.0 | PostgreSQL 16+ | Forward migration 0028 extends provider check constraints cleanly |
| Vercel AI SDK ^3.4.0 | Next.js 15 App Router | Structured object generation for inter-agent contracts |
| Better Auth | Next.js 15 | Session verification and user authorization |

---
*Stack research for: LifeOS v3.0 Proactive Personal OS Orchestration & External Ecosystem*
*Researched: 2026-10-02*
