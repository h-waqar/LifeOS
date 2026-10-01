---
name: goal-alignment
description: "Aligning daily tasks and active projects with quarterly goals, metric rollups, and focus areas."
version: 1.0.0
trigger_when:
  - "User requests reviewing goal progress or alignment"
  - "Orphaned tasks or projects without associated goals are detected"
  - "Setting up quarterly or monthly milestones"
allowed_operations:
  - "lifeos_update_goal"
  - "lifeos_update_project"
  - "lifeos_update_task"
  - "lifeos_search"
required_context:
  - "lifeos://context/goals/active"
  - "lifeos://context/projects/active"
  - "lifeos://context/overview"
verification_requirements:
  - "Every active project is linked to at least one active goal"
  - "Metric rollup targets are quantified and current progress recorded"
  - "Alignment status is verified across all priority-high items"
tags:
  - "goals"
  - "strategy"
  - "alignment"
---

# Procedural Skill: Strategic Goal Alignment & Metric Rollup

This skill guides agents and operators through auditing and aligning operational work (tasks and projects) with high-level strategic objectives and measurable key results.

## Objectives
1. Ensure zero orphaned projects by connecting every active workstream to a parent goal.
2. Update progress percentages and quantitative metrics based on completed milestones.
3. Reprioritize tasks that directly accelerate lagging goals.

## Step-by-Step Procedure

### Step 1: Active Goal State Ingestion
- Retrieve current active goals via `lifeos://context/goals/active`.
- Retrieve active projects via `lifeos://context/projects/active`.
- Retrieve overall system context via `lifeos://context/overview`.

### Step 2: Orphaned Entity Identification
- Filter active projects where `goalId` is null or invalid.
- Filter high-priority tasks scheduled for the current week that have neither a `projectId` nor a `goalId`.
- Search for corresponding thematic goals using `lifeos_search`.

### Step 3: Association & Alignment Linking
- For each unlinked project, identify the best matching strategic goal.
- Use `lifeos_update_project` to attach the project to the target `goalId`.
- For unlinked standalone tasks, associate them with either an existing project or a parent goal.

### Step 4: Metric & Milestone Rollup Calculation
- For each active goal, count the total and completed projects/tasks.
- Calculate updated milestone progress percentage: `(completedUnits / totalUnits) * 100`.
- Update the goal's current progress and status using `lifeos_update_goal`.

### Step 5: Verification & Integrity Assertions
- Confirm that 100% of active projects point to a valid active goal.
- Verify that goal progress figures reflect realistic operational completion.
- Log an alignment summary for the operator.
