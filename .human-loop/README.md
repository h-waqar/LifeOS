# LifeOS Human Verification Loop Framework (`.human-loop/`)

## 1. Purpose & Core Philosophy

The `.human-loop/` framework establishes a repository-native, deterministic, and auditable protocol for all verification activities that **cannot be reliably established through automated tests alone**.

In modern full-stack development, automated tests (unit tests, integration tests, contract tests, and even headless browser E2E journeys) provide vital regression protection. However, automation cannot replace human evaluation for:
- Visual polish, typographical harmony, and spatial alignment.
- Usability, ergonomic flow, and tactile feel.
- Real-world accessibility, screen reader comprehension, and keyboard focus flow.
- Mobile touch ergonomics, drawer interactions, and responsive scaling.
- Error message clarity, empathetic feedback, and recovery guidance.
- Prevention of subtle visual defects (clipping, layout shifts, unstyled flashes).

### The Prime Directive: Zero Fabrication

> **Automated evidence may NEVER be cited as proof of human verification.**
> - `Browser E2E: PASS` and `Human visual inspection: PENDING` is valid and honest.
> - `Browser E2E: PASS` and `Human visual inspection: PASS` is strictly prohibited unless a human tester has personally executed the test procedure and attached verifiable evidence.
> - Never mark an item `VERIFIED` until a human has explicitly performed the test.
> - Never fabricate tester names, timestamps, fake screenshots, or synthetic approvals.

---

## 2. Verification State Machine

Every verification check document transitions through a strict, finite state machine:

```
                  ┌───────────────┐
                  │    PENDING    │ (Default state)
                  └───────┬───────┘
                          │
                          ▼
                  ┌───────────────┐
                  │  IN_PROGRESS  │
                  └───────┬───────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
  │   BLOCKED   │  │   FAILED    │  │  VERIFIED   │
  └──────┬──────┘  └──────┬──────┘  └─────────────┘
         │                │
         └────────┬───────┘
                  ▼ (defect resolved / block cleared)
           [ Re-Test Pass ]
                  ▼
            ┌───────────┐
            │ VERIFIED  │
            └───────────┘
```

An orthogonal state:
```
  ┌─────────────┐
  │   WAIVED    │ (Requires documented, explicit rationale; never silent)
  └─────────────┘
```

### State Definitions & Invariants

| State | Definition | Requirements & Constraints |
|---|---|---|
| `PENDING` | The check has been defined and scheduled, but no human has yet executed the manual procedure. | Default initial state. Remains in `pending/<plan>/`. |
| `IN_PROGRESS` | A human tester is actively executing the test procedure or collecting verification artifacts. | Tester identity must be documented. |
| `BLOCKED` | The tester cannot execute the procedure due to an environment, infrastructure, or dependency issue. | The blocking condition MUST be documented in the check file. |
| `FAILED` | The human tester executed the procedure and discovered a functional, visual, or usability defect. | The defect description and reproduction steps MUST be documented. The file remains in `pending/<plan>/`. |
| `VERIFIED` | The human tester explicitly confirmed all expected results and observed zero failure conditions. | Concrete evidence (screenshot, recording, or terminal log) MUST be attached. The file is moved to `verified/<plan>/`. |
| `WAIVED` | The check is formally bypassed by the project owner or lead. | Requires documented justification explaining why manual verification is unnecessary. Never waived silently. |

---

## 3. Directory Structure

```text
.human-loop/
├── README.md                          # This framework specification
├── INDEX.md                           # Top-level navigation and operational status
├── progress/
│   ├── README.md                      # Progress reporting methodology
│   ├── current.md                     # Active verification plan dashboard
│   ├── plan-01-09.md                  # Plan-specific progress tracking
│   └── plan-XX-YY.md                  # Future plan progress reports
├── pending/
│   ├── plan-01-09/                    # Unverified checks for Plan 01-09
│   │   ├── H01-authentication.md
│   │   ├── H02-registration.md
│   │   └── ...
│   └── plan-XX-YY/                    # Future plan pending checks
├── verified/
│   ├── plan-01-09/                    # Successfully verified checks for Plan 01-09
│   │   └── .gitkeep
│   └── plan-XX-YY/
└── artifacts/
    ├── plan-01-09/                    # Genuine human evidence files
    │   ├── screenshots/
    │   ├── recordings/
    │   └── reports/
    └── plan-XX-YY/
```

---

## 4. How Human Testers Perform Verification

