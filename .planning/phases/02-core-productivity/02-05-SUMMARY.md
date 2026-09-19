# Plan 02-05 Summary: Daily Planning Morning Routine and Evening Review Workflow with Zero-Duplication Rollover

- **Phase:** 02 — Core Productivity
- **Plan Identification:** 02-05
- **Domain:** Daily Planning & Evening Review
- **Status:** Completed & Verified
- **Date Completed:** 2026-09-16
- **Requirements Satisfied:** PLAN-01, PLAN-02, PLAN-03, PLAN-04

---

## 1. Executive Summary

Plan 02-05 delivered the **Daily Planning Morning Routine and Evening Review Workflow** for LifeOS, complete with a **Zero-Duplication Rollover Engine**, **Pure Deterministic Productivity Scoring Engine**, **Interactive 4-Step Guided Steppers**, and **Historical Trend Analysis**.

The primary architectural constraint—**zero-duplication rollover**—was strictly enforced across the entire stack: unfinished tasks rolled over to tomorrow or rescheduled to a future date mutate the canonical task's `scheduledDate` directly in PostgreSQL, strictly preserving stable primary keys, dependencies, tags, and linked entity relationships without ever creating duplicate task rows or duplicate calendar time blocks.

### Key Deliverables:

1. **Schema Evolution & Multi-Tenant Composite Integrity (PLAN-01, PLAN-02):**
   - Created `daily_plans` and `evening_reviews` PostgreSQL tables in `src/server/db/schema/daily-plans.ts` adhering strictly to the vertical-slice database evolution rule.
   - Enforced database-level composite foreign key:
     `FOREIGN KEY (user_id, daily_plan_id) REFERENCES daily_plans(user_id, id) ON DELETE CASCADE`
   - Enforced composite unique constraints:
     - `daily_plans(user_id, date)`: One daily plan record per user per calendar day.
     - `evening_reviews(user_id, date)`: One evening review record per user per calendar day.
   - Enforced PostgreSQL database-level check constraints:
     - `daily_plans_status_check`: `status IN ('in_progress', 'completed')`
     - `evening_reviews_score_bounds`: `productivity_score >= 0 AND productivity_score <= 100`
   - Generated and executed migration `0011_daily_planning_and_evening_review.sql`.

2. **Pure Deterministic Productivity Scoring Engine (PLAN-02):**
   - Created `calculateProductivityScore` in `src/lib/productivity-score.ts` (re-exported via `src/server/daily-plan/productivity-score.ts`).
   - Pure mathematical implementation with zero database, zero API, and zero React dependencies.
   - Proportional dynamic weight redistribution: When a user has no scheduled time blocks or no habits, unallocated weight is distributed proportionally across active categories rather than unfairly penalizing or gifting points.
   - Exact integer rounding algorithm guaranteeing percentage weights sum to exactly 100%.

3. **Zero-Duplication Rollover Engine (PLAN-03):**
   - Implemented transactional rollover in `executeRollover` within `src/server/daily-plan/service.ts`.
   - Supported actions:
     - `carry_over`: Directly mutates `tasks.scheduledDate` to `targetDate` (defaults to tomorrow $D+1$).
     - `reschedule`: Directly mutates `tasks.scheduledDate` to specified future target ISO date.
     - `backlog`: Sets `tasks.scheduledDate = NULL`, returning the task to the backlog.
   - Strictly verifies task count before rollover === task count after rollover.
   - Updates `evening_reviews.rolled_over_task_ids` audit log of carried-over tasks.

