# Roadmap: LifeOS (Milestone 2.0)

## Overview

Milestone 2.0 transforms LifeOS from a standalone web-first personal operating system into an agent-accessible operating system. It introduces a provider-agnostic intelligence and execution platform enabling CLI agent harnesses (Claude Code, AGY CLI, Codex, Cursor, Windsurf) to safely inspect personal graph context and execute domain tasks through a shared, validated service layer. Milestone 2.0 progresses through 6 focused capability phases: refactoring domain services and delivering the Headless CLI (Phase 10), deploying the Model Context Protocol (MCP) server (Phase 11), providing a discoverable Skills Engine and documentation retrieval layer (Phase 12), implementing a Zero-Trust Agent Safety and attribution boundary (Phase 13), establishing a controlled Project Workspace and development execution harness (Phase 14), and expanding quick-capture ergonomics with Mobile PWA and Web Speech voice dictation (Phase 15).

## Phases

**Phase Numbering:** Continuing from Milestone 1.0 (Phases 1–9 complete). Milestone 2.0 covers Phases 10–15.

- [ ] **Phase 10: Shared Application Services & Headless CLI** - Pure headless service contracts, CLI runner foundation, entity CRUD commands, unified context inspection (`lifeos context`), and daily planning workflows.
- [ ] **Phase 11: LifeOS Model Context Protocol (MCP) Server** - Standard stdio MCP transport, personal graph context resources (`lifeos://context/*`), structured tools delegating to canonical domain services, and agent session negotiation.
- [ ] **Phase 12: Skills Engine & Contextual Documentation Retrieval** - Curated procedural skills registry (`skills/lifeos/*`), machine-readable frontmatter, and contextual documentation search over `.planning/` and architecture specifications.
- [ ] **Phase 13: Zero-Trust Agent Safety, Permissions & Attribution Audit** - Five-tier agent capability permissions, mandatory HITL approval gates for high-impact mutations, zero-trust financial shield, time-bound challenge expiration, and granular `agent_audit_log`.
- [ ] **Phase 14: Controlled Project Workspace & Development Execution Harness** - Project root sandboxing, controlled test/build execution runner, plan-to-task materialization, and pre-commit verification gates.
- [ ] **Phase 15: Mobile PWA & Voice Dictation Quick Capture** - Web App Manifest, offline service worker caching with IndexedDB sync, and native Web Speech API voice capture in universal quick capture modal.

---

## Phase Details

### Phase 10: Shared Application Services & Headless CLI

**Goal**: Decouple domain orchestration into a pure, headless application service layer and deliver the first-class `lifeos` CLI with deterministic command syntax, structured JSON/tabular outputs, and command-line execution for goals, projects, tasks, daily planning, and system status.
**Depends on**: Milestone 1.0 v1 baseline (Phases 1–9)
**Requirements**: CLI-01, CLI-02, CLI-03, CLI-04, CLI-05
**Success Criteria** (what must be TRUE):
1. User can run `lifeos context` or `lifeos status` from the command line and view active goals, projects, prioritized tasks, and calendar blocks.
2. Passing `--json` to any `lifeos` command returns deterministic, machine-readable JSON suitable for CLI agent parsing.
3. User can create, update, list, and filter tasks, projects, goals, notes, and habits from the terminal with input validation against existing domain Zod schemas.
4. User can complete the morning planning and evening review workflows directly from the terminal via `lifeos plan morning` and `lifeos plan evening`.
5. CLI commands strictly invoke the same domain services (`src/server/*`) as the web application, preventing duplicate business logic.

**Plans**: 3 plans
**UI hint**: no (CLI / Server)

Plans:
- [ ] **10-01: Shared Domain Service Contracts & Standalone CLI Runner Foundation**
  - **Objective**: Establish pure domain service contracts and a standalone TypeScript CLI executable (`bin/lifeos.ts` / `src/cli/`) supporting session token auth, configuration loading, and standard error handling.
  - **Files**: `src/cli/index.ts`, `src/cli/config.ts`, `src/cli/formatters.ts`, `src/server/tasks/service.ts`, `src/server/projects/service.ts`, `package.json`
  - **Dependencies**: Milestone 1.0 server services
  - **Requirements**: CLI-01, CLI-02
  - **Verification**: `scripts/tests/phase-10/plan-01/cli-runner.test.ts` testing auth token validation, formatting modes (tabular vs JSON), and exit code contracts.
