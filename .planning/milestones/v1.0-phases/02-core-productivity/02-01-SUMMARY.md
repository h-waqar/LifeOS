# Plan 02-01 Summary: Task Management Engine, Priority Scoring, and Universal Quick Capture

- **Phase:** 02 — Core Productivity
- **Plan Identification:** 02-01
- **Domain:** Task Management
- **Status:** Completed & Verified
- **Date Completed:** 2026-09-14
- **Requirements Satisfied:** TASK-01, TASK-02, TASK-03, TASK-04, TASK-05, TASK-06, TASK-07, TASK-08

---

## 1. Executive Summary

Plan 02-01 elevated the canonical Phase 1 `tasks` model into an advanced productivity engine. It delivered:
1. **Vertical-Slice Schema Evolution:** Extended `tasks` with `scheduled_date`, `energy_level`, `recurrence_rule`, `goal_id`, `habit_id`, `note_id`, `person_id`, and `tags`. Created the `task_dependencies` join table with foreign key isolation on `(user_id, task_id)` and an automated PostgreSQL trigger (`trg_task_dependencies_prevent_cycle`) preventing graph cycles up to depth 50.
2. **Deterministic Priority Scoring:** Implemented pure Eisenhower + deadline + effort + dependency weighting formula ($[0, 250]$ bounded score) with strict tie-breaking. Scores are computed dynamically at query time to prevent cache invalidation hazards.
3. **Recurrence Engine:** Built frequency calculation (daily, weekly with specific days of week, monthly with month-end date clamping, interval, count, end-date bounds) and wired atomic next-instance creation upon completing a recurring task.
4. **Universal Quick Capture:** Implemented an inline syntax token parser (`!priority`, `^due`, `*scheduled`, `@energy`, `#project`, `~duration`, `+tags`) with a global keyboard-accessible modal (`Q`/`C` hotkeys and Command Palette `Cmd+K` integration) and a dedicated `POST /api/tasks/quick-capture` endpoint.
5. **UI & Multi-Criteria Filtering:** Extended `src/app/tasks/page.tsx` with dynamic `ScoreBadge`, `EnergyBadge`, blocked dependency alerts, task dependency management modal, and sorting by priority score.
6. **Zero-Defect Quality Verification:** 88 dedicated tests across 4 unit suites and 3 integration suites. 100% test pass rate across the entire repository (322 unit tests, 245 integration tests, Next.js production build `pnpm build` clean).

---

## 2. Deliverables & Architectural Implementation

### 2.1 Database Schema & Migrations
- **File:** `src/server/db/schema/tasks.ts`
  - Added `scheduledDate` (`timestamp with time zone`).
  - Added `energyLevel` (`text enum ['low', 'medium', 'high']`).
  - Added `recurrenceRule` (`jsonb` with schema `{ frequency, interval, daysOfWeek?, endDate?, count? }`).
  - Added forward-compatible link identifiers: `goalId`, `habitId`, `noteId`, `personId`, and `tags` (`jsonb` string array).
  - Defined `taskDependencies` table with composite foreign keys `(userId, taskId)` and `(userId, dependsOnTaskId)` referencing `tasks(userId, id)`, preventing cross-user dependency declarations.
- **Migration:** `src/server/db/migrations/0007_task_management_extensions.sql`
  - Applied schema changes and installed PostgreSQL recursive CTE trigger function `check_task_dependency_cycle()` and trigger `trg_task_dependencies_prevent_cycle`.
  - Reversible and idempotent. Successfully executed via `npx tsx src/server/db/migrate.ts`.

### 2.2 Pure Calculation Engines
- **Priority Scoring Engine (`src/server/tasks/priority.ts`):**
  - Formula: $\text{BaseScore} + \text{DeadlineWeight} + \text{ScheduledWeight} + \text{ProjectWeight} + \text{EffortWeight} + \text{DependencyPenalty}$.
  - Base: Critical (100), High (70), Medium (40), Low (10).
  - Deadline: Overdue (+50 base + min(30, days*5)), Today (+40), Tomorrow (+25), This Week (+15), Next Week (+5).
  - Proximity: Scheduled today (+15).
  - Project alignment: Active project (+10).
  - Effort: Quick win <=15m (+5), Deep focus >60m (-5).
  - Blocked / Dependency penalty: -50 points.
  - Terminal filter: Completed or Cancelled tasks score 0.
  - Deterministic tie-breaker: `priorityScore` DESC $\rightarrow$ `dueDate` ASC $\rightarrow$ `priority` severity DESC $\rightarrow$ `createdAt` ASC $\rightarrow$ `id` ASC.
- **Recurrence Engine (`src/server/tasks/recurrence.ts`):**
  - Calculates next occurrence timestamp considering frequency (`daily`, `weekly`, `monthly`), interval multiplier, days of week selector, count limits, and end dates.
  - Implements month-end date clamping (e.g. Jan 31 + 1 month clamps to Feb 28/29).
- **Quick Capture Parser (`src/server/tasks/quick-capture.ts`):**
  - Parses shorthand string tokens:
    - Priority: `!p0` to `!p3`, `!critical`, `!high`, `!medium`, `!low`
    - Due Date: `^tomorrow`, `^today`, `^YYYY-MM-DD`
    - Scheduled Date: `*tomorrow`, `*today`, `*YYYY-MM-DD`
    - Energy: `@energy:low`, `@low`, `@medium`, `@high`
    - Project: `#Core`, `#project:name`
    - Duration: `~45m`, `~2h`, `~30`
    - Tags: `+work`, `+bug`
  - Strips parsed tokens cleanly to produce the human-readable task title.