4. **Service & API Layer (PLAN-01, PLAN-02, PLAN-03, PLAN-04):**
   - `getDailyPlan`: Aggregates today's plan, review, priority tasks, overdue tasks, active habits, and scheduled time blocks.
   - `saveMorningPlan`: Upserts daily plan with chosen priority task IDs, habit intentions, and morning focus notes. Automatically sets `scheduledDate` for priority tasks that had no schedule.
   - `completeEveningReview`: Records review reflections, subjective rating (1-10), task/habit completion IDs, and computes/persists productivity score.
   - `executeRollover`: Atomic zero-duplication rollover engine.
   - `getDailyPlanHistory`: Computes morning plan completion rate, evening review completion rate, average productivity score, and daily breakdown logs.
   - Endpoints:
     - `GET /api/daily-plan`: Context aggregator for any ISO date.
     - `POST /api/daily-plan`: Upsert morning plan.
     - `POST /api/daily-plan/evening-review`: Record evening review and score.
     - `POST /api/daily-plan/rollover`: Execute zero-duplication rollover.
     - `GET /api/daily-plan/history`: Retrieve aggregate trend metrics.

5. **Responsive UI & Dashboard Integration (PLAN-01, PLAN-02, PLAN-03, PLAN-04):**
   - `src/app/daily-plan/page.tsx`: Page shell with Suspense boundary, date navigation controls, and tab switcher (Morning Routine, Evening Review, History & Trends).
   - `src/components/daily-plan/morning-plan-view.tsx`: 4-step guided stepper:
     - Step 1: Review Overdue & Unfinished Work
     - Step 2: Pick 3–5 Priority Tasks
     - Step 3: Review Habit Intentions
     - Step 4: Time Blocking & Morning Commitment (with Save Draft and Lock In)
   - `src/components/daily-plan/evening-review-view.tsx`: 4-step guided stepper:
     - Step 1: Task Execution Review
     - Step 2: Habits Check-In
     - Step 3: Reflections & Live Productivity Scoring
     - Step 4: Zero-Duplication Rollover (Carry Over, Reschedule, Backlog)
     - Step 5: Celebratory summary screen
   - `src/components/daily-plan/daily-plan-history-view.tsx`: Summary metric chips (Morning Routine Rate, Evening Review Rate, Average Score) and historical log with reflection notes.
   - `src/app/dashboard/page.tsx`: Embedded "Daily Rituals & Execution" card widget (`dashboard-daily-routine-card`) displaying real-time status of today's morning routine and evening review with direct workflow links.
   - `src/components/app-shell.tsx`: Added "Daily Plan" sidebar and mobile navigation links (`nav-daily-plan`).
   - `src/components/command-palette.tsx`: Registered `cmd-daily-plan`, `cmd-morning-routine`, and `cmd-evening-review`.

---

## 2. Test Execution & Verification Summary

All verification gates passed with zero regressions:

| Suite | Scope | Target | Result |
|---|---|---|---|
| **Productivity Score Math Tests** | Pure mathematical scoring, weight redistribution, edge cases | `scripts/tests/phase-02/plan-05/productivity-score.test.ts` | **8/8 passed** |
| **Validation Schema Tests** | Zod input schemas, boundaries, constraints | `scripts/tests/phase-02/plan-05/daily-plan-validation.test.ts` | **12/12 passed** |
| **UI Unit & Interaction Tests** | Steppers, draft saving, live score, rollover actions, tabs | `scripts/tests/phase-02/plan-05/daily-plan-ui.test.tsx` | **9/9 passed** |
| **Schema Isolation Tests** | Composite FKs, multi-tenant isolation, unique constraints | `scripts/tests/phase-02/plan-05/daily-plan-schema-isolation.integration.test.ts` | **6/6 passed** |
| **Service Integration Tests** | Save morning plan, evening review, zero-duplication rollover | `scripts/tests/phase-02/plan-05/daily-plan-service.integration.test.ts` | **7/7 passed** |
| **API Integration Tests** | Route handlers, auth guards, input validation, context | `scripts/tests/phase-02/plan-05/daily-plan-api.integration.test.ts` | **6/6 passed** |
| **Plan 02-05 Total Tests** | All Plan 02-05 tests combined | `scripts/tests/phase-02/plan-05/` | **48/48 passed** |
| **Full Unit Test Suite** | Full repository unit tests | `pnpm test` | **41/41 files, 498/498 passed** |
| **Phase 2 Integration** | Full Phase 2 integration tests | `pnpm test:integration scripts/tests/phase-02/` | **16/16 files, 146/146 passed** |
| **Architecture Boundary Scan** | Strict server-only & client separation | `architecture-boundary.test.ts` & `db-boundary.test.ts` | **32/32 passed (0 violations)** |
| **TypeScript Compilation** | Whole codebase type safety (`noImplicitAny`) | `npx tsc --noEmit` | **0 errors** |
| **Production Build** | Next.js 15 App Router static generation & bundle | `pnpm build` | **Clean build (13/13 static pages)** |

