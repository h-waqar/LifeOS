---
name: weekly-review
description: "Comprehensive weekly reflection, habit streak evaluation, stalled project triage, and task rollover."
version: 1.0.0
trigger_when:
  - "User initiates weekly review or reflection ritual"
  - "End of week schedule check or Sunday planning session"
  - "Stalled projects or overgrown task inboxes need cleanup"
allowed_operations:
  - "lifeos_update_task"
  - "lifeos_delete_task"
  - "lifeos_update_project"
  - "lifeos_log_habit"
required_context:
  - "lifeos://context/overview"
  - "lifeos://context/tasks/today"
  - "lifeos://context/daily-plan"
verification_requirements:
  - "All overdue tasks are either rescheduled, completed, or cancelled"
  - "Habit streaks and consistency rates over the last 7 days are reviewed"
  - "Next week focus blocks and key priorities are clearly established"
tags:
  - "review"
  - "habits"
  - "retrospective"
---

# Procedural Skill: Weekly Review & Ritual Alignment

This skill guides agents and operators through the end-of-week reflection, habit streak evaluation, stalled project triage, and week-ahead planning.

## Objectives
1. Clear the inbox and triage overdue tasks into clean backlog, rescheduled, or cancelled states.
2. Evaluate habit consistency rates over the trailing 7 days and identify friction points.
3. Review stalled projects and set top 3 focal priorities for the upcoming week.

## Step-by-Step Procedure

### Step 1: Retrospective State Capture
- Load consolidated system state via `lifeos://context/overview`.
- Inspect overdue tasks and current daily plan via `lifeos://context/tasks/today` and `lifeos://context/daily-plan`.

### Step 2: Overdue Task Triage
- For each task overdue by > 24 hours:
  - If still relevant and immediately actionable, update `scheduledDate` to the upcoming week using `lifeos_update_task`.
  - If no longer relevant or superseded, set status to `cancelled` using `lifeos_update_task` or remove via `lifeos_delete_task`.
  - If blocked, tag with `blocked` status and identify blocker dependency.

### Step 3: Habit Streak & Consistency Review
- Examine active habits and streak data from `lifeos://context/overview`.
- Calculate consistency percentage for the last 7 days: `(completedDays / 7) * 100`.
- If any habit entry was completed offline and unrecorded, record completion via `lifeos_log_habit`.

### Step 4: Stalled Project Triage
- Inspect projects with zero tasks completed in the trailing 14 days.
- Either:
  - Mark project as `on_hold` if priorities shifted, or
  - Generate 3 immediate next actions to unblock momentum.

### Step 5: Post-Review Verification
- Assert that zero overdue tasks remain in an ambiguous state.
- Confirm habit streak metrics are up to date.
- Confirm that the top 3 priorities for next week are explicitly defined.
