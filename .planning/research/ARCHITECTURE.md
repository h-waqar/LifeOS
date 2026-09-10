# Architecture Specification: LifeOS

**Domain:** Personal Operating System
**Model:** Modular Monolith (Layered Domain-Driven Architecture)
**Confidence:** HIGH

## Component Boundaries

```
┌─────────────────────────────────────────────────────────┐
│                    Presentation Layer                    │
│  - App Shell & Navigation (Sidebar, Header, CommandBar) │
│  - Feature Views (Dashboard, Tasks, Notes, People, etc.)│
│  - Modal Capture & Chat Assistant UI                    │
└────────────────────────────┬────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────┐
│                    Application Layer                    │
│  - Feature Services (TaskService, PeopleService, etc.)  │
│  - Daily Planning & Review Orchestration                │
│  - Security & Ownership Guards (Server-Side Auth)       │
└────────────────────────────┬────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────┐
│                        AI Layer                         │
│  - Provider Abstraction (Gemini, Claude, OpenAI, Ollama)│
│  - Personal Context Retrieval Engine (RAG over Graph)   │
│  - Structured Tool Calling & Confirmation Engine        │
└────────────────────────────┬────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────┐
│                    Infrastructure & Data                │
│  - PostgreSQL 16+ with Drizzle ORM (Incremental Schemas)│
│  - In-Process Event Bus & Scheduled Jobs                │
│  - Audit Logger & Encrypted Secret Vault                │
│  - File System / Local Storage Backup                   │
└─────────────────────────────────────────────────────────┘
```

## Data Flow & Invariants

1. **Strict Separation of Auth and Resource Ownership:** Better Auth handles authentication (verifying credentials and issuing secure session cookies). Application authorization enforces resource ownership: every domain entity belongs to `user_id`, and server actions / endpoints verify `user_id` ownership before executing any query or mutation. Client-supplied IDs are never trusted (PRD Section 46).
2. **One Source of Truth:** Tasks are canonical. When scheduled on the calendar, a `TimeBlock` links to the canonical `Task` rather than duplicating task fields.
3. **Audit Log Invariant:** All mutations to core financial, goal, or security records write an entry to the `audit_log` table.
4. **AI Safety Invariant:** AI tools with side effects return a `pending_confirmation` state; they only commit to PostgreSQL upon user approval.
5. **Vertical-Slice Database Evolution:** Domain schemas are introduced alongside the phase that implements their corresponding functionality. Upfront monolithic schema generation is prohibited. Phase 1 database scope is strictly limited to foundational/auth tables (`users`, `sessions`, `preferences`, `audit_log`). Domain tables are added incrementally in Phases 2-9.
