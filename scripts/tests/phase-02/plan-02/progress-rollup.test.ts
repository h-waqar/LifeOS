import { describe, it, expect } from "vitest";
import {
  calculateProjectProgress,
  calculateMetricProgress,
  calculateDeliverablesProgress,
  calculateGoalProgress,
  cascadeGoalProgress,
  type GoalProgressNode,
} from "@/server/goals/rollup";

describe("Phase 2 Plan 02-02: Progress Rollup Engine", () => {
  describe("1. Projects Progress Rollup (calculateProjectProgress)", () => {
    it("handles empty project (no tasks, no milestones) returning 0 for non-completed", () => {
      const progress = calculateProjectProgress({
        tasks: [],
        milestones: [],
        status: "active",
      });
      expect(progress).toBe(0);
    });

    it("handles empty project returning 100 when status is completed", () => {
      const progress = calculateProjectProgress({
        tasks: [],
        milestones: [],
        status: "completed",
      });
      expect(progress).toBe(100);
    });

    it("calculates progress for project with tasks only", () => {
      const progress = calculateProjectProgress({
        tasks: [
          { status: "completed" },
          { status: "todo" },
          { status: "in_progress" },
          { status: "completed" },
        ],
        milestones: [],
      });
      // 2 / 4 = 50%
      expect(progress).toBe(50);
    });

    it("calculates progress for project with milestones only", () => {
      const progress = calculateProjectProgress({
        tasks: [],
        milestones: [
          { status: "completed" },
          { status: "completed" },
          { status: "pending" },
        ],
      });
      // 2 / 3 = 66.666...% -> round(67)
      expect(progress).toBe(67);
    });

    it("calculates progress for project with both tasks and milestones (50/50 weighting)", () => {
      const progress = calculateProjectProgress({
        tasks: [
          { status: "completed" },
          { status: "todo" },
        ], // 50%
        milestones: [
          { status: "completed" },
          { status: "completed" },
          { status: "completed" },
          { status: "pending" },
        ], // 75%
      });
      // 0.5 * 50 + 0.5 * 75 = 25 + 37.5 = 62.5 -> round(63)
      expect(progress).toBe(63);
    });

    it("clamps project progress to 0-100 bounds", () => {
      const allDone = calculateProjectProgress({
        tasks: [{ status: "completed" }],
        milestones: [{ status: "completed" }],
      });
      expect(allDone).toBe(100);

      const noneDone = calculateProjectProgress({
        tasks: [{ status: "todo" }],
        milestones: [{ status: "pending" }],
      });
      expect(noneDone).toBe(0);
    });
  });

  describe("2. Metric Progress Calculation (calculateMetricProgress)", () => {
    it("returns null when metricType is 'none'", () => {
      expect(
        calculateMetricProgress({
          metricType: "none",
        })
      ).toBeNull();
    });

    it("calculates boolean metric correctly (target reached vs not reached)", () => {
      expect(
        calculateMetricProgress({
          metricType: "boolean",
          targetValue: 1,
          currentValue: 1,
        })
      ).toBe(100);

      expect(
        calculateMetricProgress({
          metricType: "boolean",
          targetValue: 1,
          currentValue: 0,
        })
      ).toBe(0);
    });

    it("calculates numeric metric with proper rounding and bounds", () => {
      // 7 out of 10 = 70%
      expect(
        calculateMetricProgress({
          metricType: "numeric",
          targetValue: 10,
          currentValue: 7,
        })
      ).toBe(70);

      // 1 out of 3 = 33%
      expect(
        calculateMetricProgress({
          metricType: "numeric",
          targetValue: 3,
          currentValue: 1,
        })
      ).toBe(33);

      // Over target: 15 out of 10 clamped to 100%
      expect(
        calculateMetricProgress({
          metricType: "numeric",
          targetValue: 10,
          currentValue: 15,
        })
      ).toBe(100);

      // Negative value clamped to 0%
      expect(
        calculateMetricProgress({
          metricType: "numeric",
          targetValue: 10,
          currentValue: -2,
        })
      ).toBe(0);
    });

    it("calculates currency metric correctly", () => {
      expect(
        calculateMetricProgress({
          metricType: "currency",
          targetValue: 50000,
          currentValue: 25000,
        })
      ).toBe(50);
    });

    it("calculates percentage metric correctly", () => {
      expect(
        calculateMetricProgress({
          metricType: "percentage",
          targetValue: 100,
          currentValue: 45,
        })
      ).toBe(45);
    });

    it("handles zero or invalid target values safely without division by zero", () => {
      expect(
        calculateMetricProgress({
          metricType: "numeric",
          targetValue: 0,
          currentValue: 10,
        })
      ).toBe(0);

      expect(
        calculateMetricProgress({
          metricType: "numeric",
          targetValue: -10,
          currentValue: 5,
        })
      ).toBe(0);
    });
  });

  describe("3. Deliverables Progress Rollup (calculateDeliverablesProgress)", () => {
    it("returns null when no deliverables exist", () => {
      expect(calculateDeliverablesProgress({})).toBeNull();
      expect(
        calculateDeliverablesProgress({
          projects: [],
          directTasks: [],
          childGoals: [],
        })
      ).toBeNull();
    });

    it("calculates deliverables with projects only", () => {
      const progress = calculateDeliverablesProgress({
        projects: [
          { id: "p1", progress: 40, status: "active" },
          { id: "p2", progress: 80, status: "active" },
        ],
      });
      // (40 + 80) / 2 = 60
      expect(progress).toBe(60);
    });

    it("calculates deliverables with direct tasks only", () => {
      const progress = calculateDeliverablesProgress({
        directTasks: [
          { status: "completed" },
          { status: "todo" },
          { status: "in_progress" },
        ],
      });
      // 1 / 3 = 33.333% -> round(33)
      expect(progress).toBe(33);
    });

    it("calculates deliverables with child goals only", () => {
      const progress = calculateDeliverablesProgress({
        childGoals: [
          { progress: 25 },
          { progress: 75 },
        ],
      });
      // (25 + 75) / 2 = 50
      expect(progress).toBe(50);
    });

    it("combines multiple deliverable categories with equal weight", () => {
      const progress = calculateDeliverablesProgress({
        projects: [{ id: "p1", progress: 100, status: "completed" }], // 100%
        directTasks: [
          { status: "completed" },
          { status: "todo" },
        ], // 50%
        childGoals: [{ progress: 60 }], // 60%
      });
      // (100 + 50 + 60) / 3 = 210 / 3 = 70%
      expect(progress).toBe(70);
    });

    describe("Archived project contribution to goal progress", () => {
      it("includes completed archived projects in goal deliverables (contributes 100%)", () => {
        const progress = calculateDeliverablesProgress({
          projects: [
            { id: "p1", progress: 100, status: "completed" },
            { id: "p2", progress: 100, status: "archived" }, // completed archived project
            { id: "p3", progress: 50, status: "active" },
          ],
        });
        // 3 projects: (100 + 100 + 50) / 3 = 250 / 3 = 83.33 -> 83
        expect(progress).toBe(83);
      });

      it("excludes uncompleted archived/abandoned projects by default so they do not depress goal progress", () => {
        const progress = calculateDeliverablesProgress({
          projects: [
            { id: "p1", progress: 100, status: "completed" },
            { id: "p2", progress: 20, status: "archived" }, // abandoned/paused archived project
          ],
        });
        // p2 is archived with <100% progress, excluded by default: 100 / 1 = 100%
        expect(progress).toBe(100);
      });

      it("includes uncompleted archived projects when explicitly requested with includeArchivedProjects: true", () => {
        const progress = calculateDeliverablesProgress({
          projects: [
            { id: "p1", progress: 100, status: "completed" },
            { id: "p2", progress: 20, status: "archived" },
          ],
          includeArchivedProjects: true,
        });
        // Both included: (100 + 20) / 2 = 60
        expect(progress).toBe(60);
      });
    });
  });

  describe("4. Goal Total Progress (calculateGoalProgress)", () => {
    it("handles empty goal (no metric, no deliverables) returning 0 for in_progress", () => {
      const progress = calculateGoalProgress({
        status: "in_progress",
        metric: null,
        deliverables: null,
      });
      expect(progress).toBe(0);
    });

    it("handles empty goal returning 100 when marked completed", () => {
      const progress = calculateGoalProgress({
        status: "completed",
        metric: null,
        deliverables: null,
      });
      expect(progress).toBe(100);
    });

    it("calculates metric-only goals", () => {
      const progress = calculateGoalProgress({
        status: "in_progress",
        metric: {
          metricType: "numeric",
          targetValue: 100,
          currentValue: 65,
        },
        deliverables: null,
      });
      expect(progress).toBe(65);
    });

    it("calculates deliverable-only goals", () => {
      const progress = calculateGoalProgress({
        status: "in_progress",
        metric: null,
        deliverables: {
          projects: [{ id: "p1", progress: 80, status: "active" }],
        },
      });
      expect(progress).toBe(80);
    });

    it("calculates goals with both metrics and deliverables (50/50 combined)", () => {
      const progress = calculateGoalProgress({
        status: "in_progress",
        metric: {
          metricType: "numeric",
          targetValue: 100,
          currentValue: 80, // 80%
        },
        deliverables: {
          projects: [{ id: "p1", progress: 40, status: "active" }], // 40%
        },
      });
      // 0.5 * 80 + 0.5 * 40 = 40 + 20 = 60%
      expect(progress).toBe(60);
    });

    it("strictly clamps total goal progress between 0 and 100", () => {
      const progress = calculateGoalProgress({
        status: "in_progress",
        metric: {
          metricType: "numeric",
          targetValue: 10,
          currentValue: 200, // over 100%
        },
        deliverables: {
          projects: [{ id: "p1", progress: 100, status: "active" }],
        },
      });
      expect(progress).toBe(100);
    });
  });

  describe("5. Parent-Child Goal Cascade Behavior (cascadeGoalProgress)", () => {
    it("cascades progress upward through parent and grandparent goals", () => {
      // Tree: Grandparent (G1) -> Parent (G2) -> Child (G3)
      const nodes = new Map<string, GoalProgressNode>([
        [
          "G1",
          {
            id: "G1",
            parentId: null,
            progress: 0,
            status: "in_progress",
            childIds: ["G2"],
            projects: [],
            directTasks: [],
            metric: null,
          },
        ],
        [
          "G2",
          {
            id: "G2",
            parentId: "G1",
            progress: 0,
            status: "in_progress",
            childIds: ["G3"],
            projects: [],
            directTasks: [],
            metric: null,
          },
        ],
        [
          "G3",
          {
            id: "G3",
            parentId: "G2",
            progress: 80,
            status: "in_progress",
            childIds: [],
            projects: [],
            directTasks: [],
            metric: {
              metricType: "numeric",
              targetValue: 10,
              currentValue: 8,
            },
          },
        ],
      ]);

      const updates = cascadeGoalProgress(nodes, "G3");

      // G3 is 80%
      // G2's child G3 has 80% -> G2 becomes 80%
      // G1's child G2 has 80% -> G1 becomes 80%
      expect(updates).toEqual([
        { goalId: "G3", oldProgress: 80, newProgress: 80 },
        { goalId: "G2", oldProgress: 0, newProgress: 80 },
        { goalId: "G1", oldProgress: 0, newProgress: 80 },
      ]);
    });

    it("handles multiple sibling child goals under one parent", () => {
      const nodes = new Map<string, GoalProgressNode>([
        [
          "Parent",
          {
            id: "Parent",
            parentId: null,
            progress: 0,
            status: "in_progress",
            childIds: ["Child1", "Child2"],
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
            progress: 40,
            status: "in_progress",
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
            progress: 60,
            status: "in_progress",
            childIds: [],
            projects: [],
            directTasks: [],
            metric: null,
          },
        ],
      ]);

      const updates = cascadeGoalProgress(nodes, "Child1");
      // Average of Child1 (40%) and Child2 (60%) = 50%
      const parentUpdate = updates.find((u) => u.goalId === "Parent");
      expect(parentUpdate?.newProgress).toBe(50);
    });

    it("stops cascade if a cycle is detected defensively", () => {
      // Defensive test in case tree data is cyclic
      const nodes = new Map<string, GoalProgressNode>([
        [
          "A",
          {
            id: "A",
            parentId: "B",
            progress: 50,
            status: "in_progress",
            childIds: ["B"],
            projects: [],
            directTasks: [],
            metric: null,
          },
        ],
        [
          "B",
          {
            id: "B",
            parentId: "A",
            progress: 50,
            status: "in_progress",
            childIds: ["A"],
            projects: [],
            directTasks: [],
            metric: null,
          },
        ],
      ]);

      expect(() => cascadeGoalProgress(nodes, "A")).not.toThrow();
    });
  });
});
