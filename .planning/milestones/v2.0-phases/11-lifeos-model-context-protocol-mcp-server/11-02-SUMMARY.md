---
phase: 11-lifeos-model-context-protocol-mcp-server
plan: 02
one-liner: Canonical personal graph resources and standard planning prompts with deterministic key-sorted serialization
requirements-completed:
  - MCP-02
key-files:
  created:
    - src/server/mcp/formatters.ts
    - src/server/mcp/resources/context.ts
    - src/server/mcp/resources/entities.ts
    - src/server/mcp/resources/registry.ts
    - src/server/mcp/prompts/planning.ts
    - src/server/mcp/prompts/registry.ts
    - scripts/tests/phase-11/plan-02/mcp-resources.test.ts
key-decisions:
  - "Resource URI Design: Canonical lifeos://context/* resources with standard aliases"
---

# Plan 11-02: MCP Personal Graph Resources & Standard Prompts — Summary

## Execution Summary

Plan 11-02 implemented personal graph context resources and standard planning prompts for the LifeOS Model Context Protocol server, fulfilling requirement MCP-02.

### Key Deliverables Implemented

1. **Deterministic Serialization & Secret Scrubbing Boundary (`src/server/mcp/formatters.ts`)**:
   - `serializeDeterministicJson()`: Deep deterministic key-sorting, secret-scrubbing (passwords, tokens, cookies, database URLs, 64-hex encryption keys), and formatted JSON serialization.
   - `formatMcpResource()`: Produces SDK-compliant MCP resource payloads (`uri`, `mimeType: "application/json"`, `text`).
   - `formatMcpToolResponse()` & `formatMcpToolError()`: Uniform, secret-safe tool response wrappers.

2. **Canonical Personal Graph Resources (`src/server/mcp/resources/context.ts`, `entities.ts`, `registry.ts`)**:
   - Registered 7 primary canonical resources and 6 standard convenience aliases via the official `McpServer.resource()` SDK API:
     - `lifeos://context/overview`: Unified personal context across active goals, projects, top tasks, today's schedule blocks, and unread notifications.
     - `lifeos://context/tasks/today` (alias: `lifeos://tasks/today`): Tasks scheduled for today or overdue (bounded to 50 items).
     - `lifeos://context/goals/active` (alias: `lifeos://goals/active`): In-progress and active goals (bounded to 50 items).
     - `lifeos://context/projects/active` (alias: `lifeos://projects/active`): Active projects with milestone counts (bounded to 50 items).
     - `lifeos://context/finance/summary` (alias: `lifeos://finance/summary`): Financial report summary (total income, expenses, net savings, budget utilization; read-only aggregate).
     - `lifeos://context/daily-plan` (alias: `lifeos://daily-plan`): Today's active daily plan record with habits and schedule.
     - `lifeos://context/notifications` (alias: `lifeos://notifications`): Recent notifications (bounded to 20 items).
   - Strict bounded query guarantees to prevent oversized context frames.
   - All handlers strictly query through canonical domain services scoped to `context.user.id`.

3. **Standard Planning Prompts (`src/server/mcp/prompts/planning.ts`, `registry.ts`)**:
   - `lifeos_morning_planning`: Generates system and user prompts incorporating today's schedule, overdue/high-priority tasks, and active goals.
   - `lifeos_evening_review`: Generates review prompts comparing daily intentions against completed tasks, logged habits, and rollover candidates.
   - `lifeos_task_breakdown`: Takes `taskId` parameter, fetches task and related project context, and instructs the agent to produce actionable sub-steps.

4. **Automated Unit & Contract Tests (`scripts/tests/phase-11/plan-02/mcp-resources.test.ts`)**:
   - 13/13 tests passing verifying canonical resource registration, URI alias resolution, deterministic key ordering, bounded result sizes, user isolation, and prompt generation structures.

---

## Verification Results

| Check | Command | Result |
|-------|---------|--------|
| TypeScript | `pnpm exec tsc --noEmit` | PASS (0 errors) |
| Plan 11-02 Tests | `pnpm test scripts/tests/phase-11/plan-02/mcp-resources.test.ts` | PASS (13/13 passed) |
| Resource Readability | All 7 resources & 6 aliases read successfully | PASS |
| Prompt Generation | All 3 standard prompts return valid role/content messages | PASS |
