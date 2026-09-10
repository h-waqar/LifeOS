# Technology Stack: LifeOS

**Domain:** Personal Operating System / Knowledge & Execution Engine
**Architecture:** Full-Stack Modular Monolith (TypeScript + PostgreSQL)
**Confidence:** HIGH

## Core Technologies

### Frontend & UI Layer
- **Framework:** Next.js 15 (App Router, React 19, TypeScript)
  - *Rationale:* Unified full-stack TypeScript framework with React Server Components, server actions, and fast client hydration. Fits PRD Section 89 architecture.
- **Styling & Components:** Tailwind CSS v3/v4 + shadcn/ui (Radix UI primitives)
  - *Rationale:* Zero-runtime CSS, accessible keyboard-friendly components, supports dark/light mode, fits the clean modern aesthetic required by PRD Section 51.
- **Icons & Visualization:** Lucide React, Recharts / Tremor for personal analytics, TanStack Table for dense tabular data.
- **State & Realtime UI:** React Server Components + React Context / Zustand for local client state (modal capture, command palette).

### Backend & Application Layer
- **Runtime:** Node.js 20+ LTS
- **Routing & Endpoints:** Next.js Route Handlers & Server Actions
- **Validation:** Zod (typed schema validation for all API inputs, forms, and AI tool calling contracts)
- **Authentication & Sessions:** NextAuth / Better-Auth / Argon2 session cookies
  - *Rationale:* Single-owner security model with secure HTTP-only cookies, CSRF protection, and forward compatibility with multi-user tables (PRD Section 45-46).

### Data Layer
- **Database:** PostgreSQL 16+
  - *Rationale:* Mandated by PRD Section 43. Strict relational modeling, foreign keys, constraints, ACID transactions, and robust indexing.
- **ORM & Migrations:** Drizzle ORM (or Prisma)
  - *Rationale:* Type-safe SQL, explicit schema definitions, automated migration scripts, zero magic strings, fast execution without heavy runtime overhead.
- **Full-Text & Search:** PostgreSQL native `tsvector` + `pg_trgm` for Phase 1-3 full-text search; `pgvector` for semantic embeddings in Phase 9.

### AI & Agent Layer
- **Framework:** Vercel AI SDK (`ai` package)
- **Supported Providers:** Google Gemini (`@ai-sdk/google`), Anthropic (`@ai-sdk/anthropic`), OpenAI (`@ai-sdk/openai`), Local Ollama
  - *Rationale:* Clean provider abstraction satisfying PRD Section 55 & 77.
- **Tool Calling & Safety:** Strict schema-based function calling with human-in-the-loop confirmation gates for mutations.

### Infrastructure & Deployment
- **Containerization:** Docker & Docker Compose
  - *Services:* Web application container, PostgreSQL container, volume persistence for data & backups.
- **Testing:** Vitest (unit & calculation tests), Testing Library (component tests), Playwright (end-to-end user journeys).
