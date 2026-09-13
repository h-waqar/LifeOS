# H05 — Task Hierarchy Human Verification

## Metadata

| Field | Value |
|---|---|
| Plan | 01-09 |
| Verification ID | H05 |
| Status | PENDING |
| Priority | HIGH |
| Tester | TBD |
| Date | TBD |
| Environment | TBD |
| Application Version | TBD |

## Objective

Verify that hierarchical task management (`/tasks`) functions intuitively, reliably, and safely. This encompasses validating the hierarchical visual tree rendering (root tasks, nested child tasks, visual indentation, connector lines), multi-level subtask nesting, child task creation workflows, task editing, inline completion/status transitions, cascade deletion warnings and enforcement (confirming that deleting a parent task recursively deletes all its descendants), and layout resilience when handling deep hierarchies or exceptionally long task titles.

## Preconditions

1. LifeOS application running locally or in staging (`http://localhost:3000`).
2. Logged in as an authenticated user with an active session.
3. At least one active project created to test project assignment.

## Manual Test Procedure

### Step 1: Root Task Creation
1. Navigate to `http://localhost:3000/tasks` (or click "Tasks" in the navigation sidebar).
2. Click the "New Task" button (`data-testid="create-task-btn"`).
3. In the "Create New Task" modal:
   - Leave "Parent Task" as "None (Root Task)".
   - Enter Title: "Root Epic: Launch LifeOS Personal Beta".
   - Enter Description: "High-level parent epic coordinating all deployment streams".
   - Select Priority: "Critical".
   - Select Status: "todo".
4. Click "Create Task".
5. Verify:
   - Success toast appears.
   - The root task appears at depth level 0 with no indentation or tree connector lines.

### Step 2: Nested Subtask Creation (Level 1)
1. On the root task row, click the "+ Subtask" button (`data-testid="add-subtask-btn"` or plus icon).
2. Verify the Create Task modal opens with "Parent Task" automatically pre-selected to "Root Epic: Launch LifeOS Personal Beta".
3. Enter Title: "Child Task: Configure Production DNS & TLS".
4. Select Priority: "High", Status: "todo".
5. Click "Create Task".
6. Verify:
   - The child task renders indented beneath the root task.
   - A visual tree branch indicator / connector line visually links the child to its parent.

### Step 3: Deep Hierarchy Nesting (Level 2 & Level 3)
1. On "Child Task: Configure Production DNS & TLS", click "+ Subtask".
2. Enter Title: "Grandchild Task: Provision Cloudflare Origin Certificate".
3. Click "Create Task".
4. On the grandchild task, click "+ Subtask".
5. Enter Title: "Great-Grandchild Task: Verify HTTP Strict Transport Security Headers".
6. Click "Create Task".
7. Inspect the rendered hierarchy:
   - Verify that 4 levels (Root -> Child -> Grandchild -> Great-Grandchild) render cleanly.
   - Indentation steps are proportional and visual hierarchy remains obvious.
   - Tree connector lines align accurately without overlapping text.

### Step 4: Long Content & Wrapping Stress Test
1. Click "+ Subtask" on the great-grandchild task.
2. Enter an exceptionally long title:
   `Supercalifragilisticexpialidocious Ultra Long Subtask Title With Continuous Alphanumeric Characters And Detailed Implementation Directives Intended To Stress Test Text Wrapping And Container Overflow Behavior In Hierarchical Tree Layouts Without Causing Horizontal Scrollbars Or Misalignments`
3. Click "Create Task".
4. Inspect the item in the tree:
   - Verify that the title wraps naturally onto multiple lines within its container.
   - Verify that action buttons (Edit, Delete, Checkbox) remain accessible and aligned.
   - Verify that no unexpected horizontal page scrollbar is created on the main window.

### Step 5: Inline Completion & Status Transitions
1. Locate "Child Task: Configure Production DNS & TLS".
2. Click the checkbox toggle.
3. Verify:
   - The title is struck through (`line-through`) and rendered with muted styling.
   - The status changes to `completed`.
   - The parent and children remain in their proper hierarchical positions.
4. Click the checkbox again to reopen it.
5. Verify strikethrough is removed and status returns to active.

### Step 6: Cascading Deletion & Safety Warning
1. Locate the top-level "Root Epic: Launch LifeOS Personal Beta" row.
2. Click the "Delete" button (`data-testid="delete-task-btn"` or trash icon).
3. Verify the Delete Task confirmation modal opens:
   - Inspect warning text: "Are you sure you want to delete this task? All nested subtasks (descendants) will also be permanently deleted."
   - Confirm it clearly states the cascading consequence.
4. Click "Confirm Delete".
5. Verify:
   - The root task AND all nested descendants (Child, Grandchild, Great-Grandchild, Long Title task) disappear from the tree.
   - No orphan tasks are left dangling without parents.
   - Navigate to `/dashboard` and verify KPI counts correctly reflect the batch removal of the entire hierarchy tree.

## Expected Result

- Task hierarchy provides immediate visual clarity on parent-child relationships through indentation and tree guides.
- Multi-level subtasks can be created and managed without UI breakdown.
- Cascading deletion confirms and permanently removes all descendant subtasks.
- Long text strings wrap gracefully without breaking container boundaries or causing horizontal scrollbar bleed.

## Failure Conditions

1. Child subtasks render at the root level without indentation or visual relationship to their parent.
2. Nesting beyond 2 levels breaks layout, wraps controls onto multiple lines awkwardly, or clips text.
3. Deleting a parent task leaves orphaned children floating in the UI with broken references.
4. Delete confirmation fails to warn about cascade deletion of children.
5. Long titles cause horizontal scrollbars or push action buttons off-screen.

## Evidence Required

- Screenshot of multi-level task hierarchy (3+ levels) with visible indentation and connector guides.
- Screenshot of long task title rendering with proper text wrapping.
- Screenshot of Delete Task confirmation modal displaying the cascade deletion warning.
- Screenshot of task list after deletion confirming clean removal of the entire branch.

## Human Result

```text
STATUS: PENDING
```

## Tester Notes

TBD

## Evidence

TBD