### Phase A: Preparation
1. Ensure the target environment is operational (e.g. `npm run dev` or production build `npm run build && npm start`).
2. Verify that automated test suites pass cleanly before beginning manual verification.
3. Open the active check file in `.human-loop/pending/<plan>/HXX-<name>.md`.
4. Update `Status` in the metadata table to `IN_PROGRESS` and record your name in `Tester`.

### Phase B: Execution
1. Follow the step-by-step **Manual Test Procedure** exactly as specified.
2. Observe UI interactions, responsive behaviors, console messages, and network responses.
3. Check all criteria in **Expected Result** and ensure no item in **Failure Conditions** is triggered.

### Phase C: Evidence Capture
1. Take high-resolution screenshots or short screen recordings capturing the tested states.
2. Save artifacts into `.human-loop/artifacts/<plan>/screenshots/` or `recordings/` using descriptive names (e.g. `H01-sign-in-error.png`).

### Phase D: Recording Results
1. In the check document, update the `## Human Result` block:
   ```markdown
   ## Human Result

   STATUS: VERIFIED
   Tester: Hamza Waqar
   Date: 2026-09-13
   Environment: localhost (Next.js 15.5 production build, PostgreSQL 16)
   Browser: Chrome 140.0.0.0
   Viewport: 1440x900
   ```
2. Populate `## Evidence` with repository-relative paths to captured artifacts:
   ```markdown
   ## Evidence

   - `.human-loop/artifacts/plan-01-09/screenshots/H01-login-success.png`
   - `.human-loop/artifacts/plan-01-09/screenshots/H01-invalid-credentials.png`
   ```
3. Populate `## Tester Notes` with observational context.

---

## 5. Movement Rules & Defect Lifecycle

### Moving from Pending to Verified

When (and only when) a check reaches `STATUS: VERIFIED`:
1. Move the markdown file from `pending/<plan>/` to `verified/<plan>/`:
   ```bash
   git mv .human-loop/pending/plan-01-09/H01-authentication.md .human-loop/verified/plan-01-09/H01-authentication.md
   ```
2. Do **NOT** delete the file. The complete audit history must remain tracked in Git.
3. Update `.human-loop/progress/current.md` and `.human-loop/progress/<plan>.md`.

### Handling Defects (FAILED State)

If a defect is discovered during verification:
1. Update `STATUS: FAILED` in the check document.
2. Document the failure in `## Tester Notes` and add reproduction steps.
3. Reference the defect screenshot or log in `## Evidence`.
4. The document **MUST REMAIN in `pending/<plan>/`**. It must never be moved to `verified/`.
5. Fix the implementation defect in the codebase.
6. Re-execute the test procedure from Step 1.
7. Only once re-testing confirms the fix, update `STATUS: VERIFIED` and execute the move to `verified/`.

---

## 6. Calculation of Overall Verdict

Overall plan acceptance is computed using strict boolean logic:

```text
               Are all required checks in verified/ (or waived)?
                                    │
                         ┌──────────┴──────────┐
                         │                     │
                        YES                   NO
                         │                     │
           Are there any open defects?         ▼
                         │               VERDICT: PENDING
                   ┌─────┴─────┐
                   │           │
                  NO          YES
                   │           │
                   ▼           ▼
            VERDICT: PASS  VERDICT: FAIL
```

- **PASS:** Allowed only when all required human checks = `VERIFIED` and zero unresolved `RELEASE-BLOCKING` defects exist.
- **FAIL:** Triggered when any check is `FAILED` or a release-blocking defect is uncovered.
- **PENDING:** Triggered when required checks remain in `pending/` awaiting human verification.
- **WAIVED:** Allowed only with documented and authorized justification.

---

## 7. Reusability: Adding Future Plans

This framework is built to scale across all subsequent LifeOS phases (`plan-01-10`, `plan-02-01`, `plan-03-01`, etc.):

1. Create target directories:
   ```bash
   mkdir -p .human-loop/pending/plan-XX-YY .human-loop/verified/plan-XX-YY .human-loop/artifacts/plan-XX-YY/{screenshots,recordings,reports}
   touch .human-loop/verified/plan-XX-YY/.gitkeep
   ```
2. Create human verification suites (`H01-...md`, `H02-...md`) using the standardized template.
3. Create progress report `.human-loop/progress/plan-XX-YY.md`.
4. Update `.human-loop/progress/current.md` and `.human-loop/INDEX.md` to track the new plan.
