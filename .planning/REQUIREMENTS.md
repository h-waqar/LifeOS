# Requirements: LifeOS (Milestone 2.0)

**Defined:** 2026-09-30
**Core Value:** Transform LifeOS into an agent-accessible operating system by building a provider-agnostic intelligence and execution layer (MCP Server, Headless CLI, Curated Skills, Controlled Project Execution, Agent Permissions & Attribution Audit) while maintaining a strict zero-trust boundary, domain service invariants, and zero data loss.

## Milestone 2.0 Requirements

Requirements for Milestone 2.0 release across Phases 10 through 18. Each requirement maps to exactly one roadmap phase.

### Headless CLI & Shared Application Services

- [x] **CLI-01**: User can invoke `lifeos` command-line utility with persistent session/API token authentication and environment configuration without launching a browser.
- [x] **CLI-02**: User and agent scripts can query `lifeos` commands with `--json` flag to receive deterministic, strictly-typed JSON output, or standard formatted tabular output by default.
- [x] **CLI-03**: User can execute `lifeos context` and `lifeos status` to inspect current goals, active projects, top daily tasks, upcoming calendar blocks, and unread notifications in one unified command.
- [x] **CLI-04**: User can create, read, update, list, and filter tasks, projects, goals, notes, and habits directly via `lifeos [entity] [action]` with input validation against domain Zod schemas.
- [x] **CLI-05**: User can start, view, and complete morning planning and evening review workflows via `lifeos plan morning` and `lifeos plan evening`.

### Model Context Protocol (MCP) Server

- [x] **MCP-01**: External agent harnesses (Claude Code, AGY CLI, Codex, Cursor, Windsurf) can connect to LifeOS MCP Server over standard stdio transport using the official Model Context Protocol specification.
- [x] **MCP-02**: MCP server exposes readable resources (`lifeos://context/overview`, `lifeos://goals/active`, `lifeos://projects/active`, `lifeos://tasks/today`, `lifeos://finance/summary`) and standardized agent prompts for planning and task breakdown.
- [x] **MCP-03**: MCP server provides structured tools (`lifeos_create_task`, `lifeos_update_task`, `lifeos_create_goal`, `lifeos_create_project`, `lifeos_create_note`, `lifeos_search`) with Zod-backed input schemas delegating directly to canonical application services.
- [x] **MCP-04**: MCP tool handlers strictly invoke canonical application domain services with authenticated `user_id` ownership checks, preventing direct database mutations or validation bypasses.
- [x] **MCP-05**: MCP server authenticates incoming agent connections via encrypted API tokens, negotiates supported capability flags, and logs session lifecycle events.

### Skills System & Documentation Context Engine

- [x] **SKILL-01**: System provides a discoverable registry of domain procedural skills (`skills/lifeos/*`) defining step-by-step guidance for goal decomposition, weekly review, task prioritization, and bug remediation.
- [x] **SKILL-02**: Each skill defines standardized frontmatter (name, description, trigger_when, allowed_operations, required_context, verification_requirements) queryable via CLI and MCP tool.
- [x] **SKILL-03**: Agents can search and retrieve relevant architecture decision records (ADRs), domain specifications, and phase plans via `lifeos docs search [query]` without whole-codebase token loading.
- [x] **SKILL-04**: Skills system integrates with `.planning/` directory structure, allowing agents to inspect previous decisions, completed phase summaries, and pending todos before executing tasks.

### Zero-Trust Agent Safety, Permissions & Attribution Audit

- [x] **SAFE-01**: System enforces a five-tier permission model (READ, WRITE, EXECUTE, DESTRUCTIVE, SENSITIVE) for all agent-initiated operations, restricting unauthorized actions by default.
- [x] **SAFE-02**: Any agent operation classified as DESTRUCTIVE (deleting tasks/projects/goals) or SENSITIVE (updating credentials, altering account settings) generates an approval challenge requiring human confirmation before execution.
- [x] **SAFE-03**: System strictly prohibits autonomous agent-driven financial transaction mutations, account creations, or balance adjustments through CLI and MCP, enforcing read-only financial summaries for AI agents.
- [x] **SAFE-04**: System logs every agent action to `agent_audit_log` with agent identifier, provider type, session ID, tool name, arguments, previous state, new state, execution duration, and human approval status.
- [x] **SAFE-05**: Pending agent mutation requests expire automatically after a configurable TTL (default 10 minutes), invalidating unconfirmed operations and preventing stale execution races.

