# H08 — Command Palette Human Verification

## Metadata

| Field | Value |
|---|---|
| Plan | 01-09 |
| Verification ID | H08 |
| Status | PENDING |
| Priority | MEDIUM |
| Tester | TBD |
| Date | TBD |
| Environment | TBD |
| Application Version | TBD |

## Objective

Verify that the global Command Palette (`Ctrl+K` / `Cmd+K`) functions as an instantaneous, keyboard-driven navigation and workflow hub. This includes testing keyboard shortcut responsiveness, search input autofocus, fuzzy/substring command filtering, keyboard arrow navigation, selection via `Enter`, execution of navigation commands (`/dashboard`, `/projects`, `/tasks`), quick-create actions ("Create Task", "Create Project"), system actions (theme toggle, sign out), dismissal via `Escape` or backdrop click, and complete absence of focus traps.

## Preconditions

1. LifeOS application running locally or in staging (`http://localhost:3000`).
2. Logged in as an authenticated user with an active session.
3. Keyboard and mouse available.

## Manual Test Procedure

### Step 1: Keyboard Shortcut Activation (`Ctrl+K` / `Cmd+K`)
1. While on any authenticated page (`/dashboard`, `/projects`, or `/tasks`), press `Ctrl+K` (on Windows/Linux) or `Cmd+K` (on macOS).
2. Verify:
   - Command Palette dialog opens immediately (`data-testid="command-palette-dialog"`).
   - Semi-transparent backdrop with blur overlay renders behind the dialog.
   - Text input (`data-testid="command-palette-input"`) is immediately focused with placeholder "Type a command or search...".
3. Press `Ctrl+K` or `Cmd+K` again. Verify the palette closes (toggle behavior).

### Step 2: Dismissal & Focus Restoration
1. Open the palette with `Ctrl+K` / `Cmd+K`.
2. Press the `Escape` key. Verify the palette closes instantly without residual focus artifacts.
3. Open the palette again. Click outside the modal dialog onto the dark backdrop. Verify the palette closes.

### Step 3: Navigation Commands
1. Navigate to `/dashboard`.
2. Open the palette with `Ctrl+K` / `Cmd+K`.
3. Type `tasks`.
4. Observe the filtered results: "Tasks" navigation item is highlighted.
5. Press `Enter`.
6. Verify:
   - Command palette closes.
   - Browser navigates to `/tasks`.
7. Repeat from `/tasks`: open palette, type `projects`, press `Enter`. Verify navigation to `/projects`.

### Step 4: Quick-Action Triggers
1. While on `/projects`, open the palette.
2. Type `task`.
3. Select "Create Task" (or "Add Task") and press `Enter`.
4. Verify:
   - Command palette closes.
   - The "Create New Task" modal dialog opens immediately.
   - The task title input is focused and ready for typing.
5. Close the task modal. Open the palette again.
6. Type `project`.
7. Select "Create Project" and press `Enter`.
8. Verify the "Create New Project" modal opens.

### Step 5: System Action Triggers (Theme & Logout)
1. Open the palette with `Ctrl+K` / `Cmd+K`.
2. Type `theme`.
3. Select "Toggle Dark/Light Mode" and press `Enter`.
4. Verify the theme changes immediately.
5. Open the palette again. Type `sign out` or `logout`.
6. Select "Sign Out" and press `Enter`.
7. Verify the user is logged out, toast confirms sign out, and the browser redirects to `/login`.

### Step 6: Keyboard Navigation & Focus Trap Prevention
1. Open the palette.
2. Use `Down Arrow` and `Up Arrow` keys to cycle through all commands in the list.
3. Verify the visual highlight (active item styling) tracks arrow key movements cleanly.
4. Verify pressing `Tab` does not jump behind the dialog to obscured page elements or create an inescapable keyboard trap.

## Expected Result

- Command palette responds instantaneously to `Ctrl+K` / `Cmd+K` from any view.
- Search input is autofocus-ready.
- Navigation, action creation, theme toggling, and logout commands execute without failure.
- Palette dismisses cleanly via `Escape`, toggle shortcut, or backdrop click.
- Focus is cleanly restored to the page upon dismissal.

## Failure Conditions

1. `Ctrl+K` or `Cmd+K` does not open the palette.
2. Search input fails to receive immediate focus upon opening.
3. Selecting a command does not close the palette or fails to execute the action.
4. Pressing `Escape` does not close the palette.
5. Keyboard focus becomes trapped inside an invisible element or escapes to background elements while dialog is open.

## Evidence Required

- Screenshot of Command Palette dialog open displaying command categories (Navigation, Quick Actions, System).
- Screenshot of filtered command results when searching for "task".
- Screenshot of modal opened directly from a command palette action trigger.
- Notes detailing keyboard-only interaction flow and shortcut verification.

## Human Result

```text
STATUS: PENDING
```

## Tester Notes

TBD

## Evidence

TBD
