# H04 — Project Management Human Verification

## Metadata

| Field | Value |
|---|---|
| Plan | 01-09 |
| Verification ID | H04 |
| Status | PENDING |
| Priority | HIGH |
| Tester | TBD |
| Date | TBD |
| Environment | TBD |
| Application Version | TBD |

## Objective

Verify that full lifecycle project management operates smoothly, accurately, and safely via the web UI (`/projects`). This includes validating project card grid rendering, status tab filtering (`all`, `active`, `planning`, `paused`, `completed`, `archived`), creation validation (rejecting empty or overlength inputs), project editing, deletion safeguards with explicit warning that associated tasks will have their project assignment nullified, and reactive UI updates without stale caching.

## Preconditions

1. LifeOS application running locally or in staging environment (`http://localhost:3000`).
2. Logged in as an authenticated user with an active session.
3. Access to Developer Tools console to inspect network mutations.

## Manual Test Procedure

### Step 1: Project List Rendering & Navigation
1. Navigate to `http://localhost:3000/projects` (or click "Projects" in the sidebar).
2. Verify page header: "Projects" with subtitle "Organize and track your high-level domains and outcomes".
3. Check the status filter tabs: `All`, `Active`, `Planning`, `Paused`, `Completed`, `Archived`.
4. If no projects exist, verify the empty state appears: "No projects found" with button "Create your first project".

### Step 2: Project Creation & Validation
1. Click the "New Project" button (`data-testid="create-project-btn"`).
2. Attempt submission with an empty name field. Verify client validation requires a project name.
3. Enter valid project details:
   - Name: "Personal Operating System MVP"
   - Description: "Design and implement foundational architecture for LifeOS"
   - Status: "Active"
   - Priority: "High"
4. Click "Create Project".
5. Verify:
   - Creation modal closes cleanly.
   - Success toast "Project created successfully" appears.
   - The new project card appears in the grid with status badge `ACTIVE`, priority badge `HIGH`, description, and `0 tasks` count.

### Step 3: Status Tab Filtering
1. Create a second project:
   - Name: "Future Hardware Upgrades"
   - Status: "Planning"
   - Priority: "Low"
2. Create a third project:
   - Name: "Legacy System Decommission"
   - Status: "Archived"
   - Priority: "Medium"
3. Test filtering:
   - Click "All" tab: Verify all 3 projects are visible.
   - Click "Active" tab: Verify only "Personal Operating System MVP" is visible.
   - Click "Planning" tab: Verify only "Future Hardware Upgrades" is visible.
   - Click "Archived" tab: Verify only "Legacy System Decommission" is visible.
   - Click "Completed" tab: Verify empty state "No projects found in this filter".

### Step 4: Project Editing Workflow
1. Switch back to "All" tab.
2. Locate the "Personal Operating System MVP" card.
3. Click the "Edit" button (or pencil icon).
4. Verify the "Edit Project" modal opens pre-populated with existing values.
5. Modify:
   - Name: "LifeOS Phase 1 MVP — Hardened"
   - Status: "Completed"
   - Priority: "Critical"
6. Click "Save Changes".
7. Verify:
   - Modal closes.
   - Success toast appears.
   - The card in the grid updates immediately reflecting the new name, `COMPLETED` status, and `CRITICAL` priority without requiring a manual page refresh.

### Step 5: Project Deletion & Cascade Safety Warning
1. Create a task assigned to "LifeOS Phase 1 MVP — Hardened" (via dashboard or tasks view).
2. Return to `http://localhost:3000/projects`.
3. Locate "LifeOS Phase 1 MVP — Hardened" and click "Delete" (or trash icon).
4. Verify the confirmation dialog opens and explicitly warns the user:
   - "Are you sure you want to delete this project?"
   - Explicit safety note: "Tasks belonging to this project will NOT be deleted; they will simply become unassigned (projectId will be cleared)."
5. Click "Confirm Delete".
6. Verify:
   - Modal closes and success toast appears.
   - The project is removed from the grid immediately.
   - Navigate to `/tasks` and verify the previously linked task still exists with its project set to "Unassigned" / "None".

## Expected Result

- Projects can be created, edited, filtered, and deleted without UI errors.
- Status filters partition the project collection accurately.
- UI state updates immediately upon mutation without stale cache artifacts.
- Project deletion warnings clearly describe that tasks remain intact with `projectId` nullified.

## Failure Conditions

1. Project creation accepts invalid or empty names.
2. Filter tabs do not accurately filter project cards by status.
3. Editing a project leaves stale data on screen until page reload.
4. Project deletion deletes associated tasks rather than preserving them.
5. Deletion confirmation dialog lacks clear explanation of cascade consequences.

## Evidence Required

- Screenshot of projects grid with status filter tabs active.
- Screenshot of Edit Project modal with pre-populated values.
- Screenshot of Delete Project confirmation dialog displaying the task unassignment warning.
- Screenshot of tasks page confirming that tasks from deleted projects persist safely as unassigned.

## Human Result

```text
STATUS: PENDING
```

## Tester Notes

TBD

## Evidence

TBD
