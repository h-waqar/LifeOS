# Quick Task Plan: 260913-o3k

**Task**: Remediate Release QA Defects (H06 Tablet Layout, H09 Race Condition, H10 Modal A11y)
**Date**: 2026-09-13
**Type**: quick

## Overview

Browser-based human verification audit rejected the release due to three defects:
1. **Defect 1 (Check H06)**: Tablet Responsive Layout - dashboard lower grid uses `md:grid-cols-2`, squeezing task and project titles at 768px when sidebar is open.
2. **Defect 2 (Check H09)**: Double-Submit Race Condition - rapid successive clicks create duplicate database records before React loading state disables the button.
3. **Defect 3 (Check H10)**: Modal Accessibility - modals allow keyboard focus to escape to obscured background elements and lack programmatic label/input associations.

## Tasks

- [x] **Task 1: Defect 1 — Tablet Responsive Layout (Check H06)**
  - Inspect `src/app/dashboard/page.tsx` lower grid layout.
  - Update breakpoint from `md:grid-cols-2` to `lg:grid-cols-2`.
  - Ensure Recent Tasks and Active Projects stack vertically on tablet (768px) and give full width for card contents.
  - Preserve desktop (1440px) and mobile (390px) layouts.

- [x] **Task 2: Defect 2 — Double-Submit Race Condition (Check H09)**
  - Inspect all mutation submission handlers in `src/app/dashboard/page.tsx`, `src/app/projects/page.tsx`, `src/app/tasks/page.tsx`.
  - Add synchronous submission guards using `useRef` before any asynchronous call begins, resetting in `finally` blocks.
  - Ensure all create, update, delete mutation handlers are protected.
  - Ensure failed requests do not permanently lock the UI.

- [x] **Task 3: Defect 3 — Modal Accessibility & Label Associations (Check H10)**
  - Enhance `src/components/ui/modal.tsx` with robust focus trapping:
    - Capture initial focus on open.
    - Trap Tab and Shift+Tab cycling within the modal's focusable elements.
    - Escape key closes dialog.
    - Restore focus to trigger element on close.
    - Set appropriate ARIA dialog attributes (`role="dialog"`, `aria-modal="true"`).
  - Add explicit `id` and `htmlFor` associations to all modal form controls across `src/app/dashboard/page.tsx`, `src/app/projects/page.tsx`, `src/app/tasks/page.tsx`.

- [x] **Task 4: Automated Regression Tests**
  - Add regression tests for double-submit race condition in `scripts/tests/phase-01/plan-09/double-submit-race.test.tsx`.
  - Add regression tests for modal focus containment and label associations in `scripts/tests/phase-01/plan-09/modal-accessibility.test.tsx`.
  - Fix test environment user conflict in adversarial test setup if existing user present.
  - Verify all unit and integration tests pass cleanly (`pnpm test`, `pnpm test:integration`).

- [x] **Task 5: End-to-End Browser Verification & Audit Reports**
  - Re-run H06, H09, H10 and full H01-H12 test suite using `scripts/tests/phase-01/plan-09/execute-human-loop-verification.ts`.
  - Update `lifeos_qa_human_verification_report.md` and `.human-loop/progress/current.md` with final evidence and ACCEPTED verdict.