- [ ] **10-02: Headless CLI Commands for Entity CRUD, Context Inspection & Daily Planning**
  - **Objective**: Implement CLI subcommands for entity management (`lifeos tasks`, `lifeos projects`, `lifeos goals`, `lifeos habits`, `lifeos notes`), context aggregation (`lifeos context`, `lifeos status`), and daily planning (`lifeos plan morning`, `lifeos plan evening`).
  - **Files**: `src/cli/commands/context.ts`, `src/cli/commands/tasks.ts`, `src/cli/commands/projects.ts`, `src/cli/commands/goals.ts`, `src/cli/commands/plan.ts`
  - **Dependencies**: Plan 10-01
  - **Requirements**: CLI-03, CLI-04, CLI-05
  - **Verification**: `scripts/tests/phase-10/plan-02/cli-commands.test.ts` verifying argument parsing, Zod validation, entity mutations, and output structures.
- [ ] **10-03: CLI Integration & Regression Test Suite**
  - **Objective**: Verify end-to-end command execution against a test database, ensuring zero regression across existing web routes and service contracts.
  - **Files**: `scripts/tests/phase-10/plan-03/cli-integration.test.ts`
  - **Dependencies**: Plan 10-02
  - **Requirements**: CLI-01, CLI-02, CLI-03, CLI-04, CLI-05
  - **Verification**: Complete CLI integration test suite running with Vitest.

---

### Phase 11: LifeOS Model Context Protocol (MCP) Server

**Goal**: Implement a dedicated, secure MCP server exposing standard resources, prompts, and tools for compatible agent harnesses (Claude Code, AGY CLI, Codex, Cursor, Windsurf) to inspect personal graph context and invoke validated domain operations through the shared service boundary.
**Depends on**: Phase 10
**Requirements**: MCP-01, MCP-02, MCP-03, MCP-04, MCP-05
**Success Criteria** (what must be TRUE):
1. MCP client harnesses can connect to `lifeos mcp` via stdio transport and complete the MCP protocol handshake.
2. Agent harnesses can read resources (`lifeos://context/overview`, `lifeos://tasks/today`, etc.) and receive accurate, fresh personal graph state.
3. Agent harnesses can invoke structured tools (`lifeos_create_task`, `lifeos_update_task`, etc.) which execute safely through canonical application services.
4. MCP tool handlers enforce authenticated `user_id` ownership checks and prevent direct SQL execution or bypass.
5. All MCP connections require valid authentication tokens and log connection/disconnection lifecycle events.

**Plans**: 4 plans
**UI hint**: no (MCP Server)

Plans:
- [ ] **11-01: MCP Server Foundation, Transport & Security Handshake**
  - **Objective**: Set up the Model Context Protocol server using `@modelcontextprotocol/sdk` over stdio transport with encrypted token authentication and capability negotiation.
  - **Files**: `src/server/mcp/server.ts`, `src/server/mcp/transport.ts`, `src/server/mcp/auth.ts`, `src/server/mcp/types.ts`
  - **Dependencies**: Phase 10 CLI foundation
  - **Requirements**: MCP-01, MCP-05
  - **Verification**: `scripts/tests/phase-11/plan-01/mcp-handshake.test.ts` verifying protocol handshake, auth failure rejection, and capability negotiation.
- [ ] **11-02: MCP Personal Graph Resources & Standard Prompts**
  - **Objective**: Implement standard MCP URI resources (`lifeos://context/overview`, `lifeos://goals/active`, `lifeos://projects/active`, `lifeos://tasks/today`, `lifeos://finance/summary`) and prompt templates for planning and task breakdown.
  - **Files**: `src/server/mcp/resources/context.ts`, `src/server/mcp/resources/entities.ts`, `src/server/mcp/prompts/planning.ts`
  - **Dependencies**: Plan 11-01
  - **Requirements**: MCP-02
  - **Verification**: `scripts/tests/phase-11/plan-02/mcp-resources.test.ts` verifying resource resolution, serialization, and freshness.