---

## 3. Requirements Traceability

| Requirement | Description | Implementation Artifacts | Verification Evidence |
|---|---|---|---|
| **PLAN-01** | Guided Morning Daily Plan: pick 3-5 priority tasks, review habit intentions, allocate time blocks | `src/components/daily-plan/morning-plan-view.tsx`<br>`src/server/daily-plan/service.ts`<br>`src/app/api/daily-plan/route.ts` | `daily-plan-ui.test.tsx`<br>`daily-plan-service.integration.test.ts`<br>`daily-plan-api.integration.test.ts` |
| **PLAN-02** | Guided Evening Review: mark completed items, enter daily reflections, calculate productivity score | `src/components/daily-plan/evening-review-view.tsx`<br>`src/lib/productivity-score.ts`<br>`src/app/api/daily-plan/evening-review/route.ts` | `productivity-score.test.ts`<br>`daily-plan-ui.test.tsx`<br>`daily-plan-api.integration.test.ts` |
| **PLAN-03** | Uncompleted daily tasks carried over, rescheduled, or returned to backlog with one click (Zero-Duplication Rollover) | `src/server/daily-plan/service.ts` (`executeRollover`)<br>`src/app/api/daily-plan/rollover/route.ts`<br>`src/components/daily-plan/evening-review-view.tsx` (Step 4) | `daily-plan-service.integration.test.ts`<br>`daily-plan-api.integration.test.ts`<br>`daily-plan-ui.test.tsx` |
| **PLAN-04** | Track daily plan completion history for weekly and monthly trend analysis | `src/components/daily-plan/daily-plan-history-view.tsx`<br>`src/server/daily-plan/service.ts` (`getDailyPlanHistory`)<br>`src/app/api/daily-plan/history/route.ts` | `daily-plan-history.test.ts`<br>`daily-plan-ui.test.tsx`<br>`daily-plan-api.integration.test.ts` |

---

## 4. Key Architectural Decisions & Invariants Preserved

1. **Zero-Duplication Rollover Guarantee:**
   - Rollover mutates canonical task records (`tasks.scheduled_date = target_date` or `NULL`) in-place.
   - Verified via integration tests that `taskCountBefore === taskCountAfter` across all rollover mutations.
   - Tasks maintain their persistent primary keys, milestone associations, project links, and tags without duplication.

2. **Clean Architecture Boundary Compliance:**
   - Pure mathematical calculations reside in `src/lib/productivity-score.ts` ensuring both React client components and Node.js server domain services can import the scoring logic without violating the architecture scanner boundary rules.
   - Server-only modules (`src/server/**`) remain strictly isolated from client-side bundles.

3. **Multi-Tenant Composite Isolation:**
   - Composite foreign keys on `evening_reviews(user_id, daily_plan_id)` ensure that a user can never link an evening review to another user's daily plan.
   - Tenant isolation verified at both database constraint and service level.

4. **Next.js 15 Suspense Boundaries:**
   - App Router client pages utilizing `useSearchParams()` (`/daily-plan`) are wrapped with explicit `<React.Suspense>` boundaries to guarantee seamless static prerendering during production builds.
