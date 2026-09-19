import { describe, it, expect } from "vitest";
import {
  calculateTaskPriorityScore,
  compareTasksByPriority,
  type TaskPriorityInput,
} from "@/server/tasks/priority";

describe("Plan 02-01: Priority Scoring Engine (Unit)", () => {
  const refDate = new Date("2026-09-14T12:00:00.000Z");

  describe("Base Score (Eisenhower Urgency/Importance)", () => {
    it("assigns 100 for critical priority", () => {
      expect(calculateTaskPriorityScore({ priority: "critical" }, refDate)).toBe(100);
    });

    it("assigns 70 for high priority", () => {
      expect(calculateTaskPriorityScore({ priority: "high" }, refDate)).toBe(70);
    });

    it("assigns 40 for medium priority (default)", () => {
      expect(calculateTaskPriorityScore({ priority: "medium" }, refDate)).toBe(40);
      expect(calculateTaskPriorityScore({}, refDate)).toBe(40);
    });

    it("assigns 10 for low priority", () => {
      expect(calculateTaskPriorityScore({ priority: "low" }, refDate)).toBe(10);
    });
  });

  describe("Deadline Weighting", () => {
    it("adds +40 when due today (within 24 hours)", () => {
      const due = new Date("2026-09-14T20:00:00.000Z");
      expect(
        calculateTaskPriorityScore({ priority: "medium", dueDate: due }, refDate)
      ).toBe(40 + 40);
    });

    it("adds +25 when due tomorrow (24h to 48h)", () => {
      const due = new Date("2026-09-15T20:00:00.000Z");
      expect(
        calculateTaskPriorityScore({ priority: "medium", dueDate: due }, refDate)
      ).toBe(40 + 25);
    });

    it("adds +15 when due this week (48h to 7 days)", () => {
      const due = new Date("2026-09-18T12:00:00.000Z");
      expect(
        calculateTaskPriorityScore({ priority: "medium", dueDate: due }, refDate)
      ).toBe(40 + 15);
    });

    it("adds +5 when due next week (7 to 14 days)", () => {
      const due = new Date("2026-09-24T12:00:00.000Z");
      expect(
        calculateTaskPriorityScore({ priority: "medium", dueDate: due }, refDate)
      ).toBe(40 + 5);
    });

    it("adds 0 for distant future (>14 days)", () => {
      const due = new Date("2026-10-14T12:00:00.000Z");
      expect(
        calculateTaskPriorityScore({ priority: "medium", dueDate: due }, refDate)
      ).toBe(40);
    });

    it("adds base +50 for overdue task plus scaled points, capped at +80", () => {
      // 1 day overdue
      const due1d = new Date("2026-09-13T12:00:00.000Z");
      expect(
        calculateTaskPriorityScore({ priority: "medium", dueDate: due1d }, refDate)
      ).toBe(40 + 50 + 5); // 95

      // 6 days overdue -> 50 + 30 = 80
      const due6d = new Date("2026-09-08T12:00:00.000Z");
      expect(
        calculateTaskPriorityScore({ priority: "medium", dueDate: due6d }, refDate)
      ).toBe(40 + 80); // 120

      // 30 days overdue -> capped at 80
      const due30d = new Date("2026-08-15T12:00:00.000Z");
      expect(
        calculateTaskPriorityScore({ priority: "medium", dueDate: due30d }, refDate)
      ).toBe(40 + 80); // 120
    });
  });

  describe("Scheduled Date Proximity", () => {
    it("adds +15 when scheduled for today or earlier", () => {
      const schedToday = new Date("2026-09-14T09:00:00.000Z");
      expect(
        calculateTaskPriorityScore(
          { priority: "medium", scheduledDate: schedToday },
          refDate
        )
      ).toBe(40 + 15);
    });

    it("adds 0 when scheduled for a future day", () => {
      const schedFuture = new Date("2026-09-15T09:00:00.000Z");
      expect(
        calculateTaskPriorityScore(
          { priority: "medium", scheduledDate: schedFuture },
          refDate
        )
      ).toBe(40);
    });
  });

  describe("Project & Goal Alignment", () => {
    it("adds +10 when part of an active project", () => {
      expect(
        calculateTaskPriorityScore({ priority: "medium", projectId: "proj-123" }, refDate)
      ).toBe(40 + 10);
    });

    it("adds +10 when part of a goal", () => {
      expect(
        calculateTaskPriorityScore({ priority: "medium", goalId: "goal-123" }, refDate)
      ).toBe(40 + 10);
    });

    it("adds +20 when part of both project and goal", () => {
      expect(
        calculateTaskPriorityScore(
          { priority: "medium", projectId: "proj-123", goalId: "goal-123" },
          refDate
        )
      ).toBe(40 + 10 + 10);
    });
  });

  describe("Effort Weighting (Quick-Win Momentum)", () => {
    it("adds +5 for quick wins (<= 15 minutes)", () => {
      expect(
        calculateTaskPriorityScore(
          { priority: "medium", estimatedDuration: 15 },
          refDate
        )
      ).toBe(40 + 5);
    });

    it("adds 0 for medium tasks (16 to 60 minutes)", () => {
      expect(
        calculateTaskPriorityScore(
          { priority: "medium", estimatedDuration: 45 },
          refDate
        )
      ).toBe(40);
    });

    it("subtracts 5 for deep work (> 60 minutes)", () => {
      expect(
        calculateTaskPriorityScore(
          { priority: "medium", estimatedDuration: 90 },
          refDate
        )
      ).toBe(40 - 5);
    });
  });

  describe("Blocked & Dependency Penalty", () => {
    it("subtracts 50 when status is blocked", () => {
      expect(
        calculateTaskPriorityScore({ priority: "high", status: "blocked" }, refDate)
      ).toBe(70 - 50); // 20
    });

    it("subtracts 50 when hasUncompletedDependencies is true", () => {
      expect(
        calculateTaskPriorityScore(
          { priority: "high", status: "todo", hasUncompletedDependencies: true },
          refDate
        )
      ).toBe(70 - 50); // 20
    });
  });

  describe("Terminal State Handling & Clamping", () => {
    it("returns 0 for completed tasks regardless of inputs", () => {
      expect(
        calculateTaskPriorityScore(
          {
            priority: "critical",
            status: "completed",
            dueDate: new Date("2026-09-10"),
            projectId: "proj-1",
          },
          refDate
        )
      ).toBe(0);
    });

    it("returns 0 for cancelled tasks", () => {
      expect(
        calculateTaskPriorityScore(
          { priority: "critical", status: "cancelled" },
          refDate
        )
      ).toBe(0);
    });

    it("clamps score to maximum 250", () => {
      // Critical (100) + overdue (80) + scheduled (15) + project (10) + goal (10) + quick win (5) = 220
      const task: TaskPriorityInput = {
        priority: "critical",
        dueDate: new Date("2026-09-01"),
        scheduledDate: new Date("2026-09-14"),
        projectId: "p1",
        goalId: "g1",
        estimatedDuration: 10,
      };
      const score = calculateTaskPriorityScore(task, refDate);
      expect(score).toBeLessThanOrEqual(250);
      expect(score).toBe(220);
    });

    it("clamps score to minimum 0 when penalty exceeds base", () => {
      const task: TaskPriorityInput = {
        priority: "low", // 10
        status: "blocked", // -50
        estimatedDuration: 120, // -5
      };
      expect(calculateTaskPriorityScore(task, refDate)).toBe(0);
    });
  });

  describe("Deterministic Ordering (compareTasksByPriority)", () => {
    it("orders by priorityScore DESC", () => {
      const taskA: TaskPriorityInput = { id: "a", priority: "critical" }; // 100
      const taskB: TaskPriorityInput = { id: "b", priority: "high" }; // 70

      expect(compareTasksByPriority(taskA, taskB, refDate)).toBeLessThan(0); // A comes before B
      expect(compareTasksByPriority(taskB, taskA, refDate)).toBeGreaterThan(0);
    });

    it("breaks score ties by earlier dueDate ASC", () => {
      const taskA: TaskPriorityInput = {
        id: "a",
        priority: "high",
        dueDate: new Date("2026-09-20"),
      };
      const taskB: TaskPriorityInput = {
        id: "b",
        priority: "high",
        dueDate: new Date("2026-09-22"),
      };

      expect(compareTasksByPriority(taskA, taskB, refDate)).toBeLessThan(0);
    });

    it("sorts null due dates last when scores are tied", () => {
      const taskWithDue: TaskPriorityInput = {
        id: "a",
        priority: "medium",
        dueDate: new Date("2026-09-20"),
      };
      const taskNoDue: TaskPriorityInput = {
        id: "b",
        priority: "medium",
        dueDate: null,
      };

      expect(compareTasksByPriority(taskWithDue, taskNoDue, refDate)).toBeLessThan(0);
      expect(compareTasksByPriority(taskNoDue, taskWithDue, refDate)).toBeGreaterThan(0);
    });

    it("breaks score and date ties by createdAt ASC (FIFO)", () => {
      const olderTask: TaskPriorityInput = {
        id: "task-old",
        priority: "medium",
        createdAt: new Date("2026-09-01"),
      };
      const newerTask: TaskPriorityInput = {
        id: "task-new",
        priority: "medium",
        createdAt: new Date("2026-09-10"),
      };

      expect(compareTasksByPriority(olderTask, newerTask, refDate)).toBeLessThan(0);
    });

    it("breaks absolute ties lexicographically by id ASC", () => {
      const taskA: TaskPriorityInput = { id: "task-01", priority: "medium" };
      const taskB: TaskPriorityInput = { id: "task-02", priority: "medium" };

      expect(compareTasksByPriority(taskA, taskB, refDate)).toBeLessThan(0);
      expect(compareTasksByPriority(taskB, taskA, refDate)).toBeGreaterThan(0);
    });
  });
});
