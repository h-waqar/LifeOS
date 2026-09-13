# H02 — Registration Human Verification

## Metadata

| Field | Value |
|---|---|
| Plan | 01-09 |
| Verification ID | H02 |
| Status | PENDING |
| Priority | RELEASE-BLOCKING |
| Tester | TBD |
| Date | TBD |
| Environment | TBD |
| Application Version | TBD |

## Objective

Verify that user registration operates strictly under LifeOS single-user personal operating system constraints. This includes validating form usability, input requirement validation (minimum 8-character password, valid email syntax), successful registration of the initial owner account, auto-lock rejection of subsequent registration attempts (403 Forbidden with clear single-user explanatory messaging), and security against disclosure of sensitive configuration or database details.

## Preconditions

1. LifeOS application running locally or in staging environment (e.g. `http://localhost:3000`).
2. Two test scenarios must be available:
   - Initial fresh state (or clean database where no user exists) to test first-owner creation.
   - Initial owner already present in the database to test second-user rejection.
3. Browser opened with Developer Tools accessible.

## Manual Test Procedure

### Step 1: Registration View Usability & Layout
1. Navigate to `http://localhost:3000/register`.
2. Inspect the rendered view:
   - Centered card (`data-testid="register-card"`).
   - LifeOS icon ("L") and header "Initialize LifeOS".
   - Subtitle: "Register the primary owner account for this LifeOS instance".
   - Form fields: "Full Name" (`data-testid="register-name"`), "Email address" (`data-testid="register-email"`), "Password (min 8 characters)" (`data-testid="register-password"`).
   - Submit button: "Create Account" (`data-testid="register-submit"`).
   - Footer link: "Already have an account? Sign In" pointing to `/login`.
3. Verify that labels are cleanly paired with input fields and visual focus indicators work on Tab navigation.

### Step 2: Form Input Validation
1. Test empty submission: Click "Create Account" with blank fields. Verify the form displays "Please fill in all required fields."
2. Test short password: Enter Name: "Test User", Email: "test@example.com", Password: "short". Click "Create Account". Verify validation displays "Password must be at least 8 characters long." without sending unnecessary server requests.

### Step 3: First-Owner Registration (Clean System Scenario)
1. On a fresh/clean instance where no user exists, enter:
   - Full Name: `Hamza Waqar`
   - Email: `hamza@lifeos.local`
   - Password: `StrongMasterPassword123!`
2. Click "Create Account".
3. Verify:
   - Loading indicator displays on the submit button.
   - Success toast appears: "Account created successfully! Welcome to LifeOS."
   - User is automatically redirected to `/dashboard`.
   - The dashboard displays active session for `hamza@lifeos.local`.

### Step 4: Subsequent Registration Rejection (Single-User Lock)
1. Open a new private/incognito window (or sign out of the active session).
2. Navigate to `http://localhost:3000/register`.
3. Enter credentials for an unauthorized second user:
   - Full Name: `Second User`
   - Email: `intruder@lifeos.local`
   - Password: `AnotherPassword123!`
4. Click "Create Account".
5. Verify the response:
   - A prominent warning alert banner (`data-testid="auth-error"`) appears with a `ShieldAlert` icon.
   - The banner title indicates "Registration Locked".
   - The error message clearly explains: "Registration is closed. LifeOS is configured for single-user mode."
   - A corresponding Sonner toast error is displayed.
   - The registration does not succeed and the user is NOT redirected to `/dashboard`.
   - Inspect the network response tab: verify HTTP 403 Forbidden is returned and no internal database connection details or stack traces are leaked.

## Expected Result

- Initial registration allows exactly one owner to claim and initialize LifeOS.
- Subsequent registration attempts are rejected with HTTP 403 and a helpful "Registration Locked" UI banner.
- Validation prevents weak passwords under 8 characters.
- No sensitive system data, database tables, or exception traces are leaked.

## Failure Conditions

1. Registration allows multiple accounts to be created.
2. Second registration fails silently without an understandable explanation.
3. Passwords shorter than 8 characters are accepted.
4. Error responses leak database table structures, SQL errors, or stack traces.
5. Second user is erroneously logged in or granted access to `/dashboard`.

## Evidence Required

- Screenshot of initial owner registration form before submission.
- Screenshot of successful redirect to `/dashboard` for initial owner.
- Screenshot of the "Registration Locked" alert banner when a second registration is attempted.
- Network response inspection confirming HTTP 403 status and sanitized error payload.

## Human Result

```text
STATUS: PENDING
```

## Tester Notes

TBD

## Evidence

TBD
