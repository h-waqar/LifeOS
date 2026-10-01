---
name: bug-remediation
description: "Systematic software defect diagnosis, reproduction script authoring in scripts/tests/, minimal fix implementation, and regression verification."
version: 1.0.0
trigger_when:
  - "A software defect or failing test is reported in LifeOS"
  - "User needs systematic debugging, reproduction, and remediation"
  - "Verification gaps or regressions are discovered"
allowed_operations:
  - "lifeos_create_task"
  - "lifeos_update_task"
  - "lifeos_search"
required_context:
  - "lifeos://docs/planning/state"
  - "lifeos://docs/planning/decisions"
verification_requirements:
  - "Reproduction test script created under scripts/tests/ reproducing the failure"
  - "Minimal code fix implemented addressing root cause without side effects"
  - "Full test suite and regression pass with zero regressions"
tags:
  - "engineering"
  - "debugging"
  - "quality"
---

# Procedural Skill: Systematic Bug Remediation & Verification

This skill guides engineers and autonomous agents through root-cause analysis, reproduction test isolation, minimal surgical remediation, and full regression verification for LifeOS.

## Objectives
1. Pinpoint and isolate software defects before making any codebase modifications.
2. Maintain strict repository conventions: all tests strictly reside in `scripts/tests/`, never in `src/`.
3. Deliver minimal, atomic code fixes that resolve bugs without introducing collateral side effects.

## Step-by-Step Procedure

### Step 1: Defect Characterization & Planning Context
- Query `.planning/` state via `lifeos://docs/planning/state` and architectural decisions via `lifeos://docs/planning/decisions`.
- Review the error trace, reproduction steps, or unexpected system behavior.
- Search related domain documentation and ADRs using `lifeos_search` or `lifeos_search_docs`.

### Step 2: Isolated Reproduction Script Authoring
- Author a dedicated reproduction test script under `scripts/tests/` matching the phase/plan context.
- Assert that the reproduction test fails reliably on the unpatched codebase.
- Verify that no test files are placed inside `src/` (strictly adhering to repo rules).

### Step 3: Root-Cause Localization
- Trace code execution from input boundary down to canonical server services.
- Identify the exact constraint violation, type mismatch, edge-case unhandled condition, or off-by-one boundary.

### Step 4: Minimal Surgical Fix Implementation
- Implement the minimal contiguous code fix addressing the root cause.
- Preserve existing comments, function contracts, and type safety constraints.
- Avoid modifying unrelated components or loosening security assertions.

### Step 5: Comprehensive Verification & Regression Gate
- Run the dedicated reproduction test to verify it turns green.
- Run the full regression test suite across all previous phases.
- Run `tsc --noEmit` and `pnpm build` to confirm zero compilation or packaging errors.
