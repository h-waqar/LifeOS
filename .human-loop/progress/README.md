# Human Verification Progress Tracking

## Overview

The `.human-loop/progress/` directory houses the real-time, evidence-based status reports for human acceptance verification across LifeOS development plans.

Human verification bridges the critical gap that automated testing, CDP browser automation, and unit/integration tests cannot close: human aesthetic judgment, usability, edge-case interaction feel, accessibility with assistive tools, and genuine visual acceptance.

## Directory Layout

```text
.human-loop/progress/
├── README.md           # Progress reporting methodology and governance rules
├── current.md          # Active verification focus (symlink or mirror of active plan)
└── plan-01-09.md       # Specific report for Plan 01-09 (Foundation UI & Shell)
```

## Structure of a Progress Report

Each progress report document conforms to a deterministic schema:

1. **Executive Acceptance Verdict:**
   - Explicitly contrasts Automated Verification (PASS/FAIL) with Human Verification (PENDING/IN_PROGRESS/FAILED/VERIFIED/WAIVED) and Overall Acceptance.
2. **Aggregate Metrics Block:**
   - Derived directly by counting documents in `pending/` and `verified/`.
   - Never fabricated or estimated.
3. **Item Status Matrix:**
   - Detailed table listing Verification ID, Functional Area, Status, Priority, Assigned Tester, Attached Evidence, and Latest Notes.
4. **Human Artifact Index:**
   - Links to repository-relative artifacts (screenshots, screen recordings, accessibility audits) recorded by human testers under `artifacts/<plan>/`.
   - Never references non-existent files.
5. **Verdict Decision Criteria:**
   - Transparent rules for calculating the final release verdict.

## Derivation Rules for Metrics

All metrics reported in `current.md` and per-plan progress files must be derived from actual document inspection:

$$\text{Total Human Checks} = \text{Count}(\text{pending}/\{\text{plan}\}/*) + \text{Count}(\text{verified}/\{\text{plan}\}/*)$$

- **Verified:** Count of check files in `verified/{plan}/` with `STATUS: VERIFIED`.
- **Pending:** Count of check files in `pending/{plan}/` with `STATUS: PENDING`.
- **In Progress:** Count of check files with `STATUS: IN_PROGRESS`.
- **Blocked:** Count of check files with `STATUS: BLOCKED`.
- **Failed:** Count of check files with `STATUS: FAILED`.
- **Waived:** Count of check files with `STATUS: WAIVED`.

$$\text{Human Verification Completion} = \frac{\text{Verified} + \text{Waived}}{\text{Total Human Checks}} \times 100\%$$

## Maintenance Workflow

1. When a human tester begins an item, they update its status to `IN_PROGRESS` and update the progress table.
2. When a human tester identifies a defect, the item is marked `FAILED`, the defect is documented, and the progress report is updated.
3. When a human tester confirms passing criteria and captures evidence, the check file is moved to `verified/{plan}/` with `STATUS: VERIFIED`, the artifact is indexed, and the progress report is regenerated.
