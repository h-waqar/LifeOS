# H03 — Dashboard Human Verification

## Metadata

| Field | Value |
|---|---|
| Plan | 01-09 |
| Verification ID | H03 |
| Status | PENDING |
| Priority | HIGH |
| Tester | TBD |
| Date | TBD |
| Environment | TBD |
| Application Version | TBD |

## Objective

Verify that the unified personal dashboard (`/dashboard`) renders accurately, responsively, and informatively. This encompasses validating KPI card aggregations (Active Projects, Pending Tasks, Completed Tasks, Critical Priority), empty and populated state presentations, recent and urgent tasks feeds, instant inline checkbox completion toggles, quick-creation modal workflows for tasks and projects, resilient loading states without UI layout shift, and destructive confirmation patterns.

## Preconditions

1. LifeOS application running locally or in staging environment (e.g. `http://localhost:3000`).
2. Logged in as an authenticated user with a valid session.
3. Ability to create, complete, and delete test projects and tasks to observe count and state updates.

## Manual Test Procedure

### Step 1: Initial & Empty State Verification
1. Log in to an account with zero projects and zero tasks (or clean database).
2. Navigate to `http://localhost:3000/dashboard`.
3. Verify that the dashboard header reads "Dashboard" with subtext "Welcome to your personal command center."
4. Inspect the four KPI cards:
   - "Active Projects": Value displays `0`.
   - "Pending Tasks": Value displays `0`.
   - "Completed Tasks": Value displays `0`.
   - "Critical Priority": Value displays `0`.
5. Inspect the Recent Tasks card:
   - Verify empty state message: "No tasks created yet."
   - Verify an "Add Task" button is available inside the empty state.

### Step 2: Quick-Create Task Modal Workflow
1. In the dashboard header, click the "Add Task" quick-action button (`data-testid="dashboard-add-task"`).
2. Verify the "Create New Task" modal dialog opens with backdrop blur:
   - Inputs: Title, Description, Status, Priority, Due Date, Project dropdown.
3. Enter Title: "Dashboard Test Root Task", Priority: "Critical", Status: "todo".
4. Click "Create Task".
5. Verify:
   - Modal closes automatically.
   - Success toast "Task created successfully" appears.
   - Dashboard KPI "Pending Tasks" increments from `0` to `1`.
   - Dashboard KPI "Critical Priority" increments from `0` to `1`.
   - The task appears immediately in the "Recent & Urgent Tasks" feed.

### Step 3: Quick-Create Project Modal Workflow
1. In the dashboard header, click the "Add Project" quick-action button (`data-testid="dashboard-add-project"`).
2. Verify the "Create New Project" modal dialog opens.
3. Enter Name: "Strategic Life Vision", Description: "Core focus project", Priority: "High", Status: "active".
4. Click "Create Project".
5. Verify:
   - Modal closes automatically.
   - Success toast "Project created successfully" appears.
   - Dashboard KPI "Active Projects" increments from `0` to `1`.

### Step 4: Inline Task Completion Toggle & KPI Recalculation
1. In the "Recent & Urgent Tasks" feed, locate "Dashboard Test Root Task".
2. Click the checkbox toggle beside the task title.
3. Observe:
   - The task title immediately displays visual strikethrough styling and muted color.
   - A success toast confirms completion.
   - The "Pending Tasks" KPI decrements to `0`.
   - The "Completed Tasks" KPI increments to `1`.
   - The "Critical Priority" pending count decrements to `0`.
4. Click the checkbox again to reopen the task.
5. Verify the task title unstrikes and the KPIs return to pending counts.

### Step 5: Refresh & Stale-State Resilience
1. Click the "Refresh" icon button in the dashboard header.
2. Observe the loading state: the dashboard contents refresh smoothly without broken layouts, layout shift (CLS), or unstyled flash.
3. Verify that refreshed KPI values and task feed match the database truth.

## Expected Result

- Dashboard provides an immediate, clear snapshot of operational productivity.
- KPI summaries update reactively upon creating, editing, and toggling tasks and projects.
- Modals operate smoothly with clear validation and autofocus.
- Empty states are helpful and guide the user to creation actions.
- Checkbox toggles provide instantaneous visual feedback with strikethrough and toast updates.

## Failure Conditions

1. KPI counts fail to update after task creation or completion toggle.
2. Quick-create modals fail to close or do not persist entities to the database.
3. Task completion toggle throws an error or fails to update UI strikethrough.
4. Refreshing the dashboard leads to broken layout or missing navigation shell.
5. Empty state is blank, unstyled, or misleading.

## Evidence Required

- Screenshot of empty dashboard showing initial `0` KPIs and clean empty state.
- Screenshot of populated dashboard showing updated KPI counts and recent task item.
- Screenshot of task checkbox completion showing strikethrough styling and updated KPI values.
- Browser console log confirming clean execution without errors.

## Human Result

```text
STATUS: PENDING
```

## Tester Notes

TBD

## Evidence

TBD