- [ ] **11-03: MCP Domain Tools Registry & Canonical Service Adapters**
  - **Objective**: Register MCP tools (`lifeos_create_task`, `lifeos_update_task`, `lifeos_create_goal`, `lifeos_create_project`, `lifeos_create_note`, `lifeos_search`) with strict Zod argument schemas delegating directly to domain services.
  - **Files**: `src/server/mcp/tools/task-tools.ts`, `src/server/mcp/tools/project-tools.ts`, `src/server/mcp/tools/goal-tools.ts`, `src/server/mcp/tools/search-tools.ts`, `src/server/mcp/tools/registry.ts`
  - **Dependencies**: Plan 11-02
  - **Requirements**: MCP-03, MCP-04
  - **Verification**: `scripts/tests/phase-11/plan-03/mcp-tools.test.ts` verifying tool validation, execution, and zero-bypass guarantees.
- [ ] **11-04: MCP End-to-End Test Suite & Client Harness Verification**
  - **Objective**: Verify end-to-end MCP client integration scenarios using a simulated MCP client harness.
  - **Files**: `scripts/tests/phase-11/plan-04/mcp-client-e2e.test.ts`
  - **Dependencies**: Plan 11-03
  - **Requirements**: MCP-01, MCP-02, MCP-03, MCP-04, MCP-05
  - **Verification**: Automated test asserting full client-to-server conversation, tool call execution, and state persistence.

---

### Phase 12: Skills Engine & Contextual Documentation Retrieval

**Goal**: Provide machine-discoverable procedural skills (`skills/lifeos/*`) and dynamic documentation retrieval mechanisms allowing external agents to search, retrieve, and follow domain rules, planning workflows, and architectural constraints without whole-repo context dumping.
**Depends on**: Phase 10, Phase 11
**Requirements**: SKILL-01, SKILL-02, SKILL-03, SKILL-04
**Success Criteria** (what must be TRUE):
1. Curated procedural skills exist in `skills/lifeos/` covering task decomposition, goal alignment, weekly reviews, and code verification.
2. Each skill exposes standardized YAML frontmatter queryable via CLI (`lifeos skills list`) and MCP tool (`lifeos_get_skill`).
3. External agents can query `lifeos docs search [query]` and receive top matching ADRs, domain specifications, and phase documentation using hybrid search.
4. Agents can inspect `.planning/` state (current milestone, completed summaries, pending todos) via dedicated skill context helpers.

**Plans**: 3 plans
**UI hint**: no (Skills / Docs Engine)

Plans:
- [ ] **12-01: Curated Procedural Skills Registry & Metadata Engine**
  - **Objective**: Author domain procedural skills in `skills/lifeos/` (task-breakdown, goal-alignment, weekly-review, error-diagnosis) with YAML frontmatter parser and validation schema.
  - **Files**: `skills/lifeos/*/SKILL.md`, `src/server/skills/registry.ts`, `src/server/skills/parser.ts`, `src/server/skills/types.ts`
  - **Dependencies**: Phase 10 CLI
  - **Requirements**: SKILL-01, SKILL-02
  - **Verification**: `scripts/tests/phase-12/plan-01/skills-registry.test.ts` verifying frontmatter validation, parsing, and trigger condition matching.
- [ ] **12-02: Contextual Documentation Search & Planning Graph Integration**
  - **Objective**: Build documentation search service indexing architecture specs, ADRs, and `.planning/` artifacts, integrating with hybrid search and `.planning/` state inspectors.
  - **Files**: `src/server/docs/search-service.ts`, `src/server/docs/planning-inspector.ts`, `src/cli/commands/docs.ts`, `src/server/mcp/tools/doc-tools.ts`
  - **Dependencies**: Plan 12-01
  - **Requirements**: SKILL-03, SKILL-04
  - **Verification**: `scripts/tests/phase-12/plan-02/doc-search.test.ts` asserting retrieval relevance, planning state extraction, and ranking.
