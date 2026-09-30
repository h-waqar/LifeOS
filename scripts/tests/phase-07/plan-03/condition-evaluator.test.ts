import { describe, it, expect } from "vitest";
import {
  getNestedValue,
  evaluateClause,
  evaluateConditionGroup,
  interpolateTemplate,
  interpolateObject,
} from "@/server/automations/condition-evaluator";
import type { ConditionClause, ConditionGroup } from "@/server/automations/types";

describe("Plan 07-03: Condition Evaluator & Template Engine (Unit)", () => {
  describe("Dot-Notation Extraction (getNestedValue)", () => {
    it("extracts top-level and deeply nested properties", () => {
      const context = {
        task: {
          id: "task-1",
          title: "Ship Phase 7",
          priority: "high",
          metadata: {
            tags: ["backend", "urgent"],
            score: 95,
          },
        },
      };

      expect(getNestedValue(context, "task.id")).toBe("task-1");
      expect(getNestedValue(context, "task.title")).toBe("Ship Phase 7");
      expect(getNestedValue(context, "task.metadata.score")).toBe(95);
      expect(getNestedValue(context, "task.metadata.tags.0")).toBe("backend");
      expect(getNestedValue(context, "task.metadata.tags.1")).toBe("urgent");
    });

    it("falls back to payload if looking up entity from an event context wrapper", () => {
      const eventContext = {
        name: "task.completed",
        payload: {
          task: {
            id: "task-99",
            priority: "critical",
          },
        },
      };

      expect(getNestedValue(eventContext, "task.id")).toBe("task-99");
      expect(getNestedValue(eventContext, "task.priority")).toBe("critical");
      expect(getNestedValue(eventContext, "payload.task.id")).toBe("task-99");
    });

    it("returns undefined for missing or invalid paths without throwing", () => {
      const context = { task: null };
      expect(getNestedValue(context, "task.id")).toBeUndefined();
      expect(getNestedValue(null, "task.id")).toBeUndefined();
      expect(getNestedValue(undefined, "task.id")).toBeUndefined();
      expect(getNestedValue({}, "")).toBeUndefined();
      expect(getNestedValue({ a: 1 }, "b.c.d")).toBeUndefined();
    });
  });

  describe("Condition Operators (evaluateClause)", () => {
    it("evaluates equals and not_equals with type coercions", () => {
      const ctx = {
        priority: "high",
        streak: 14,
        isCompleted: true,
        countStr: "42",
      };

      expect(evaluateClause(ctx, { field: "priority", operator: "equals", value: "high" })).toBe(true);
      expect(evaluateClause(ctx, { field: "priority", operator: "equals", value: "HIGH" })).toBe(true);
      expect(evaluateClause(ctx, { field: "priority", operator: "not_equals", value: "low" })).toBe(true);

      // Numeric string to number coercion
      expect(evaluateClause(ctx, { field: "streak", operator: "equals", value: "14" })).toBe(true);
      expect(evaluateClause(ctx, { field: "countStr", operator: "equals", value: 42 })).toBe(true);

      // Boolean string coercion
      expect(evaluateClause(ctx, { field: "isCompleted", operator: "equals", value: "true" })).toBe(true);
      expect(evaluateClause(ctx, { field: "isCompleted", operator: "equals", value: "false" })).toBe(false);
    });

    it("evaluates numeric and date comparisons (greater_than, less_than)", () => {
      const ctx = {
        score: 85,
        targetDate: "2026-10-01T00:00:00.000Z",
        createdDate: new Date("2026-09-01T00:00:00.000Z"),
      };

      expect(evaluateClause(ctx, { field: "score", operator: "greater_than", value: 80 })).toBe(true);
      expect(evaluateClause(ctx, { field: "score", operator: "greater_than_or_equal", value: 85 })).toBe(true);
      expect(evaluateClause(ctx, { field: "score", operator: "less_than", value: 90 })).toBe(true);
      expect(evaluateClause(ctx, { field: "score", operator: "less_than_or_equal", value: 85 })).toBe(true);

      expect(evaluateClause(ctx, { field: "score", operator: "greater_than", value: 100 })).toBe(false);

      // Date comparison
      expect(
        evaluateClause(ctx, {
          field: "targetDate",
          operator: "greater_than",
          value: "2026-09-15T00:00:00.000Z",
        })
      ).toBe(true);

      expect(
        evaluateClause(ctx, {
          field: "createdDate",
          operator: "less_than",
          value: "2026-09-15T00:00:00.000Z",
        })
      ).toBe(true);
    });

    it("evaluates contains and not_contains for strings and arrays", () => {
      const ctx = {
        title: "Complete LifeOS Phase 7 implementation",
        tags: ["backend", "events", "automations"],
      };

      expect(evaluateClause(ctx, { field: "title", operator: "contains", value: "Phase 7" })).toBe(true);
      expect(evaluateClause(ctx, { field: "title", operator: "contains", value: "phase 7" })).toBe(true);
      expect(evaluateClause(ctx, { field: "title", operator: "not_contains", value: "Phase 8" })).toBe(true);

      expect(evaluateClause(ctx, { field: "tags", operator: "contains", value: "events" })).toBe(true);
      expect(evaluateClause(ctx, { field: "tags", operator: "contains", value: "frontend" })).toBe(false);
      expect(evaluateClause(ctx, { field: "tags", operator: "not_contains", value: "frontend" })).toBe(true);
    });

    it("evaluates in and not_in operators", () => {
      const ctx = {
        status: "in_progress",
        role: "admin",
      };

      expect(
        evaluateClause(ctx, {
          field: "status",
          operator: "in",
          value: ["todo", "in_progress", "blocked"],
        })
      ).toBe(true);

      expect(
        evaluateClause(ctx, {
          field: "status",
          operator: "in",
          value: ["completed", "cancelled"],
        })
      ).toBe(false);

      expect(
        evaluateClause(ctx, {
          field: "status",
          operator: "not_in",
          value: ["completed", "cancelled"],
        })
      ).toBe(true);
    });

    it("evaluates is_empty and is_not_empty across types", () => {
      const ctx = {
        emptyStr: "",
        nonEmptyStr: "hello",
        nullVal: null,
        emptyArr: [],
        nonEmptyArr: [1, 2],
        emptyObj: {},
        nonEmptyObj: { a: 1 },
      };

      expect(evaluateClause(ctx, { field: "emptyStr", operator: "is_empty" })).toBe(true);
      expect(evaluateClause(ctx, { field: "nullVal", operator: "is_empty" })).toBe(true);
      expect(evaluateClause(ctx, { field: "missingField", operator: "is_empty" })).toBe(true);
      expect(evaluateClause(ctx, { field: "emptyArr", operator: "is_empty" })).toBe(true);
      expect(evaluateClause(ctx, { field: "emptyObj", operator: "is_empty" })).toBe(true);

      expect(evaluateClause(ctx, { field: "nonEmptyStr", operator: "is_not_empty" })).toBe(true);
      expect(evaluateClause(ctx, { field: "nonEmptyArr", operator: "is_not_empty" })).toBe(true);
      expect(evaluateClause(ctx, { field: "nonEmptyObj", operator: "is_not_empty" })).toBe(true);

      expect(evaluateClause(ctx, { field: "nonEmptyStr", operator: "is_empty" })).toBe(false);
    });

    it("evaluates starts_with and ends_with", () => {
      const ctx = {
        filename: "07-03-PLAN.md",
      };

      expect(evaluateClause(ctx, { field: "filename", operator: "starts_with", value: "07-" })).toBe(true);
      expect(evaluateClause(ctx, { field: "filename", operator: "ends_with", value: ".md" })).toBe(true);
      expect(evaluateClause(ctx, { field: "filename", operator: "starts_with", value: "08-" })).toBe(false);
    });
  });

  describe("Condition Groups (evaluateConditionGroup)", () => {
    it("evaluates AND combinator correctly", () => {
      const ctx = {
        task: { priority: "high", status: "completed", estimatedHours: 4 },
      };

      const group: ConditionGroup = {
        combinator: "AND",
        clauses: [
          { field: "task.priority", operator: "equals", value: "high" },
          { field: "task.status", operator: "equals", value: "completed" },
          { field: "task.estimatedHours", operator: "less_than_or_equal", value: 5 },
        ],
      };

      expect(evaluateConditionGroup(ctx, group)).toBe(true);

      // Fails if any clause is false
      const failingGroup: ConditionGroup = {
        ...group,
        clauses: [
          ...group.clauses,
          { field: "task.estimatedHours", operator: "greater_than", value: 10 },
        ],
      };
      expect(evaluateConditionGroup(ctx, failingGroup)).toBe(false);
    });

    it("evaluates OR combinator correctly", () => {
      const ctx = {
        task: { priority: "low", status: "completed" },
      };

      const group: ConditionGroup = {
        combinator: "OR",
        clauses: [
          { field: "task.priority", operator: "equals", value: "critical" },
          { field: "task.status", operator: "equals", value: "completed" },
        ],
      };

      expect(evaluateConditionGroup(ctx, group)).toBe(true);

      const failingOrGroup: ConditionGroup = {
        combinator: "OR",
        clauses: [
          { field: "task.priority", operator: "equals", value: "critical" },
          { field: "task.status", operator: "equals", value: "blocked" },
        ],
      };
      expect(evaluateConditionGroup(ctx, failingOrGroup)).toBe(false);
    });

    it("evaluates nested condition groups", () => {
      const ctx = {
        project: { status: "active", completionPercentage: 100 },
        task: { priority: "critical" },
      };

      // (project.status === 'active' AND project.completionPercentage === 100) OR task.priority === 'low'
      const nestedGroup: ConditionGroup = {
        combinator: "OR",
        clauses: [
          {
            combinator: "AND",
            clauses: [
              { field: "project.status", operator: "equals", value: "active" },
              { field: "project.completionPercentage", operator: "equals", value: 100 },
            ],
          },
          { field: "task.priority", operator: "equals", value: "low" },
        ],
      };

      expect(evaluateConditionGroup(ctx, nestedGroup)).toBe(true);
    });

    it("evaluates bare array of clauses as AND combinator", () => {
      const ctx = { a: 1, b: 2 };
      const clauses: ConditionClause[] = [
        { field: "a", operator: "equals", value: 1 },
        { field: "b", operator: "equals", value: 2 },
      ];

      expect(evaluateConditionGroup(ctx, clauses)).toBe(true);

      const failingClauses: ConditionClause[] = [
        ...clauses,
        { field: "b", operator: "equals", value: 99 },
      ];
      expect(evaluateConditionGroup(ctx, failingClauses)).toBe(false);
    });

    it("evaluates empty groups or empty arrays as true", () => {
      expect(evaluateConditionGroup({}, [])).toBe(true);
      expect(evaluateConditionGroup({}, { combinator: "AND", clauses: [] })).toBe(true);
      expect(evaluateConditionGroup({}, { combinator: "OR", clauses: [] })).toBe(true);
    });
  });

  describe("Template String Interpolation (interpolateTemplate & interpolateObject)", () => {
    it("replaces {{field.path}} placeholders correctly", () => {
      const ctx = {
        task: {
          id: "task-123",
          title: "Refactor Notification Bus",
          priority: "critical",
        },
        user: { name: "Hamza" },
      };

      const template = "Task '{{task.title}}' [{{task.priority}}] completed for {{user.name}}!";
      const result = interpolateTemplate(template, ctx);

      expect(result).toBe("Task 'Refactor Notification Bus' [critical] completed for Hamza!");
    });

    it("resolves missing or null placeholders to empty string", () => {
      const ctx = { task: { title: "Test" } };
      const template = "Title: {{task.title}}, Desc: {{task.description}}, Note: {{missing.path}}";
      expect(interpolateTemplate(template, ctx)).toBe("Title: Test, Desc: , Note: ");
    });

    it("deeply interpolates objects and arrays", () => {
      const ctx = {
        task: { id: "t-1", title: "Clean DB", projectId: "p-42" },
      };

      const actionConfig = {
        title: "Followup for {{task.title}}",
        description: "Task {{task.id}} finished",
        projectId: "{{task.projectId}}",
        tags: ["task-{{task.id}}", "automated"],
        nested: {
          msg: "Done with {{task.title}}",
        },
      };

      const interpolated = interpolateObject(actionConfig, ctx);

      expect(interpolated).toEqual({
        title: "Followup for Clean DB",
        description: "Task t-1 finished",
        projectId: "p-42",
        tags: ["task-t-1", "automated"],
        nested: {
          msg: "Done with Clean DB",
        },
      });
    });
  });
});
