# Quick Task Plan: 260913-rpm

**Task**: Remediate Double-Submit Test Teardown Race & Mobile Task-Title Wrapping
**Date**: 2026-09-13
**Type**: quick

## Overview

Independent release acceptance review on September 13, 2026 identified two remaining items:
1. **Double-submit test teardown race**: In `scripts/tests/phase-01/plan-09/double-submit-race.test.tsx`, the third test asserts that subsequent submission occurred before the async mutation completed, risking an unhandled React update after Happy-DOM teardown.
2. **Mobile task-title behavior**: In `src/app/tasks/page.tsx`, task titles currently use `truncate` which hides long titles instead of wrapping them. Acceptance criteria in `H05` and `H06` explicitly mandate that task titles wrap naturally within viewport bounds without truncation or horizontal overflow.

## Tasks

- [ ] **Task 1: Fix the double-submit test teardown race**
  - Inspect and update `scripts/tests/phase-01/plan-09/double-submit-race.test.tsx`.
  - In test 3 ("allows subsequent submission after successful mutation completion"), await the second mutation's completion and loading state restoration (`hasAttribute("disabled") === false`) before finishing.
  - Also ensure tests 1 and 2 wait for asynchronous mutations to fully resolve and restore loading state before exiting.
  - Verify deterministic execution with delays preserved.

- [ ] **Task 2: Fix mobile task-title wrapping on `/tasks`**
  - In `src/app/tasks/page.tsx`, replace `truncate` on task titles with `break-words [overflow-wrap:anywhere]`.
  - Preserve nested indentation (`ml-6 sm:ml-8`).
  - Ensure long titles wrap cleanly without causing horizontal overflow.
  - Preserve desktop and tablet layouts.

- [ ] **Task 3: Run comprehensive verification**
  - `pnpm vitest run scripts/tests/phase-01/plan-09/double-submit-race.test.tsx`
  - `pnpm vitest run scripts/tests/phase-01/plan-09/modal-accessibility.test.tsx`
  - `pnpm test`
  - `pnpm test:integration`
  - `pnpm tsc --noEmit`
  - `pnpm build`
  - `npx tsx scripts/tests/phase-01/plan-09/execute-human-loop-verification.ts`

- [ ] **Task 4: Update documentation and verification artifacts**
  - Document rationale and findings in `lifeos_qa_human_verification_report.md` and `.human-loop/pending/plan-01-09/H06-responsive-mobile.md`.
  - Produce SUMMARY.md and record quick task completion.
  - Verify clean working tree and commit remediation.
