# Architecture Specification: LifeOS

**Domain:** Personal Operating System
**Model:** Modular Monolith (Layered Domain-Driven Architecture)
**Confidence:** HIGH

## Component Boundaries

```
┌─────────────────────────────────────────────────────────┐
│                    Presentation Layer                    │
│  - App Shell & Navigation (Sidebar, Header, CommandBar) │
│  - Feature Views (Dashboard, Tasks, Goals, Notes, etc.) │
│  - Modal Capture & Chat Assistant UI                    │
└────────────────────────────┬────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────┐
│                    Application Layer                    │
│  - Feature Services (TaskService, GoalService, etc.)    │
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
│  - PostgreSQL 16+ (Normalized Tables, Constraints)      │
│  - In-Process Event Bus & Scheduled Jobs                │
│  - Audit Logger & Encrypted Secret Vault                │
│  - File System / Local Storage Backup                   │
└─────────────────────────────────────────────────────────┘
```

## Data Flow & Invariants

1. **Strict Resource Ownership:** Every database entity belongs to `user_id`. Server actions verify session authenticity and record ownership before every read/write.
2. **One Source of Truth:** Tasks are canonical. When scheduled on the calendar, a `TimeBlock` links to the canonical `Task` rather than duplicating task fields.
3. **Audit Log Invariant:** All mutations to core financial, goal, or security records write an entry to the `audit_log` table.
4. **AI Safety Invariant:** AI tools with side effects return a `pending_confirmation` state; they only commit to PostgreSQL upon user approval.