### 2.3 Task Service Layer (`src/server/tasks/service.ts`)
- **`createTask` & `updateTask`:**
  - Extended to support all new Phase 2 fields.
  - Recurrence spawning: When a recurring task transitions to `status = 'completed'`, the service automatically calculates the next occurrence and inserts the next instance with identical project, priority, energy, estimated duration, recurrence rule (with decremented count if applicable), and resets `completedAt` and `actualDuration`.
- **`getTask` & `listTasks`:**
  - Injects dynamic `priorityScore` and checks for uncompleted blocking dependencies.
  - Supports multi-criteria filtering: `energyLevel`, `scheduledDate`, `overdue`, and sorting by `priorityScore`, `dueDate`, `priority`, `createdAt`.
- **Dependency Management:**
  - `addTaskDependency`: Inserts dependency with ownership isolation; intercepts PostgreSQL trigger cycle errors (`23514` / `Dependency cycle detected`) and translates them to HTTP 400 `AppError`.
  - `removeTaskDependency`: Deletes dependency with strict user ownership check.
  - `getTaskDependencies`: Retrieves both dependencies (prerequisites that block this task) and dependents (tasks blocked by this task).
- **`quickCaptureTask`:**
  - Parses raw string, resolves project name if provided, and atomically creates task in the user's workspace.

### 2.4 API Routes
- `GET /api/tasks`: Enhanced with query filters (`energyLevel`, `scheduledDate`, `overdue`, `sortBy=priorityScore`, `sortDir=asc|desc`).
- `POST /api/tasks/quick-capture`: Validates payload and invokes `quickCaptureTask`.
- `GET, POST /api/tasks/[id]/dependencies`: Lists dependencies and creates new dependency edges.
- `DELETE /api/tasks/[id]/dependencies/[dependsOnId]`: Removes dependency edge.

### 2.5 User Interface Components
- `src/components/ui/badge.tsx`: Added `ScoreBadge` (color-coded by score bands 150+, 100+, 50+, <50) and `EnergyBadge` (High, Medium, Low).
- `src/components/quick-capture-modal.tsx`: Global modal featuring real-time syntax token parsing pills, keyboard accessibility (Esc/Enter), and direct submission.
- `src/components/command-palette.tsx`: Added "Quick Capture Task" command.
- `src/components/app-shell.tsx`: Mounted `QuickCaptureModal` globally with keyboard shortcut listener (`Q` or `C`), sidebar quick capture button, and mobile quick capture trigger.
- `src/app/tasks/page.tsx`: Added score badges, energy badges, dependency warning pills, task dependency inspector modal, and filter controls for energy levels and priority score sorting.

---

## 3. Test Evidence & Verification Results

All tests strictly reside in `scripts/tests/phase-02/plan-01/` pursuant to the repository convention.

### 3.1 Unit Test Suites
| Test File | Tests | Status | Coverage Focus |
|---|---|---|---|
| `scripts/tests/phase-02/plan-01/priority-scoring.test.ts` | 29 | PASS | Base scores, overdue scaling/capping, proximity, effort, blocked penalty, deterministic tie-breaking |
| `scripts/tests/phase-02/plan-01/recurrence.test.ts` | 13 | PASS | Daily, weekly with daysOfWeek, monthly leap/end-of-month clamping, count and endDate bounds |
| `scripts/tests/phase-02/plan-01/quick-capture.test.ts` | 10 | PASS | Token parsing, energy, dates, project name, duration units, tags, clean title extraction |
| `scripts/tests/phase-02/plan-01/task-ui-interaction.test.tsx` | 16 | PASS | ScoreBadge tiers, EnergyBadge variants, QuickCaptureModal rendering, keyboard navigation, API submission, error handling |
| **Total Unit Tests** | **68** | **PASS** | |

### 3.2 Integration Test Suites (Against Live PostgreSQL Database)
| Test File | Tests | Status | Coverage Focus |
|---|---|---|---|
| `scripts/tests/phase-02/plan-01/task-dependencies.integration.test.ts` | 8 | PASS | Composite ownership isolation, direct cycle prevention, transitive cycle prevention (A->B->C->A), cascade deletion |
| `scripts/tests/phase-02/plan-01/quick-capture-api.integration.test.ts` | 7 | PASS | POST /api/tasks/quick-capture, token parsing to DB columns, authentication gate, project name matching |
| `scripts/tests/phase-02/plan-01/task-service-extensions.integration.test.ts` | 5 | PASS | Phase 2 column persistence, listTasks filtering by energy/schedule, recurring task completion spawning next instance |
| **Total Integration Tests** | **20** | **PASS** | |

### 3.3 Full System Verification
- **TypeScript Check (`npx tsc --noEmit`):** Clean, 0 errors.
- **Project Unit Suite (`pnpm test`):** 28 files, 322 tests passing.
- **Project Integration Suite (`pnpm test:integration`):** 20 files, 245 tests passing.
- **Production Build (`pnpm build`):** Clean build, static and dynamic routes compiled, zero warnings.

---

## 4. Key Learnings & Deviations

1. **Single-User Lock Invariant:** In LifeOS, registration of a second user is strictly rejected at the database level via a partial unique index (`single_user_lock`). Integration tests verifying authorization or cross-user boundaries must use generated UUIDs (e.g. `crypto.randomUUID()`) to simulate foreign user resources rather than registering a second user.
2. **Drizzle Error Wrapping on Triggers:** When a PostgreSQL trigger raises an exception (`RAISE EXCEPTION`), Drizzle wraps it in `DrizzleQueryError`. To inspect the Postgres code (`23514`) or custom message, code must check both `err.code` and `err.cause?.code`.
3. **Dynamic Priority vs Stored Score:** Priority scoring decays and escalates continuously over time as deadlines approach. Storing scores in database columns creates cache staleness. Computing the score in pure TypeScript during query time ensures 100% time accuracy, zero database write overhead, and deterministic ordering.