### Controlled Project Workspace & Execution Harness

- [x] **WORK-01**: Agent development execution is restricted to the project root directory, preventing file traversal or process execution outside the repository.
- [x] **WORK-02**: System provides validated commands for running test suites (`pnpm test`), type checking (`tsc --noEmit`), and production builds (`pnpm build`) with structured status reporting and failure output capture.
- [x] **WORK-03**: Agents can convert an approved implementation plan into structured LifeOS tasks linked to an active project with priority, estimated duration, and dependency ordering.
- [x] **WORK-04**: System enforces that agent-generated code changes pass TypeScript compilation and relevant unit/integration tests before allowing git commit execution.

### Mobile PWA & Voice Dictation Quick Capture

- [x] **MOB-01**: Web application includes a compliant Web App Manifest (`manifest.json`) and service worker configuration enabling "Add to Home Screen" on mobile devices with cached shell assets.
- [x] **MOB-02**: User can capture tasks and draft notes while offline via IndexedDB local storage, with automatic sync to PostgreSQL upon network reconnection.
- [x] **MOB-03**: Universal quick capture modal incorporates a microphone button using native Web Speech API speech-to-text to transcribe spoken thoughts into task titles and note content.
- [x] **MOB-04**: Voice-transcribed input can be automatically parsed by the NLP quick capture service to extract dates, priorities, and tags with zero manual typing.

## v3 Requirements (Deferred)

Deferred to future releases after Milestone 2.0 execution:

- **REMOTE-01**: Remote SSH execution and containerized ephemeral agent sandboxes.
- **SWARM-01**: Autonomous multi-agent swarm orchestration and agent-to-agent delegation.
- **BANK-01**: Plaid / Open Banking automated transaction sync (requires institutional banking license/aggregator).
- **PUB-01**: Direct social media automated OAuth auto-publishing (Twitter/X, LinkedIn) with third-party developer app verification.
- **COLLAB-01**: Multi-user sharing of select projects or notes (v3 milestone).

## Out of Scope

| Feature | Reason |
|---------|--------|
| Unrestricted host shell access | Violates zero-trust principle; agent execution is strictly sandboxed to the project root workspace |
| Autonomous AI financial mutations | Modifying ledgers, transferring funds, or creating transactions without human intervention violates safety invariants |
| Multi-tenant team SaaS | LifeOS is single-user personal software for Hamza; team workspaces, billing, and role hierarchies remain excluded |
| Direct database access for MCP/CLI | Bypassing canonical domain services would compromise validation, audit logging, and transactional invariants |
| Parallel duplicate business logic | The CLI and MCP server MUST import existing server domain services; maintaining duplicate business logic is prohibited |
| Upfront monolithic database schema | Schema changes for agent tokens and audit logs must follow the vertical-slice rule and safe forward migrations |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CLI-01 | Phase 10 | Complete |
| CLI-02 | Phase 10 | Complete |
| CLI-03 | Phase 10 | Complete |
| CLI-04 | Phase 10 | Complete |
| CLI-05 | Phase 10 | Complete |
| MCP-01 | Phase 11 | Complete |
| MCP-02 | Phase 11 | Complete |
| MCP-03 | Phase 11 | Complete |
| MCP-04 | Phase 11 | Complete |
| MCP-05 | Phase 11 | Complete |
| SKILL-01 | Phase 12 | Complete |
| SKILL-02 | Phase 12 | Complete |
| SKILL-03 | Phase 12 | Complete |
| SKILL-04 | Phase 12 | Complete |
| SAFE-01 | Phase 13 | Complete |
| SAFE-02 | Phase 13 | Complete |
| SAFE-03 | Phase 13 | Complete |
| SAFE-04 | Phase 13 | Complete |
| SAFE-05 | Phase 13 | Complete |
| WORK-01 | Phase 16 / 17 / 18 | Complete |
| WORK-02 | Phase 16 / 17 / 18 | Complete |
| WORK-03 | Phase 16 / 17 / 18 | Complete |
| WORK-04 | Phase 16 / 17 / 18 | Complete |
| MOB-01 | Phase 15 | Complete |
| MOB-02 | Phase 15 | Complete |
| MOB-03 | Phase 15 | Complete |
| MOB-04 | Phase 15 | Complete |

**Coverage:**
- Milestone 2.0 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0 ✓

---
*Requirements defined: 2026-09-30*
*Last updated: 2026-09-30 after Milestone 2.0 initiation*
