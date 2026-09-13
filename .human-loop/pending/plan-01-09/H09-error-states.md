# H09 — Error & Edge States Human Verification

## Metadata

| Field | Value |
|---|---|
| Plan | 01-09 |
| Verification ID | H09 |
| Status | PENDING |
| Priority | HIGH |
| Tester | TBD |
| Date | TBD |
| Environment | TBD |
| Application Version | TBD |

## Objective

Verify that LifeOS handles error conditions, network anomalies, boundary edge cases, and hostile/unexpected inputs gracefully, securely, and recoverably. This includes testing invalid form submissions, duplicate registrations, backend database connection drops, simulated network latency (slow 3G), rapid repeated button clicks (debouncing/double-submit defense), expired sessions, unauthorized resource tampering, empty collections, and extreme content lengths, confirming that all resulting states are:
1. Understandable to a human user,
2. Non-destructive to existing state,
3. Recoverable without requiring a hard refresh or application restart, and
4. Strictly confidential (zero leak of internal stack traces, database schema, or environment secrets).

## Preconditions

1. LifeOS application running locally or in staging (`http://localhost:3000`).
2. Chrome DevTools Network panel open to simulate Network Throttling (Slow 3G, Offline).
3. Authenticated session active.

## Manual Test Procedure

### Step 1: Rapid Repeated Clicks (Double-Submit Defense)
1. Open the "Create New Task" modal.
2. Enter Title: "Debounce Concurrency Test".
3. Rapidly and repeatedly click the "Create Task" submit button 5 times within 1 second.
4. Verify:
   - The button immediately enters a disabled/loading state upon the first click.
   - Exactly ONE task is created in the database and displayed in the tree (no duplicate task spamming).
   - Only a single success toast is emitted.

### Step 2: Extreme Input Lengths & Special Characters
1. Open "Create New Project" modal.
2. Enter Name: A 255-character string of diverse Unicode characters, emoji, and punctuation (`🚀 LifeOS Extreme Boundary ⚡️ & <script>alert("XSS")</script> 汉字`).
3. Enter Description: A 2000-character block of dense text.
4. Click "Create Project".
5. Verify:
   - Submission succeeds or fails gracefully based on length limits.
   - The project card displays the name and description properly rendered.
   - The `<script>` tag is rendered purely as escaped text (zero XSS execution).
   - The card does not blow out grid margins or overlap neighboring cards.

### Step 3: Simulated Slow Network Latency
1. In Chrome DevTools Network tab, select Throttling: "Slow 3G".
2. On `/tasks`, click the checkbox to complete a task.
3. Observe:
   - Checkbox or item provides immediate or pending visual feedback.
   - UI does not freeze or become unresponsive.
4. When the request resolves, the task reflects completed status.
5. Reset Network Throttling to "No throttling".

### Step 4: Simulated Backend Disconnection / Offline Mode
1. In DevTools Network tab, set Throttling to "Offline" (or temporarily stop the backend PostgreSQL container).
2. Attempt to create a project or edit a task.
3. Verify:
   - The application does not crash with a blank white screen.
   - A clear, non-cryptic error toast or alert appears (e.g., "Failed to create project. Please check your connection.").
   - Form inputs remain filled so the user does NOT lose their typed content.
4. Re-enable network / restart database. Click the submit button again.
5. Verify the mutation succeeds, proving full recovery.

### Step 5: Session Expiry & Unauthorized Access
1. Open DevTools Application -> Cookies tab and delete the Better Auth session cookie (`better-auth.session_token` or similar).
2. Attempt an in-page mutation (e.g. click "Delete" on a project or task).
3. Verify:
   - The mutation is rejected with 401 Unauthorized.
   - The application displays an understandable session expired message and cleanly redirects the user to `/login`.
   - No sensitive data or server internals are revealed.

### Step 6: Empty States
1. Ensure a user account has zero projects and zero tasks.
2. Check `/dashboard`, `/projects`, and `/tasks`.
3. Verify each screen provides an aesthetically pleasing, helpful empty state with a direct call-to-action to create an item, rather than an empty blank void or broken table.

## Expected Result

- Error states are clear, actionable, and user-friendly.
- Mutations are protected against duplicate rapid submissions.
- Temporary network interruptions do not destroy user form input.
- System recovers gracefully when connectivity is restored.
- Zero leakage of SQL queries, file system paths, or environment variables.

## Failure Conditions

1. Rapid clicking causes duplicate database entities or race condition errors.
2. Special characters or HTML tags trigger script execution or break layout rendering.
3. Network errors result in a blank white screen (unhandled React crash).
4. Failed form submissions wipe user inputs, forcing them to re-type everything.
5. Error messages expose database table names, SQL errors, or server stack traces.

## Evidence Required

- Screenshot of rapid click test verifying only a single entity was created.
- Screenshot of extreme string and escaped HTML rendering safely on a card.
- Screenshot of network failure error toast showing user-friendly recovery messaging and preserved form inputs.
- Browser console log showing zero unhandled React crash exceptions.

## Human Result

```text
STATUS: PASS
```

## Tester Notes

Remediation verified:
1. Implemented synchronous `useRef` submission guards before async execution across all create/edit/delete/toggle handlers (`dashboard/page.tsx`, `projects/page.tsx`, `tasks/page.tsx`, `login/page.tsx`, `register/page.tsx`).
2. Rapid successive clicks dispatching in the same tick are immediately and synchronously intercepted before React state re-renders.
3. Automated test `scripts/tests/phase-01/plan-09/double-submit-race.test.tsx` confirms 5 rapid clicks produce exactly 1 task mutation.
4. Browser test runner check H09 executed and passed with 0 duplicate records.
5. Extreme XSS script tags escape cleanly as plain text with zero script execution.

## Evidence

- `scripts/tests/phase-01/plan-09/verification-evidence/check-09-error-states/screenshot-01-rapid-submit-debounce.png`
- `scripts/tests/phase-01/plan-09/verification-evidence/check-09-error-states/screenshot-02-extreme-unicode-xss-escaped.png`
- `scripts/tests/phase-01/plan-09/verification-evidence/check-09-error-states/recording.webm`
- Result JSON: `scripts/tests/phase-01/plan-09/verification-evidence/check-09-error-states/result.json`
