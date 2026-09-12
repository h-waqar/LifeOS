# LifeOS Plan 01-07: Core Domain Model & Data Integrity

## 1. Executive Summary

This document specifies the core domain model and data integrity guarantees for LifeOS, implemented and verified under **Plan 01-07**:
`HTTP Route Handlers → Application Boundary & Ownership Scoping → Domain Services → PostgreSQL Invariants (Composite FKs & Check Constraints)`

The implementation establishes the smallest production-grade core domain model for LifeOS, centered on the fundamental units of personal execution: **Projects** and **Tasks**.

- **Implementation Status**: PASS
- **Verified Baseline**: 19 Unit Test Files (188 tests passing), 8 Live Integration Test Suites (125 tests passing), Clean Next.js 15 Production Build.
- **Data Invariants**: Enforced directly at the PostgreSQL storage layer via composite foreign keys and database check constraints.

---

## 2. Core Domain Architecture

```
User (1)
  │
  ├── User Preferences (1:1)
  │
  ├── Audit Log (1:N, Immutable)
  │
  ├── Projects (1:N)
  │     │
  │     └── Tasks (1:N, ON DELETE SET NULL)
  │
  └── Tasks (1:N)
        │
        └── Subtasks (Self-referential, ON DELETE CASCADE)
```

### 2.1 Entity Design & Boundaries

| Entity | Purpose | Ownership Model | Relational Dependencies | Deletion Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **`Project`** | High-level outcome container grouping multiple execution tasks. | User-owned (`user_id` FK to `user.id`). Enforces `UNIQUE (user_id, id)` for composite foreign key target. | Belongs to `User`. | `ON DELETE CASCADE` when user is deleted. |
| **`Task`** | Atomic user-owned unit of execution and time consumption. | User-owned (`user_id` FK to `user.id`). Enforces `UNIQUE (user_id, id)` for subtask target. | Optionally references `Project` via `(user_id, project_id)`. Optionally references parent `Task` via `(user_id, parent_task_id)`. | When parent `User` deleted: `ON DELETE CASCADE`. When `Project` deleted: `ON DELETE SET NULL (project_id)` (tasks preserved). When parent `Task` deleted: `ON DELETE CASCADE` (subtasks deleted). |

---

## 3. Storage Layer & PostgreSQL Invariants

PostgreSQL enforces all core domain data invariants directly at the database engine level, defending against application bugs or bypasses:

1. **Cross-User Project Isolation (`tasks_user_project_fk`)**:
   `FOREIGN KEY (user_id, project_id) REFERENCES projects(user_id, id) ON DELETE SET NULL (project_id)`
   - **Guarantees**: A task cannot be linked to a project belonging to a different user.
   - **Postgres Error**: `23503 foreign_key_violation`.
2. **Cross-User Subtask Isolation (`tasks_user_parent_task_fk`)**:
   `FOREIGN KEY (user_id, parent_task_id) REFERENCES tasks(user_id, id) ON DELETE CASCADE`
   - **Guarantees**: A subtask cannot be linked to a parent task belonging to another user.
   - **Postgres Error**: `23503 foreign_key_violation`.
3. **Self-Referential Parent Prevention (`tasks_parent_not_self`)**:
   `CHECK (parent_task_id IS NULL OR parent_task_id != id)`
   - **Guarantees**: A task cannot be its own parent.
   - **Postgres Error**: `23514 check_violation`.
4. **Task Title Bounds (`tasks_title_non_empty`, `tasks_title_max_length`)**:
   `CHECK (length(trim(title)) > 0 AND length(title) <= 255)`
5. **Project Name Bounds (`projects_name_non_empty`, `projects_name_max_length`)**:
   `CHECK (length(trim(name)) > 0 AND length(name) <= 255)`
6. **Task Duration Bounds (`tasks_estimated_duration_bounds`, `tasks_actual_duration_bounds`)**:
   `CHECK (estimated_duration IS NULL OR (estimated_duration >= 0 AND estimated_duration <= 10080))`
   `CHECK (actual_duration IS NULL OR (actual_duration >= 0 AND actual_duration <= 10080))`
7. **Task Completion Status Timestamp Invariant (`tasks_completed_at_invariant`)**:
   `CHECK (status != 'completed' OR completed_at IS NOT NULL)`
   - **Guarantees**: A task marked completed must possess a valid completion timestamp.

---

## 4. API & Application Boundary

Endpoints implement defensive boundaries:
- `GET /api/projects`, `POST /api/projects`
- `GET /api/projects/[id]`, `PATCH /api/projects/[id]`, `DELETE /api/projects/[id]`
- `GET /api/tasks`, `POST /api/tasks`
- `GET /api/tasks/[id]`, `PATCH /api/tasks/[id]`, `DELETE /api/tasks/[id]`

### Defenses Verified:
1. **Dynamic Execution & Cache Isolation**: All endpoints export `dynamic = "force-dynamic"` and send `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` and `Pragma: no-cache`.
2. **Payload Size Limits**: 32KB request body limit defending against memory exhaustion DoS (HTTP 413).
3. **Content-Type Enforcement**: Mutations require `application/json` (HTTP 415).
4. **Mass-Assignment Defense**: Zod `.strict()` validation forbidding client-supplied `userId` or `id` (HTTP 400).
5. **BOLA/IDOR Defense**: All entity operations filter strictly by `WHERE user_id = authenticatedUserId AND id = entityId`. Accessing a non-existent or foreign entity returns HTTP 404.
6. **Immutable Audit Logging**: Every mutation creates an audit record capturing actor, action, timestamp, and details JSON.
