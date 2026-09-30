import { describe, it, expect } from "vitest";
import {
  createAutomationSchema,
  updateAutomationSchema,
  toggleAutomationSchema,
  conditionClauseSchema,
  conditionGroupSchema,
  listAutomationsQuerySchema,
  listRunsQuerySchema,
  testAutomationSchema,
} from "@/server/automations/types";

describe("Plan 07-05: Automations UI Validation & Logic", () => {
  describe("Create Automation Schema Validation", () => {
    it("accepts valid event-triggered automation", () => {
      const result = createAutomationSchema.safeParse({
        name: "Notify on task completion",
        description: "Send notification when a high-priority task is completed",
        triggerType: "event",
        triggerConfig: { eventName: "task.completed" },
        conditions: {
          combinator: "AND",
          clauses: [
            { field: "task.priority", operator: "equals", value: "high" },
          ],
        },
        actionType: "create_notification",
        actionConfig: {
          title: "Task Completed!",
          message: "{{task.title}} has been completed.",
          type: "success",
        },
      });
      expect(result.success).toBe(true);
    });

    it("rejects automation with empty name", () => {
      const result = createAutomationSchema.safeParse({
        name: "",
        triggerType: "event",
        triggerConfig: { eventName: "task.completed" },
        actionType: "create_notification",
        actionConfig: { title: "Test", message: "Test" },
      });
      expect(result.success).toBe(false);
    });

    it("rejects event trigger without eventName in triggerConfig", () => {
      const result = createAutomationSchema.safeParse({
        name: "Bad trigger",
        triggerType: "event",
        triggerConfig: {},
        actionType: "create_notification",
        actionConfig: { title: "Test", message: "Test" },
      });
      expect(result.success).toBe(false);
    });

    it("accepts schedule trigger with cron expression", () => {
      const result = createAutomationSchema.safeParse({
        name: "Daily reminder",
        triggerType: "schedule",
        triggerConfig: { cron: "0 8 * * *" },
        actionType: "create_notification",
        actionConfig: { title: "Good morning", message: "Start your day!" },
      });
      expect(result.success).toBe(true);
    });

    it("rejects schedule trigger without schedule config", () => {
      const result = createAutomationSchema.safeParse({
        name: "Bad schedule",
        triggerType: "schedule",
        triggerConfig: {},
        actionType: "create_notification",
        actionConfig: { title: "Test", message: "Test" },
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid action type", () => {
      const result = createAutomationSchema.safeParse({
        name: "Invalid action",
        triggerType: "event",
        triggerConfig: { eventName: "task.completed" },
        actionType: "send_email",
        actionConfig: {},
      });
      expect(result.success).toBe(false);
    });

    it("prevents client from setting server-managed fields", () => {
      const result = createAutomationSchema.safeParse({
        name: "Test",
        triggerType: "event",
        triggerConfig: { eventName: "task.completed" },
        actionType: "create_notification",
        actionConfig: { title: "Test", message: "Test" },
        userId: "hacker",
      });
      expect(result.success).toBe(false);
    });

    it("accepts automation with empty conditions (defaults to AND with empty clauses)", () => {
      const result = createAutomationSchema.safeParse({
        name: "No conditions",
        triggerType: "event",
        triggerConfig: { eventName: "task.created" },
        actionType: "create_task",
        actionConfig: { title: "Follow-up", priority: "medium" },
      });
      expect(result.success).toBe(true);
    });

    it("accepts threshold trigger without extra validation", () => {
      const result = createAutomationSchema.safeParse({
        name: "Budget alert",
        triggerType: "threshold",
        triggerConfig: { metric: "spending", threshold: 1000 },
        actionType: "create_notification",
        actionConfig: { title: "Budget Alert", message: "Spending exceeded!" },
      });
      expect(result.success).toBe(true);
    });
  });

  describe("Update Automation Schema Validation", () => {
    it("accepts partial update with only name", () => {
      const result = updateAutomationSchema.safeParse({ name: "New Name" });
      expect(result.success).toBe(true);
    });

    it("accepts partial update with isActive toggle", () => {
      const result = updateAutomationSchema.safeParse({ isActive: false });
      expect(result.success).toBe(true);
    });

    it("rejects update with server-managed fields", () => {
      const result = updateAutomationSchema.safeParse({ executionCount: 99 });
      expect(result.success).toBe(false);
    });
  });

  describe("Toggle Automation Schema", () => {
    it("accepts valid toggle", () => {
      const result = toggleAutomationSchema.safeParse({ isActive: true });
      expect(result.success).toBe(true);
    });

    it("rejects non-boolean", () => {
      const result = toggleAutomationSchema.safeParse({ isActive: "yes" });
      expect(result.success).toBe(false);
    });
  });

  describe("Condition Clause Schema", () => {
    it("accepts valid clause with all fields", () => {
      const result = conditionClauseSchema.safeParse({
        field: "task.priority",
        operator: "equals",
        value: "high",
      });
      expect(result.success).toBe(true);
    });

    it("accepts clause without value for is_empty operator", () => {
      const result = conditionClauseSchema.safeParse({
        field: "task.description",
        operator: "is_empty",
      });
      expect(result.success).toBe(true);
    });

    it("rejects clause with empty field", () => {
      const result = conditionClauseSchema.safeParse({
        field: "",
        operator: "equals",
        value: "test",
      });
      expect(result.success).toBe(false);
    });

    it("rejects clause with invalid operator", () => {
      const result = conditionClauseSchema.safeParse({
        field: "task.priority",
        operator: "matches",
        value: "high",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Condition Group Schema", () => {
    it("accepts AND group with multiple clauses", () => {
      const result = conditionGroupSchema.safeParse({
        combinator: "AND",
        clauses: [
          { field: "task.priority", operator: "equals", value: "high" },
          { field: "task.status", operator: "not_equals", value: "completed" },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("accepts OR group", () => {
      const result = conditionGroupSchema.safeParse({
        combinator: "OR",
        clauses: [
          { field: "task.priority", operator: "equals", value: "high" },
          { field: "task.priority", operator: "equals", value: "critical" },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("accepts empty clauses array (defaults to true evaluation)", () => {
      const result = conditionGroupSchema.safeParse({
        combinator: "AND",
        clauses: [],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("List Query Schemas", () => {
    it("parses list automations query with filters", () => {
      const result = listAutomationsQuerySchema.safeParse({
        triggerType: "event",
        isActive: "true",
        limit: "10",
        offset: "0",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isActive).toBe(true);
        expect(result.data.limit).toBe(10);
      }
    });

    it("parses list runs query", () => {
      const result = listRunsQuerySchema.safeParse({
        status: "success",
        limit: "20",
      });
      expect(result.success).toBe(true);
    });

    it("clamps limit to max 100", () => {
      const result = listAutomationsQuerySchema.safeParse({ limit: "999" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(100);
      }
    });
  });

  describe("Test Automation Schema", () => {
    it("accepts test with automationId and mock event", () => {
      const result = testAutomationSchema.safeParse({
        automationId: "auto-123",
        mockEvent: {
          name: "task.completed",
          payload: { task: { id: "t1", title: "Test", priority: "high" } },
        },
      });
      expect(result.success).toBe(true);
    });

    it("rejects test without automationId or rule", () => {
      const result = testAutomationSchema.safeParse({
        mockEvent: { name: "task.completed", payload: {} },
      });
      expect(result.success).toBe(false);
    });
  });
});
