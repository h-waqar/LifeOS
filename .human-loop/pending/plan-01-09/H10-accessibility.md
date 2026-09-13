# H10 — Accessibility Human Verification

## Metadata

| Field | Value |
|---|---|
| Plan | 01-09 |
| Verification ID | H10 |
| Status | PENDING |
| Priority | HIGH |
| Tester | TBD |
| Date | TBD |
| Environment | TBD |
| Application Version | TBD |

## Objective

Perform a rigorous, practical human keyboard and accessibility audit across the entire application interface. This verification ensures full keyboard navigability without a mouse, clear visual focus indicators on all interactive elements, logical sequential tab order, effective focus management in modal dialogs (trapping focus inside the modal and releasing focus upon close), clean Escape key dismissal, appropriate ARIA roles and labeling, distinguishable clickable controls, high-contrast readability (WCAG AA compliance), and complete avoidance of keyboard navigation traps.

## Preconditions

1. LifeOS application running locally or in staging (`http://localhost:3000`).
2. Keyboard-only navigation mode (mouse should be physically set aside or not touched during test).
3. Modern browser with Accessibility Tree inspection tools enabled in DevTools.
4. Screen reader optional but recommended (macOS VoiceOver, Windows NVDA, or ChromeVox).

## Manual Test Procedure

### Step 1: Keyboard-Only Navigation & Tab Flow (Unauthenticated)
1. Disconnect or avoid touching the mouse.
2. Navigate to `http://localhost:3000/login` via URL bar.
3. Press `Tab` repeatedly to cycle through the page:
   - Verify tab lands on:
     1. "Email address" input
     2. "Password" input
     3. "Sign In" button
     4. "Create your account" link
4. Verify every element displays a distinct, high-contrast visual focus ring (e.g., `ring-2 ring-primary ring-offset-2`).
5. Type test credentials using keyboard, press `Enter` on the submit button.

### Step 2: Tab Order & Focus Indicators Across Application Shell
1. Upon landing on `/dashboard`, press `Tab` to navigate through the interface.
2. Verify tab order proceeds in logical reading sequence:
   - Sidebar skip / collapse toggle button
   - "Quick search..." command palette button
   - Navigation links: "Dashboard", "Projects", "Tasks"
   - User footer: Theme toggle button, Sign Out button
   - Main content header: "Add Task", "Add Project", "Refresh" buttons
   - KPI cards and Recent Tasks list items
3. Confirm that no interactive element is skipped, invisible, or untabbable.
4. Confirm that focus outline is never suppressed (`outline: none` without a visible replacement is strictly prohibited).

### Step 3: Modal Dialog Focus Management & Escape Dismissal
1. Use keyboard to tab to the "Add Task" button on `/dashboard` and press `Enter` or `Space`.
2. Verify that the "Create New Task" modal dialog opens:
   - Initial focus automatically moves into the dialog (first input: "Title" or close button).
   - Press `Tab` repeatedly: verify focus is **trapped** inside the modal dialog. Focus must NOT escape to background elements obscured by the backdrop.
   - Press `Shift+Tab`: verify reverse tab order cycles cleanly within the modal.
3. Press the `Escape` key:
   - Verify the modal closes immediately.
   - Verify focus is returned smoothly to the "Add Task" trigger button that opened it.

### Step 4: Form Labels, Control Associations & Screen Reader Auditing
1. Navigate to `/projects`.
2. Open the "New Project" modal using keyboard.
3. Inspect form elements with browser Accessibility DevTools or screen reader:
   - Verify each `<input>`, `<textarea>`, and `<select>` is explicitly associated with its `<label>` via `htmlFor` matching the input `id`.
   - Verify action buttons have accessible names (e.g., icon-only buttons have `aria-label="Collapse sidebar"` or `title`).
   - Check status badges and priority indicators: verify screen reader announces priority levels accurately.

### Step 5: Color Contrast & Text Legibility (Dark & Light Modes)
1. Inspect primary button text, muted descriptions, and badge text in both Dark and Light themes.
2. Use Chrome DevTools Lighthouse or CSS Overview contrast inspection:
   - Standard body text (`text-foreground` on `bg-background`): must achieve >= 4.5:1 contrast ratio.
   - Large text / headings: must achieve >= 3:1 contrast ratio.
   - UI component boundaries / active icons: must achieve >= 3:1 contrast ratio against background.
3. Confirm that error alerts (`text-destructive` on `bg-destructive/10`) remain legible and do not rely solely on color to convey meaning (icon and explicit text must accompany error).

### Step 6: Interactive Element Distinguishability
1. Review all views: verify that clickable links and buttons are immediately distinguishable from static body text via styling, underlines, weights, or enclosing pill shapes.
2. Verify that disabled buttons (`disabled`) communicate their inactive state via reduced opacity and `aria-disabled="true"`.

## Expected Result

- 100% of workflows and actions can be performed using only the keyboard.
- Every interactive element has an unmistakable, high-visibility focus ring.
- Modals trap focus appropriately and return focus upon Escape dismissal.
- Labels are properly linked to inputs.
- Color contrast meets WCAG 2.1 AA standards across both themes.

## Failure Conditions

1. Interactive controls cannot be reached or activated using keyboard navigation alone.
2. Focus indicators are missing, faint, or suppressed.
3. Focus escapes open modals to background elements.
4. Pressing Escape does not close modal dialogs or command palette.
5. Icon buttons lack accessible `aria-label` or descriptive text.
6. Contrast between text and background fails WCAG AA minimum thresholds.

## Evidence Required

- Screenshot showing visible keyboard focus ring on an interactive input or button.
- Screenshot of open modal showing active focus trap and focus retention.
- Lighthouse Accessibility audit report or browser accessibility tree snapshot.
- Tester notes documenting complete keyboard-only walkthrough from login to task creation and deletion.

## Human Result

```text
STATUS: PASS
```

## Tester Notes

Remediation verified:
1. Modal focus trap engineered in `src/components/ui/modal.tsx`:
   - Cyclical Tab and Shift+Tab keydown listeners constrain focus inside the active modal dialog.
   - Document `focusin` redirection actively intercepts any outside focus attempts and returns focus to the modal.
   - Escape key dismisses modal dialogs cleanly and restores focus to triggering element.
   - WAI-ARIA `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `aria-describedby` fully wired.
2. Form label association fixed across all modals:
   - Explicit `id` and `name` attributes added to all form controls.
   - Matching `htmlFor` attributes added to all `<label>` tags.
3. Automated test suite `scripts/tests/phase-01/plan-09/modal-accessibility.test.tsx` passes 6/6 tests.
4. Browser check H10 passed with visible focus rings and verified focus trap.

## Evidence

- `scripts/tests/phase-01/plan-09/verification-evidence/check-10-accessibility/screenshot-01-login-focus-ring.png`
- `scripts/tests/phase-01/plan-09/verification-evidence/check-10-accessibility/screenshot-02-app-shell-focus-ring.png`
- `scripts/tests/phase-01/plan-09/verification-evidence/check-10-accessibility/screenshot-03-modal-focus-trap.png`
- `scripts/tests/phase-01/plan-09/verification-evidence/check-10-accessibility/screenshot-04-high-contrast-wcag-aa.png`
- `scripts/tests/phase-01/plan-09/verification-evidence/check-10-accessibility/recording.webm`
- Result JSON: `scripts/tests/phase-01/plan-09/verification-evidence/check-10-accessibility/result.json`
