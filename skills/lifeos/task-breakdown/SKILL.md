---
name: task-breakdown
description: "Structured decomposition of goals or projects into 3-7 sequenced, atomic tasks with duration estimates, dependencies, and priority scoring."
version: 1.0.0
trigger_when:
  - "User requests breaking down a goal or project into actionable steps"
  - "A project or goal lacks actionable immediate tasks"
  - "User needs duration estimates and sequencing for a complex task"
allowed_operations:
  - "lifeos_create_task"
  - "lifeos_update_task"
  - "lifeos_search"
required_context:
  - "lifeos://context/projects/active"
  - "lifeos://context/goals/active"
verification_requirements:
  - "All decomposed tasks must have non-empty titles and duration estimates (15-120 minutes)"
  - "All decomposed tasks must specify valid priority levels"
  - "Total task count must be between 3 and 7 atomic units"
tags:
  - "planning"
  - "tasks"
  - "decomposition"
---

# Procedural Skill: Task Breakdown & Atomic Decomposition

This skill guides agents and operators through decomposing high-level projects, goals, or complex deliverables into 3–7 actionable, self-contained, sequenced tasks.

## Objectives
1. Eliminate ambiguity by breaking large objectives into discrete chunks of 15 to 120 minutes.
2. Form an executable dependency DAG ensuring prerequisite tasks are completed before downstream work starts.
3. Establish accurate priority scoring and energy requirements for frictionless daily scheduling.

## Step-by-Step Procedure

### Step 1: Context & Dependency Analysis
- Query active projects via `lifeos://context/projects/active` or active goals via `lifeos://context/goals/active`.
- If breaking down an existing project or goal, inspect its current status, deliverables, and existing associated tasks.
- Use `lifeos_search` to verify if similar tasks or templates already exist in the system.

### Step 2: Scope Splitting (Rule of 3–7)
- Identify the definitive end state ("Definition of Done").
- Split the scope into **at least 3 and no more than 7** atomic tasks.
- If more than 7 tasks emerge, group them into sub-phases or create a parent project instead.
- If fewer than 3 tasks emerge, verify whether the item is already an atomic task rather than a project.

### Step 3: Atomic Task Specification
For each decomposed task, define:
- **Title**: Imperative, unambiguous title starting with an action verb (e.g. "Draft schema migration for habit logs", "Implement verification unit tests").
- **Estimated Duration**: Realistic duration estimate strictly between 15 and 120 minutes.
- **Priority**: Assign appropriate urgency/importance: `low`, `medium`, `high`, or `critical`.
- **Energy Level**: Tag as `low`, `medium`, or `high` based on cognitive intensity.
- **Project/Goal Linkage**: Retain `projectId` or `goalId` associations.

### Step 4: Batch Creation via Canonical Service
- Create tasks sequentially using `lifeos_create_task`.
- Order task creation in chronological execution order.

### Step 5: Post-Creation Verification
- Confirm all created tasks appear under active project task lists.
- Verify total task count is within the 3–7 range.
- Ensure no task has an estimated duration outside the 15–120 minute window.
