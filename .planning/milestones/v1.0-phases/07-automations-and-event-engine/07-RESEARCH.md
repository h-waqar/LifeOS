# Phase 7 — Automations & Event Engine: Deep Research & Technical Decisions

**Phase:** Phase 7: Automations & Event Engine  
**Status:** Completed Research  
**Target Milestone:** v1 Release  
**Last Updated:** 2026-09-23  

---

## 1. Executive Summary & Problem Space

LifeOS has successfully unified personal productivity, knowledge, relationships, finance, content, and an intelligent AI copilot across Phases 1 through 6. However, cross-domain workflows currently rely on manual user actions or hardcoded direct service calls (e.g. `tasks/service.ts` directly invoking `recalculateGoalProgress`). 

Phase 7 delivers the reactive and automated nervous system for LifeOS:
1. **In-App Event Bus (`AUTO-01`):** Decoupled, typed publisher/subscriber event distribution for all canonical domain mutations (`task.*`, `goal.*`, `habit.*`, `finance.*`, `content.*`, `ai.*`, `system.*`).
2. **Trigger-Condition-Action Rule Engine (`AUTO-02`):** Declarative, user-configurable automation engine executing bounded domain actions in response to domain events or state thresholds.
3. **Background Job Scheduler (`AUTO-03`):** Reliable, PostgreSQL-backed cron/interval scheduler powering morning plan reminders, evening review prompts, overdue task sweeps, and stagnant goal alerts without external Redis or broker dependencies.
4. **In-App Notifications (`AUTO-04`):** Centralized notification service, database schema, real-time unread counter, and responsive UI in the application shell.

---

## 2. Research Findings by Area

### 2.1 In-App Event Bus Architecture (Node.js & Next.js Monolith)

#### Alternatives Evaluated:
1. **External Message Broker (Redis Pub/Sub, RabbitMQ, Kafka):**
   - *Pros:* High throughput, multi-process horizontal scalability.
   - *Cons:* Directly violates LifeOS architectural constraints (modular monolith on single VPS/Docker; no distributed microservices or unnecessary external infrastructure). Heavy operational overhead.
   - *Decision:* **REJECTED.**
2. **Database-Polled Outbox / Table-Based Queue (`event_outbox` table):**
   - *Pros:* Transactional atomicity (event written in same DB transaction as entity).
   - *Cons:* High database polling write amplification, higher latency for interactive UI updates, excessive boilerplate for single-user personal OS.
   - *Decision:* **REJECTED as primary bus; reserved for asynchronous retry if needed.**
3. **In-Process Typed Asynchronous Event Bus with Transaction Hooks:**
   - *Pros:* Microsecond latency, zero external dependencies, strongly typed TypeScript event union, isolated error handling (`Promise.allSettled`), seamless integration with domain services.
   - *Cons:* In-memory events in multi-instance setups do not cross processes. For a single-user personal OS running in Docker, this is an exact architectural fit.
   - *Decision:* **ADOPTED.**

#### In-Process Event Bus Invariants:
- **Transaction-Safe Flush:** Events must only be published *after* the database transaction successfully commits. Publishing during an uncommitted transaction risks emitting phantom events if the transaction subsequently rolls back. Domain services will use an `afterCommit` hook or emit immediately after the transaction block completes.
- **Tenant Isolation:** Every event interface mandatorily includes `userId: string`. Handlers and rule evaluators strictly filter by `userId`, preventing any cross-user event leakage.
- **Error Boundaries:** Subscriber execution is wrapped in `Promise.allSettled()`. A failing handler (e.g. notification delivery failure) logs an error but never throws unhandled exceptions or crashes the primary caller.
- **Recursion & Cycle Defense:** Events carry a `depth: number` counter. If an automation action triggers another event that triggers an automation, depth increments. If `depth >= 3`, execution halts with `RecursionLimitError` and logs an audit security event (`automation.recursion_limit_exceeded`).

---

### 2.2 Trigger-Condition-Action Rule Engine Architecture

#### Rule Lifecycle:
```text
Event Dispatched (or Schedule Triggered)
  │
  ▼
Event Bus routes to Rule Engine (filtered by userId & eventName)
  │
  ▼
Condition Evaluator (pure deterministic TypeScript function)
  │── IF conditions match:
  ▼
Action Executor (dispatches via canonical Domain Services)
  │
  ▼
Persist AutomationRun record (status: success | failed | skipped, duration, contextSnapshot)
  │
  ▼
Audit Log Record (action: "automation.executed")
```

#### Condition Evaluation:
- **Operators Supported:**
  - Equality: `equals`, `not_equals`
  - Numeric/Date: `greater_than`, `greater_than_or_equal`, `less_than`, `less_than_or_equal`
  - String/Array: `contains`, `not_contains`, `in`, `not_in`, `starts_with`
  - Nullability: `is_empty`, `is_not_empty`
- **Field Extraction:** Dot-notation paths into event payload and entity snapshots (e.g. `task.priority`, `task.status`, `project.allTasksCompleted`, `habit.currentStreak`).
- **Combinators:** Logical `AND` and `OR` clause evaluation. Evaluator is a 100% pure function with comprehensive unit test coverage.

#### Action Execution & Safety Boundary:
- Actions must **NEVER** use raw SQL. Every action executes through canonical domain services (`createTask`, `updateTask`, `updateProject`, `createNotification`, `createAuditLog`).
- Supported Action Types:
  1. `create_notification`: Dispatches an in-app notification with title, message, type, and deep-link.
  2. `create_task`: Creates a follow-up or recurring task with specified priority, due date, and tags.
  3. `update_task`: Updates fields on triggering task (e.g. mark status, change priority).
  4. `update_project`: Updates parent project (e.g. mark status completed when all tasks finish).
  5. `trigger_ai_suggestions`: Triggers proactive daily planning recommendation or weekly synthesis.
  6. `log_audit`: Generates custom immutable audit record.
