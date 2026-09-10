# Pitfalls & Mitigations: LifeOS

**Domain:** Personal Operating System
**Confidence:** HIGH

## Critical Pitfalls

### 1. Specification Drift Between PRD and Code
- **Warning Signs:** Unspecified API routes or schema columns appearing in commits without corresponding PRD updates.
- **Prevention Strategy:** Treat `prd.md` as the authoritative contract. Any schema addition or architectural deviation must be recorded in `.planning/PROJECT.md` Key Decisions and traced to a requirement ID.
- **Addressed in:** All Phases (enforced via GSD workflow gates).

### 2. Uncontrolled AI Side Effects
- **Warning Signs:** AI assistant directly creating, modifying, or deleting records in the database without user review.
- **Prevention Strategy:** Two-phase execution for AI tools. Queries (read-only) execute immediately; mutations (write/delete) return structured action proposals requiring explicit user confirmation.
- **Addressed in:** Phase 1 (Foundation Security) & Phase 6 (AI Layer).

### 3. Database De-normalization & JSON Sprawl
- **Warning Signs:** Storing task metadata, subtasks, or financial details in generic JSONB columns without relational constraints.
- **Prevention Strategy:** Explicit relational tables with foreign keys, unique constraints, check constraints, and typed Drizzle ORM schemas as mandated by PRD Section 43.
- **Addressed in:** Phase 1 (Foundation) & Phase 2 (Core Productivity).

### 4. Premature External API Integrations
- **Warning Signs:** Attempting to build Google Calendar or Twitter/LinkedIn OAuth sync before the internal calendar and content data models are rock solid.
- **Prevention Strategy:** Strictly adhere to the PRD phase order: Phase 2 builds internal calendar; Phase 5 builds internal content calendar; Phase 8 integrates external third-party APIs.
- **Addressed in:** Phase 2, Phase 5, Phase 8.

### 5. Over-engineering with Microservices
- **Warning Signs:** Spawning separate backend servers, microservices, or complex message queues for a single-user system.
- **Prevention Strategy:** Keep LifeOS as a clean modular monolith deployable in a single Docker container with PostgreSQL.
- **Addressed in:** Phase 1 (Foundation Architecture).

### 6. Upfront Monolithic Schema Creation
- **Warning Signs:** Defining domain tables (Tasks, Projects, Goals, Habits, Notes, People, Finance, Content, AI) during Phase 1 before their features are built.
- **Prevention Strategy:** Strictly enforce the vertical-slice rule. Phase 1 database work is limited to foundational/authentication tables (`users`, `sessions` / Better Auth required tables, `preferences`, `audit_log`). Domain tables are strictly introduced in the phases that implement them.
- **Addressed in:** Phase 1 (Foundation) and all subsequent phases.
