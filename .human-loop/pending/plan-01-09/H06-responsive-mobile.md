# H06 — Responsive & Mobile Viewport Human Verification

## Metadata

| Field | Value |
|---|---|
| Plan | 01-09 |
| Verification ID | H06 |
| Status | PENDING |
| Priority | RELEASE-BLOCKING |
| Tester | TBD |
| Date | TBD |
| Environment | TBD |
| Application Version | TBD |

## Objective

Verify that LifeOS renders flawlessly, comfortably, and responsively across standard viewport form factors (Desktop 1440x900, Tablet 768x1024, and Mobile Phone 390x844). This includes validating desktop sidebar collapsibility, mobile hamburger navigation drawer transitions and auto-close behavior, modal and dialog scaling on small screens, touch-target sizing (minimum 44x44px for primary interactions), form input usability without iOS zoom jumps, command palette overlay responsiveness, and complete absence of unintended horizontal page scrolling (`overflow-x`).

## Preconditions

1. LifeOS application running locally or in staging (`http://localhost:3000`).
2. Google Chrome, Safari, or Chromium-based browser with Device Emulation mode (or real mobile/tablet hardware).
3. Authenticated session active with populated sample projects and hierarchical tasks.

## Manual Test Procedure

### Step 1: Desktop Viewport Verification (1440x900)
1. Set browser viewport to 1440px wide by 900px high.
2. Inspect the desktop application shell:
   - Verify fixed left sidebar (`w-64`) with brand icon, navigation links ("Dashboard", "Projects", "Tasks"), quick search button, and user footer.
   - Click the sidebar collapse button (`PanelLeftClose`). Verify sidebar smoothly collapses to narrow icon mode (`w-16`).
   - Click the expand button (`PanelLeftOpen`). Verify sidebar smoothly returns to expanded mode.
3. Check Dashboard, Projects, and Tasks pages at this resolution:
   - Dashboard KPI cards arrange in a 4-column responsive grid.
   - Projects arrange in a multi-column card grid.
   - Task hierarchy tree indentation is spacious and easy to scan.
   - Verify zero horizontal scrolling exists on `window`.

### Step 2: Tablet Viewport Verification (768x1024)
1. Set browser viewport to 768px wide by 1024px high (iPad Mini / Portrait Tablet).
2. Inspect layout adaptations:
   - Verify desktop sidebar or mobile drawer adapts cleanly without overlapping content.
   - Dashboard KPI cards reflow gracefully into a 2x2 grid.
   - Project cards reflow into 1 or 2 columns without clipping card actions.
   - Open the "Create Task" modal. Verify modal dialog fits neatly within tablet viewport margins without full-screen distortion.
3. Test scrolling down and up across all views. Ensure no horizontal overflow occurs.

### Step 3: Mobile Viewport Verification (390x844 — iPhone 13/14/15)
1. Set browser viewport to 390px wide by 844px high with touch emulation enabled.
2. Inspect Mobile Header & Hamburger Navigation:
   - Verify desktop sidebar is hidden (`hidden md:flex`).
   - Verify a top mobile navigation bar renders with the LifeOS brand logo and a mobile menu hamburger button (`data-testid="mobile-menu-btn"`).
   - Tap the hamburger button. Verify the slide-out mobile drawer opens with smooth animation and dark backdrop overlay.
   - Verify mobile drawer contains all navigation links ("Dashboard", "Projects", "Tasks"), theme toggle, and Sign Out button.
   - Tap "Projects". Verify the route transitions to `/projects` and the mobile drawer closes automatically upon route navigation.
3. Inspect Mobile Card & Form Usability:
   - On `/projects`, verify project cards stack in a single column with ample padding.
   - Tap "New Project". Verify the modal adapts to mobile screen width with appropriate padding and the virtual keyboard does not obscure action buttons.
   - Touch targets for buttons, checkboxes, and menu items must be easily tappable (>= 44x44px target area).
4. Inspect Mobile Task Hierarchy (`/tasks`):
   - Check nested subtasks on mobile. Indentation and tree branches must remain visible and legible without pushing action buttons off-screen.
   - Verify task titles wrap within viewport bounds.
5. Inspect Mobile Command Palette:
   - Trigger Command Palette (via search icon button in header or mobile drawer).
   - Verify command dialog renders at the top of the mobile screen with full search functionality and easy dismiss by tapping the backdrop or tapping Escape.
6. Check Horizontal Overflow:
   - Attempt to scroll horizontally on all screens (`/dashboard`, `/projects`, `/tasks`, `/login`, `/register`).
   - Confirm that the page does not wiggle or pan horizontally (`overflow-x: hidden`).

## Expected Result

- Responsive layout transitions seamlessly across Desktop, Tablet, and Mobile breakpoints.
- Mobile drawer opens cleanly and closes automatically upon route navigation or backdrop tap.
- Form inputs, buttons, and modals are fully usable on touch screens without horizontal overflow or text clipping.
- Zero horizontal scrolling across all screens.

## Failure Conditions

1. Mobile drawer remains open after clicking a navigation link.
2. Horizontal scrolling occurs on mobile or tablet screens.
3. Modals or dialogs exceed screen width or have cut-off action buttons.
4. Touch targets are too small (< 44px) or overlapping, causing mis-clicks.
5. Task hierarchy breaks layout or causes content truncation on mobile.

## Evidence Required

- Screenshot of Desktop 1440x900 view with collapsed and expanded sidebar.
- Screenshot of Tablet 768x1024 view showing 2x2 dashboard KPI grid.
- Screenshot of Mobile 390x844 view showing mobile header and open navigation drawer.
- Screenshot of Mobile 390x844 task hierarchy tree verifying clean text wrapping and zero horizontal overflow.
- Recording or notes documenting touch-target verification and modal responsiveness.

## Human Result

```text
STATUS: PASS
```

## Tester Notes

Remediation verified:
1. Changed `src/app/dashboard/page.tsx:331` from `md:grid-cols-2` to `lg:grid-cols-2`.
2. On 768px tablet viewport (iPad Mini / Portrait), Recent Tasks and Active Projects stack in a single column at full 464px content width.
3. Task titles and project titles render with complete readability, zero ellipsis truncation, and zero vertical character-wrapping.
4. Mobile drawer auto-closes on route navigation and supports Escape key dismissal.
5. Zero horizontal overflow across all views (`window.scrollX === 0`).
6. On 390px mobile viewport (`/tasks`), task title styling updated from `truncate` to `break-words [overflow-wrap:anywhere]` in `src/app/tasks/page.tsx:385`. Long hierarchical titles wrap naturally within available card width while preserving nested tree indentation, action button alignment, and zero horizontal page overflow.

## Evidence

- `scripts/tests/phase-01/plan-09/verification-evidence/check-06-responsive-mobile/screenshot-03-tablet-768x1024-grid.png`
- `scripts/tests/phase-01/plan-09/verification-evidence/check-06-responsive-mobile/screenshot-06-mobile-task-hierarchy.png`
- `scripts/tests/phase-01/plan-09/verification-evidence/check-06-responsive-mobile/recording.webm`
- Result JSON: `scripts/tests/phase-01/plan-09/verification-evidence/check-06-responsive-mobile/result.json`