- Multi-entity mutations executed in database transactions (`db.transaction`).

---

### 2.3 Background Job Scheduling (Without Redis)

#### Requirements & Constraints:
- PRD Section 30 & 31 require:
  - 8:00 AM daily plan generation prompt
  - 9:00 PM evening review reminder
  - Hourly/daily overdue task detection
  - 14-day stagnant goal flagging
  - Recurring task spawning check
- Constraints: Must run reliably in Docker, local Node, and Next.js App Router without external dependencies like Redis, BullMQ, or RabbitMQ.

#### Evaluated Architectural Approaches:
1. **Next.js API Route via External Webhook / System Cron:**
   - `/api/cron/scheduler` protected by `Bearer <CRON_SECRET>`.
   - Triggered by standard Linux cron or Docker host cron.
   - *Advantage:* Zero memory overhead when idle, native to serverless/Next.js hosting.
   - *Disadvantage:* Requires external cron runner or Docker sidecar.
2. **In-Process Background Daemon (`setInterval` / cron parser):**
   - In-process interval ticker in server process checking scheduled tasks every 60 seconds.
   - *Advantage:* Fully self-contained inside the Next.js Docker container.
   - *Disadvantage:* In development, Next.js hot-reloading can duplicate intervals if not guarded by global state.
3. **Adopted Hybrid Architecture:**
   - **Service Layer (`SchedulerEngine`):** Centralized scheduling logic that sweeps jobs and executes due triggers.
   - **Idempotency & Concurrency Lock in PostgreSQL:** Uses a lightweight `scheduler_locks` table or `automation_runs` date-key check (`SELECT ... FOR UPDATE` or `ON CONFLICT DO NOTHING`) ensuring that even if invoked concurrently by multiple triggers, each job runs exactly once per time window.
   - **Dual Entry Point:**
     - HTTP API: `POST /api/cron/scheduler` with `CRON_SECRET` validation.
     - Internal Runner: `src/server/scheduler/worker.ts` executable via `tsx scripts/worker.ts` or during production server bootstrap.

---

### 2.4 Notifications Engine & User Interface

#### Data Model (`notifications` table):
- `id`: UUID primary key
- `user_id`: Foreign key to `users.id` with `ON DELETE CASCADE`
- `title`: Text, max 255 chars
- `message`: Text
- `type`: Enum `info` | `warning` | `success` | `error` | `reminder`
- `entity_type`: Enum `task` | `project` | `goal` | `habit` | `finance` | `content` | `system`
- `entity_id`: Text nullable (UUID of referenced entity)
- `link_url`: Text nullable (deep-link path, e.g. `/tasks?id=...`)
- `is_read`: Boolean default `false`
- `read_at`: Timestamp with timezone nullable
- `metadata`: JSONB default `{}`
- `created_at`: Timestamp with timezone default `NOW()`
- **Indexes:** `(user_id, is_read, created_at DESC)`, `(user_id, created_at DESC)`.

#### UI Integration:
- Header Bell Icon in `AppShell` with live unread badge count.
- Popover / Slide-over Notification Center:
  - Categorized notification cards with icons based on `type`.
  - Deep-link navigation on click.
  - "Mark as Read", "Mark All as Read", "Clear / Dismiss".
  - Audio-free, distraction-free badge animation.

---

## 3. Security, Invariants & Failure Modes

| Invariant / Threat | Mitigation Strategy |
| :--- | :--- |
| **Cross-User Event/Action Leakage** | All events, automations, and notifications strictly enforce `userId` scoping. Tool context and service dispatch validate ownership via `requireResourceOwnership`. |
| **Recursive Automation Death Spiral** | Max execution depth limit (`MAX_DEPTH = 3`). Event metadata tracks `depth` and `parentRunId`. Engine halts and writes audit log on limit violation. |
| **Unauthenticated Cron Access** | `/api/cron/scheduler` requires `Authorization: Bearer ${CRON_SECRET}` with constant-time string comparison (`timingSafeEqual`). |
| **Phantom Event Emission** | Events must never be published before a database transaction commits. Domain services emit events strictly post-commit. |
| **Duplicate Scheduled Job Execution** | PostgreSQL idempotency keys and row locks ensure scheduled sweeps run exactly once per time window (e.g. `daily_plan_prompt_YYYY-MM-DD`). |
| **Failing Automation Crashing Request** | All event subscribers and automation rules execute inside `try/catch` and `Promise.allSettled()`. Rule failure persists `status: "failed"` to `automation_runs` and logs an audit event without failing the caller. |
| **Raw SQL in Automation Actions** | Bounded action executors strictly invoke existing TypeScript domain services; raw SQL execution in actions is strictly prohibited. |

---

## 4. Phase 7 Plan Breakdown

To preserve the GSD vertical-slice principle and ensure comprehensive testing, Phase 7 is divided into 5 atomic plans:

1. **Plan 07-01: In-App Event Bus & Domain Event Publisher Architecture**
2. **Plan 07-02: Database Schema, Notifications Engine & In-App Notification UI**
3. **Plan 07-03: Trigger-Condition-Action Automation Rule Engine & Execution Lifecycle**
4. **Plan 07-04: Background Scheduler, Scheduled Automations & Periodic Sweepers**
5. **Plan 07-05: Automations Management UI & System Integration**
