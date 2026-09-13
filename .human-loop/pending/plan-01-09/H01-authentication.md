# H01 — Authentication Human Verification

## Metadata

| Field | Value |
|---|---|
| Plan | 01-09 |
| Verification ID | H01 |
| Status | PENDING |
| Priority | RELEASE-BLOCKING |
| Tester | TBD |
| Date | TBD |
| Environment | TBD |
| Application Version | TBD |

## Objective

Verify that user authentication operates reliably, securely, and intuitively through the web UI. This includes verifying sign-in page rendering, input validation, proper error feedback for invalid credentials, loading state visual feedback during network roundtrips, seamless redirection to the dashboard upon successful login, clean session termination upon logout, enforcement of route guards preventing unauthenticated access, and browser history back-navigation security.

## Preconditions

1. LifeOS application is running locally or in staging environment (e.g. `http://localhost:3000`) connected to PostgreSQL.
2. The primary user account has been registered (e.g., `hamza@lifeos.local` with password `StrongMasterPassword123!`).
3. Browser is opened in Incognito / Private window or fresh session with cookies cleared.
4. Browser Developer Tools console is open to monitor network requests and JavaScript console errors.

## Manual Test Procedure

### Step 1: Sign-In Page Rendering & Inspection
1. Navigate to `http://localhost:3000/login`.
2. Inspect the rendered view. Verify the presence of:
   - Centered login card (`data-testid="login-card"`).
   - LifeOS brand icon ("L") and header "Sign In to LifeOS".
   - Subtitle: "Enter your credentials to access your personal operating system".
   - Form fields: "Email address" (`data-testid="login-email"`) and "Password" (`data-testid="login-password"`).
   - Action button: "Sign In" (`data-testid="login-submit"`).
   - Footer link: "Create your account" pointing to `/register`.
3. Verify that autofocus or tab focus lands appropriately and inputs are clean.

### Step 2: Empty Form Submission
1. Leave both email and password inputs blank.
2. Click "Sign In".
3. Verify that client-side validation activates, preventing network submission, and displays "Please enter both email and password." (or HTML5 required validation prompts).

### Step 3: Invalid Credentials Handling & Error Presentation
1. In the email field, enter `hamza@lifeos.local`.
2. In the password field, enter an incorrect password: `WrongPassword999!`.
3. Click "Sign In".
4. Observe the button state: verify that a loading spinner activates and the button is disabled to prevent duplicate concurrent submissions.
5. Once the server responds (401 Unauthorized), verify:
   - A visible alert banner (`data-testid="auth-error"`) renders with an alert icon and message "Invalid email or password."
   - A Sonner toast error notification appears at the bottom-right.
   - The password input remains safely masked.
   - No stack trace, database error, or internal server details are leaked in the UI or console.

### Step 4: Valid Authentication & Dashboard Redirection
1. In the password field, enter the correct password (`StrongMasterPassword123!`).
2. Click "Sign In".
3. Observe the button loading spinner.
4. Verify that upon successful response:
   - A success toast "Welcome back!" appears.
   - The browser automatically navigates to `http://localhost:3000/dashboard`.
   - The dashboard shell renders with navigation items and the authenticated user's email in the sidebar footer.

### Step 5: Logout Action Verification
1. Locate the sidebar user footer at the bottom-left of the screen.
2. Click the "Sign Out" button (`data-testid="sidebar-signout"` or logout icon button).
3. Verify:
   - A toast notification "Signed out successfully" appears.
   - The application immediately redirects to `http://localhost:3000/login`.
   - The session cookie is invalidated or removed.

### Step 6: Post-Logout Route Guard Enforcement
1. While on `http://localhost:3000/login` following sign-out, manually enter each protected route into the browser URL bar:
   - `http://localhost:3000/dashboard`
   - `http://localhost:3000/projects`
   - `http://localhost:3000/tasks`
2. For each URL, press Enter.
3. Verify that the application immediately redirects back to `http://localhost:3000/login` without rendering protected dashboard widgets, project cards, or task lists.

### Step 7: Browser History Back-Navigation Security
1. After being redirected to `/login` from the step above, click the browser "Back" button.
2. Verify that the browser does not reveal cached authenticated data or allow interacting with protected controls. The application must remain securely on `/login`.

## Expected Result

- Sign-in UI is visually clean, accessible, and responsive.
- Valid credentials grant immediate access and redirect to `/dashboard`.
- Invalid credentials produce clear, friendly, and secure error messages without revealing internal system details.
- Sign out completely terminates user session.
- Direct navigation and browser back navigation fail closed to `/login`.

## Failure Conditions

1. Sign-in accepts invalid credentials or permits login with incorrect passwords.
2. Form submission hangs indefinitely or fails to display loading feedback.
3. Error messages expose database errors, server stack traces, or internal file paths.
4. Sign out fails to clear session state, leaving the user logged in.
5. Protected pages (`/dashboard`, `/projects`, `/tasks`) are accessible while unauthenticated.
6. Browser back navigation displays cached private user data after logout.
7. Uncaught exceptions appear in the browser console.

## Evidence Required

- Screenshot of sign-in page displaying invalid credentials error alert.
- Screenshot of successful redirection to `/dashboard` displaying authenticated user session.
- Screenshot of `/login` redirect following sign out.
- Browser console log showing zero unhandled runtime exceptions.
- Viewport size, browser version, and test timestamp.

## Human Result

```text
STATUS: PENDING
```

## Tester Notes

TBD

## Evidence

TBD