- [ ] **12-03: Skills & Documentation Retrieval Verification Suite**
  - **Objective**: Full integration test asserting agent discovery of skills and relevant doc retrieval for simulated prompts.
  - **Files**: `scripts/tests/phase-12/plan-03/skills-integration.test.ts`
  - **Dependencies**: Plan 12-02
  - **Requirements**: SKILL-01, SKILL-02, SKILL-03, SKILL-04
  - **Verification**: Vitest suite confirming skill execution contracts and document retrieval benchmarks.

---

### Phase 13: Zero-Trust Agent Safety, Permissions & Attribution Audit

**Goal**: Establish strict multi-tier agent capability boundaries (READ, WRITE, EXECUTE, DESTRUCTIVE, SENSITIVE), enforce mandatory human-in-the-loop (HITL) approval gates with expiration for high-impact mutations, prevent financial domain bypass, and record comprehensive audit logs attributing every agent-driven action.
**Depends on**: Phase 10, Phase 11
**Requirements**: SAFE-01, SAFE-02, SAFE-03, SAFE-04, SAFE-05
**Success Criteria** (what must be TRUE):
1. Operations requiring DESTRUCTIVE or SENSITIVE permissions are intercepted, held in pending challenge state, and rejected unless approved by human confirmation.
2. Financial domain ledger mutations and account transfers are blocked for agent callers with a strict read-only financial shield.
3. Unconfirmed mutation challenges expire automatically after TTL (default 10 minutes) and become impossible to execute.
4. `agent_audit_log` records every agent-initiated tool call or CLI command with provider, session, tool name, arguments, diff, and outcome.
5. Forward database migration (0027_...) applies cleanly without disturbing historical migrations 0000–0026.

**Plans**: 4 plans
**UI hint**: yes (Approval Card / Notification Integration)

Plans:
- [ ] **13-01: Forward Database Migration for Agent Tokens, Scopes & Audit Log**
  - **Objective**: Create safe forward migration `0027_agent_safety_and_audit` defining `agent_tokens`, `agent_permissions`, `agent_challenges`, and `agent_audit_log` tables with composite indexes.
  - **Files**: `src/server/db/schema/agents.ts`, `src/server/db/schema/index.ts`, `src/server/db/migrations/0027_agent_safety_and_audit.sql`, `src/server/db/migrations/meta/_journal.json`
  - **Dependencies**: Phase 11 MCP server
  - **Requirements**: SAFE-01, SAFE-04
  - **Verification**: `scripts/tests/phase-13/plan-01/schema-migration.test.ts` verifying journal integrity, table creation, and constraints.
- [ ] **13-02: Multi-Tier Permission Evaluator & Zero-Trust Financial Shield**
  - **Objective**: Implement permission evaluation middleware classifying actions into READ, WRITE, EXECUTE, DESTRUCTIVE, SENSITIVE and completely blocking mutating financial actions for agent callers.
  - **Files**: `src/server/agents/permissions/evaluator.ts`, `src/server/agents/permissions/types.ts`, `src/server/agents/finance-shield.ts`
  - **Dependencies**: Plan 13-01
  - **Requirements**: SAFE-01, SAFE-03
  - **Verification**: `scripts/tests/phase-13/plan-02/permission-evaluator.test.ts` asserting permission denials, tier boundaries, and finance mutation blocks.
- [ ] **13-03: HITL Approval Challenge Lifecycle & TTL Expiration Engine**
  - **Objective**: Implement challenge generation, notification dispatch, database locking (`SELECT ... FOR UPDATE`), and automatic TTL expiration sweeper for unconfirmed high-impact agent operations.
  - **Files**: `src/server/agents/challenges/challenge-service.ts`, `src/server/agents/challenges/ttl-sweeper.ts`, `src/components/assistant/action-confirmation-card.tsx`
  - **Dependencies**: Plan 13-02
  - **Requirements**: SAFE-02, SAFE-05
  - **Verification**: `scripts/tests/phase-13/plan-03/challenge-lifecycle.test.ts` verifying approval gating, rejection, expiration, and race prevention.
