import { describe, it, expect } from "vitest";
import {
  cascadeGoalProgress,
  calculateGoalProgress,
  type GoalProgressNode,
} from "@/server/goals/rollup";

describe("Phase 2 Plan 02-02: Goal Hierarchy & Upward Cascading Logic", () => {
  it("computes multi-level multi-horizon cascade: Short-term -> Medium-term -> Long-term", () => {
    // Structure:
    // Long-term (Vision): Reach $100k net worth (id: LT)
    // └── Medium-term (Annual): Increase income to $8k/mo (id: MT)
    //     └── Short-term (Monthly): Land 3 new clients (id: ST) - metric: 2/3 clients
    const nodes = new Map<string, GoalProgressNode>([
      [
        "LT",
        {
          id: "LT",
          parentId: null,
          progress: 0,
          status: "in_progress",
          childIds: ["MT"],
          projects: [],
          directTasks: [],
          metric: null,
        },
      ],
      [
        "MT",
        {
          id: "MT",
          parentId: "LT",
          progress: 0,
          status: "in_progress",
          childIds: ["ST"],
          projects: [],
          directTasks: [],
          metric: null,
        },
      ],
      [
        "ST",
        {
          id: "ST",
          parentId: "MT",
          progress: 0,
          status: "in_progress",
          childIds: [],
          projects: [],
          directTasks: [],
          metric: {
            metricType: "numeric",
            targetValue: 3,
            currentValue: 2, // 66.6% -> 67%
          },
        },
      ],
    ]);

    const updates = cascadeGoalProgress(nodes, "ST");

    expect(updates).toEqual([
      { goalId: "ST", oldProgress: 0, newProgress: 67 },
      { goalId: "MT", oldProgress: 0, newProgress: 67 },
      { goalId: "LT", oldProgress: 0, newProgress: 67 },
    ]);
  });

  it("averages multiple child goals progress with distinct deliverable values", () => {
    const nodes = new Map<string, GoalProgressNode>([
      [
        "Parent",
        {
          id: "Parent",
          parentId: null,
          progress: 0,
          status: "in_progress",
          childIds: ["Child1", "Child2", "Child3"],
          projects: [],
          directTasks: [],
          metric: null,
        },
      ],
      [
        "Child1",
        {
          id: "Child1",
          parentId: "Parent",
          progress: 100,
          status: "completed",
          childIds: [],
          projects: [],
          directTasks: [],
          metric: null,
        },
      ],
      [
        "Child2",
        {
          id: "Child2",
          parentId: "Parent",
          progress: 50,
          status: "in_progress",
          childIds: [],
          projects: [],
          directTasks: [],
          metric: null,
        },
      ],
      [
        "Child3",
        {
          id: "Child3",
          parentId: "Parent",
          progress: 0,
          status: "not_started",
          childIds: [],
          projects: [],
          directTasks: [],
          metric: null,
        },
      ],
    ]);

    const updates = cascadeGoalProgress(nodes, "Child2");
    const parentUpdate = updates.find((u) => u.goalId === "Parent");
    // (100 + 50 + 0) / 3 = 150 / 3 = 50%
    expect(parentUpdate?.newProgress).toBe(50);
  });

  it("retains completed status and clamps progress to 100% when all children finish", () => {
    const parentProgress = calculateGoalProgress({
      status: "in_progress",
      metric: null,
      deliverables: {
        childGoals: [{ progress: 100 }, { progress: 100 }],
      },
    });
    expect(parentProgress).toBe(100);
  });
});
