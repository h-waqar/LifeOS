---
phase: 11-lifeos-model-context-protocol-mcp-server
plan: 03
one-liner: MCP domain mutation and search tools delegating directly to canonical services with caller spoofing rejection
requirements-completed:
  - MCP-03
  - MCP-04
key-files:
  created:
    - src/server/mcp/tools/task-tools.ts
    - src/server/mcp/tools/project-tools.ts
    - src/server/mcp/tools/goal-tools.ts
    - src/server/mcp/tools/note-tools.ts
    - src/server/mcp/tools/search-tools.ts
    - src/server/mcp/tools/habit-tools.ts
    - src/server/mcp/tools/registry.ts
    - scripts/tests/phase-11/plan-03/mcp-tools.test.ts
key-decisions:
  - "Financial Shield in MCP: Prohibit financial write tools; enforce zero-bypass service delegation"
---

# Plan 11-03: MCP Domain Tools & Canonical Service Adapters — Summary

## Execution Summary

Plan 11-03 implemented the 10 approved domain mutation and search tools for the LifeOS Model Context Protocol server, adhering strictly to the zero-bypass canonical service architecture and fulfilling requirements MCP-03 and MCP-04.

### Key Deliverables Implemented

1. **Domain Tools Registry & Architecture (`src/server/mcp/tools/registry.ts`)**:
   - Registered exactly 10 domain tools matching approved specifications:
     - Tasks: `lifeos_create_task`, `lifeos_update_task`, `lifeos_delete_task`
     - Projects: `lifeos_create_project`, `lifeos_update_project`
     - Goals: `lifeos_create_goal`, `lifeos_update_goal`
     - Notes: `lifeos_create_note`
     - Search: `lifeos_search`
     - Habits: `lifeos_log_habit`
   - Strict Architectural Rules:
     - MCP handlers call canonical application services directly (`src/server/*`).
     - Never import or wrap CLI presentation logic (`src/cli/commands/*`).
     - Never execute raw SQL or mutate database tables directly.
     - Zero financial mutation tools (finance remains strictly read-only).

2. **Caller Identity Spoofing Protection**:
   - Built `assertNoCallerSpoofing()` check inspecting incoming argument keys.
   - Configured tool input schemas with `.passthrough()` to intercept any caller-injected `userId`, `user_id`, `user-id`, or `userid` prior to Zod schema stripping, rejecting requests with exit/error code `USAGE_ERROR`.
   - Identity is strictly injected into domain services using `context.user.id`.

3. **Canonical Service Adapters (`src/server/mcp/tools/*`)**:
   - `task-tools.ts`: Wraps `createTask`, `updateTask`, `deleteTask` with Zod schemas aligned with `createTaskSchema` and `updateTaskSchema`.
   - `project-tools.ts`: Wraps `createProject`, `updateProject` with Zod schemas aligned with `createProjectSchema` and `updateProjectSchema`.
   - `goal-tools.ts`: Wraps `createGoal`, `updateGoal` with Zod schemas aligned with `createGoalSchema` and `updateGoalSchema`.
   - `note-tools.ts`: Wraps `createNote` with Zod schemas aligned with `createNoteSchema`.
   - `search-tools.ts`: Wraps `unifiedSearch` across tasks, projects, notes, and habits with relevance scoring.
   - `habit-tools.ts`: Wraps `logHabitEntry` with `logHabitEntrySchema` validation.

4. **Secret Scrubbing Enhancements (`src/cli/errors.ts`)**:
   - Enhanced `scrubSecrets()` with regex patterns redacting URL embedded credentials (`postgresql://user:pass@host:port/db`) and 64-character hex strings (`\b[a-f0-9]{64}\b`) to protect database connection strings and symmetric encryption keys in error messages.

5. **Automated Unit & Contract Tests (`scripts/tests/phase-11/plan-03/mcp-tools.test.ts`)**:
   - 17/17 tests passing verifying tool registration, argument validation, caller spoofing rejection, service delegation, error formatting, and secret scrubbing.

---

## Verification Results

| Check | Command | Result |
|-------|---------|--------|
| TypeScript | `pnpm exec tsc --noEmit` | PASS (0 errors) |
| Plan 11-03 Tests | `pnpm test scripts/tests/phase-11/plan-03/mcp-tools.test.ts` | PASS (17/17 passed) |
| Tool Schema Validation | All 10 tools validate valid inputs & reject malformed inputs | PASS |
| Spoofing Interception | Attempts to pass `userId`/`user_id`/`user-id` fail closed | PASS |
| Financial Isolation | Prohibited financial mutation tools absent from tool list | PASS |
