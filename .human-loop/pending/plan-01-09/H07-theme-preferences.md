# H07 — Theme & Preferences Human Verification

## Metadata

| Field | Value |
|---|---|
| Plan | 01-09 |
| Verification ID | H07 |
| Status | PENDING |
| Priority | MEDIUM |
| Tester | TBD |
| Date | TBD |
| Environment | TBD |
| Application Version | TBD |

## Objective

Verify that theme switching (Light, Dark, System) behaves consistently, renders with high aesthetic quality and legible contrast, avoids unstyled or inverted flashes during initial page load, and persists reliably across page reloads, browser restarts, and across logout/login authentication boundaries via `/api/preferences` and `localStorage`.

## Preconditions

1. LifeOS application running locally or in staging (`http://localhost:3000`).
2. Logged in as an authenticated user.
3. System OS capable of toggling OS-level Dark/Light appearance (or browser DevTools emulation: `Rendering -> Emulate CSS media feature prefers-color-scheme`).

## Manual Test Procedure

### Step 1: Default Theme & Visual Contrast Inspection
1. Navigate to `http://localhost:3000/dashboard`.
2. Inspect the initial theme (default is Dark mode).
3. Verify visual contrast:
   - Background is deep dark (`bg-background`).
   - Cards and containers have distinct contrast (`bg-card`).
   - Text is crisp and legible (`text-foreground` / `text-muted-foreground`).
   - Badges, buttons, and borders are clearly differentiated.

### Step 2: Theme Switching via Sidebar / Header Toggle
1. Locate the theme toggle button in the sidebar footer (or header).
2. Click the theme toggle button once.
3. Verify:
   - The application immediately transitions to Light mode.
   - The `dark` class is removed from `document.documentElement`.
   - The background switches to clean light tones (`#ffffff` / `#fafafa`).
   - Text switches to dark legible typography.
   - Card borders and shadows provide clear spatial separation.
   - Interactive buttons, badges, and modals remain clearly visible and legible without contrast collapse.

### Step 3: Persistence Across Page Reload
1. While in Light mode, press `F5` / `Cmd+R` to execute a full browser reload.
2. Observe the reload process closely:
   - Verify there is no jarring "flash of dark theme" (FOUT/Flash of Unstyled Theme) before Light mode renders.
   - Verify the application reloads and remains firmly in Light mode.

### Step 4: Multi-Surface Theme Switching (Command Palette)
1. Press `Ctrl+K` or `Cmd+K` to open the Command Palette.
2. In the command list, locate or search for "Toggle Dark/Light Mode".
3. Press Enter.
4. Verify the application switches back to Dark mode immediately and the command palette palette styling adapts synchronously.

### Step 5: Persistence Across Logout & Login
1. In Dark mode, click "Sign Out".
2. On `/login`, verify theme styling remains consistent.
3. Log back in with valid credentials.
4. Upon landing on `/dashboard`, verify that the user's persisted theme preference (Dark) was fetched from `/api/preferences` and is active.
5. Repeat the test by setting Light mode, logging out, and logging back in to verify Light mode persistence across sessions.

### Step 6: System Theme Sync
1. Open the theme selector (or trigger system theme mode).
2. In browser DevTools, toggle `prefers-color-scheme` between `dark` and `light`.
3. If configured for `system`, verify that LifeOS automatically follows the operating system preference without manual intervention.

## Expected Result

- Theme toggles smoothly between Dark and Light modes without visual artifacts or layout shifts.
- High contrast and readability are preserved in both themes.
- Preferences persist reliably in both `localStorage` and the database (`/api/preferences`).
- No visible flashing of incorrect theme occurs on hard refreshes.

## Failure Conditions

1. Dark/Light toggle fails to update CSS custom properties or document classes.
2. Light mode exhibits unreadable text (e.g., white text on white background) or invisible borders.
3. Reloading the page causes a noticeable flash of the opposite theme.
4. Theme preference resets to default upon logging out or logging in.
5. Interactive controls (inputs, dropdowns, buttons) become invisible or poorly contrasted in either theme.

## Evidence Required

- Screenshot of Dashboard in Dark mode.
- Screenshot of Dashboard in Light mode showing identical layout with proper light theme contrast.
- Screenshot of Command Palette rendered in both Dark and Light themes.
- Network tab inspection showing `PATCH /api/preferences` payload when toggling theme.

## Human Result

```text
STATUS: PENDING
```

## Tester Notes

TBD

## Evidence

TBD