- [ ] **13-04: Agent Attribution Audit Logger & Security Integration Suite**
  - **Objective**: Implement transactional agent attribution logger recording detailed pre/post state snapshots, and write comprehensive adversarial integration test suite.
  - **Files**: `src/server/agents/audit/attribution-logger.ts`, `scripts/tests/phase-13/plan-04/agent-security.integration.test.ts`
  - **Dependencies**: Plan 13-03
  - **Requirements**: SAFE-01, SAFE-02, SAFE-03, SAFE-04, SAFE-05
  - **Verification**: Adversarial security suite verifying permission bypass attempts, token hijacking defenses, and audit log completeness.

---

### Phase 14: Controlled Project Workspace & Development Execution Harness

**Goal**: Provide a sandboxed, project-scoped execution harness for external agents to inspect repository state, plan work into LifeOS tasks, safely run test/build/type-check workflows, and commit verified code changes with strict host isolation and permission constraints.
**Depends on**: Phase 10, Phase 13
**Requirements**: WORK-01, WORK-02, WORK-03, WORK-04
**Success Criteria** (what must be TRUE):
1. Agent commands are strictly restricted to the project workspace directory with path traversal attempts rejected.
2. Execution harness executes project verification commands (`pnpm test`, `tsc --noEmit`, `pnpm build`) and captures structured failure/success logs.
3. Agents can convert approved implementation plans into structured, prioritized LifeOS tasks linked to projects.
4. Git commit operations by agents are blocked unless verification commands report 0 errors.

**Plans**: 3 plans
**UI hint**: no (Harness / Tooling)

Plans:
- [ ] **14-01: Project Workspace Isolation Sandbox & Command Runner**
  - **Objective**: Implement workspace path containment and execution runner with process timeouts, output buffering, and prohibited command blocklists (e.g. `rm -rf /`, arbitrary curl piped to bash).
  - **Files**: `src/server/agents/workspace/sandbox.ts`, `src/server/agents/workspace/command-runner.ts`, `src/server/agents/workspace/types.ts`
  - **Dependencies**: Phase 13 safety layer
  - **Requirements**: WORK-01, WORK-02
  - **Verification**: `scripts/tests/phase-14/plan-01/workspace-sandbox.test.ts` verifying path containment, blocklist enforcement, and timeout handling.
- [ ] **14-02: Plan-to-Task Materialization & Pre-Commit Verification Gate**
  - **Objective**: Implement plan parser that materializes structured LifeOS tasks with dependencies, and a verification gate that asserts clean `tsc` and test results before allowing commit actions.
  - **Files**: `src/server/agents/workspace/plan-materializer.ts`, `src/server/agents/workspace/commit-gate.ts`, `src/cli/commands/workspace.ts`
  - **Dependencies**: Plan 14-01
  - **Requirements**: WORK-03, WORK-04
  - **Verification**: `scripts/tests/phase-14/plan-02/commit-gate.test.ts` verifying plan task creation and commit blocking on test failures.
- [ ] **14-03: Development Execution Harness Integration Suite**
  - **Objective**: Verify end-to-end agent development workflow: plan reading → task generation → command execution → verification → commit gating.
  - **Files**: `scripts/tests/phase-14/plan-03/workspace-integration.test.ts`
  - **Dependencies**: Plan 14-02
  - **Requirements**: WORK-01, WORK-02, WORK-03, WORK-04
  - **Verification**: Full Vitest integration test suite simulating agent workflow.

---

### Phase 15: Mobile PWA & Voice Dictation Quick Capture

**Goal**: Enable instant mobile capture and offline accessibility through a Progressive Web App (PWA) manifest with service worker caching for offline task/note creation and native Web Speech API voice capture dictating thoughts directly into structured inbox items.
**Depends on**: Milestone 1.0 Phase 2, Phase 6
**Requirements**: MOB-01, MOB-02, MOB-03, MOB-04
**Success Criteria** (what must be TRUE):
1. Application is installable as a PWA on mobile browsers with a valid `manifest.json` and service worker caching static shell assets.
2. User can capture tasks and notes while offline, with records stored in IndexedDB and automatically synced to PostgreSQL upon reconnect.
3. Quick capture modal includes a microphone button that transcribes speech into text using the browser's native Web Speech API.
4. Spoken text is automatically parsed by the NLP quick-capture service to extract task title, priority, due date, and tags without manual typing.

**Plans**: 3 plans
**UI hint**: yes (PWA / Voice UI)

Plans:
- [ ] **15-01: Progressive Web App Manifest, Service Worker & Offline Sync Engine**
  - **Objective**: Configure Web App Manifest, service worker for shell caching, and client-side IndexedDB queue with background sync on online event.
  - **Files**: `public/manifest.json`, `src/app/manifest.ts`, `src/lib/pwa/service-worker.ts`, `src/lib/pwa/offline-store.ts`, `src/lib/pwa/sync-manager.ts`
  - **Dependencies**: Milestone 1.0 shell
  - **Requirements**: MOB-01, MOB-02
  - **Verification**: `scripts/tests/phase-15/plan-01/offline-sync.test.ts` verifying IndexedDB queuing, online event triggers, and API sync.
- [ ] **15-02: Web Speech API Voice Dictation & NLP Quick Capture Integration**
  - **Objective**: Integrate speech recognition hook in `quick-capture-modal.tsx` with recording indicator, interim transcripts, and automatic delegation to NLP quick-capture parser.
  - **Files**: `src/hooks/use-speech-recognition.ts`, `src/components/quick-capture-modal.tsx`, `src/components/voice/voice-dictation-button.tsx`
  - **Dependencies**: Plan 15-01
  - **Requirements**: MOB-03, MOB-04
  - **Verification**: `scripts/tests/phase-15/plan-02/voice-dictation.test.ts` testing transcript handling, fallback when Web Speech is unsupported, and NLP parsing linkage.
- [ ] **15-03: Mobile Capture & PWA End-to-End Verification Suite**
  - **Objective**: Verify offline capture recovery, speech-to-task creation flow, and mobile responsive layout compliance.
  - **Files**: `scripts/tests/phase-15/plan-03/mobile-capture-e2e.test.ts`
  - **Dependencies**: Plan 15-02
  - **Requirements**: MOB-01, MOB-02, MOB-03, MOB-04
  - **Verification**: Vitest component and service integration tests validating offline-to-online reconciliation and voice NLP extraction.

---

## Database Architecture & Vertical-Slice Rule

Milestone 2.0 strictly maintains the vertical-slice schema evolution rules and migration integrity:

1. **Forward Migrations Only**: All new schema additions (Phase 13: `agent_tokens`, `agent_permissions`, `agent_challenges`, `agent_audit_log`) MUST be introduced via safe forward migration `0027_agent_safety_and_audit.sql` and appended to `_journal.json`.
2. **Preserve Migration History**: Historical migrations 0000–0026 are immutable. Absent Drizzle Kit intermediate snapshots for 0012–0026 are recognized as non-blocking technical debt and must NOT be casually modified or regenerated without a verified schema-introspection baseline.
3. **No Direct SQL in Agents/CLI/MCP**: Database mutations MUST flow through domain services (`src/server/*`) enforcing authenticated `user_id` ownership checks.
4. **Single-Tenant Foreign Key Hygiene**: All new tables must retain composite or direct `user_id` foreign keys with `ON DELETE CASCADE` or `ON DELETE RESTRICT` as domain semantics dictate.

## Progress

**Execution Order:**
Phases execute in numeric order: 10 → 11 → 12 → 13 → 14 → 15

| Phase | Plans Complete | Status | Completed |
|---|---|---|---|
| 10. Shared Application Services & Headless CLI | 0/3 | Planned | - |
| 11. LifeOS Model Context Protocol (MCP) Server | 0/4 | Planned | - |
| 12. Skills Engine & Contextual Documentation Retrieval | 0/3 | Planned | - |
| 13. Zero-Trust Agent Safety, Permissions & Attribution Audit | 0/4 | Planned | - |
| 14. Controlled Project Workspace & Development Execution Harness | 0/3 | Planned | - |
| 15. Mobile PWA & Voice Dictation Quick Capture | 0/3 | Planned | - |

---
*Roadmap defined: 2026-09-30*
*Milestone: v2.0 Autonomous Intelligence & Agent Interface*
