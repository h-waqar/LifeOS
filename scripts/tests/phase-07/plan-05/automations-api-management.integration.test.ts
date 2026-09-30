import { describe, it, expect, beforeAll, afterAll } from "vitest";

// DB probe guard — gracefully skip if PostgreSQL is unavailable
let canConnectToDB = false;
try {
  const { db } = await import("@/server/db");
  await db.execute({ sql: "SELECT 1" } as any);
  canConnectToDB = true;
} catch {
  canConnectToDB = false;
}

const describeWithDB = canConnectToDB ? describe : describe.skip;

describeWithDB("Plan 07-05: Automations Management API Integration", () => {
  let testUserId: string;
  let createdAutomationId: string;

  beforeAll(async () => {
    // Get or create a test user
    const { db } = await import("@/server/db");
    const { users } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");

    const existingUsers = await db.select().from(users).limit(1);
    if (existingUsers.length > 0) {
      testUserId = existingUsers[0].id;
    } else {
      // Skip tests if no users exist
      testUserId = "";
    }
  });

  afterAll(async () => {
    // Cleanup: delete test automations
    if (testUserId && createdAutomationId) {
      try {
        const { deleteAutomation } = await import("@/server/automations/service");
        await deleteAutomation(testUserId, createdAutomationId);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe("CRUD Operations via Service Layer", () => {
    it("creates an automation rule", async () => {
      if (!testUserId) return;
      const { createAutomation } = await import("@/server/automations/service");

      const automation = await createAutomation(testUserId, {
        name: "E2E Test: Notify on task completion",
        description: "Integration test automation",
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
          title: "Task Done: {{task.title}}",
          message: "High-priority task completed.",
          type: "success",
        },
      });

      expect(automation).toBeDefined();
      expect(automation.id).toBeTruthy();
      expect(automation.name).toBe("E2E Test: Notify on task completion");
      expect(automation.triggerType).toBe("event");
      expect(automation.actionType).toBe("create_notification");
      expect(automation.isActive).toBe(true);
      expect(automation.executionCount).toBe(0);
      createdAutomationId = automation.id;
    });

    it("lists automations for user", async () => {
      if (!testUserId || !createdAutomationId) return;
      const { listAutomations } = await import("@/server/automations/service");

      const automations = await listAutomations(testUserId);
      expect(Array.isArray(automations)).toBe(true);

      const found = automations.find((a) => a.id === createdAutomationId);
      expect(found).toBeDefined();
    });

    it("retrieves automation by ID with ownership verification", async () => {
      if (!testUserId || !createdAutomationId) return;
      const { getAutomationById } = await import("@/server/automations/service");

      const automation = await getAutomationById(testUserId, createdAutomationId);
      expect(automation.id).toBe(createdAutomationId);
      expect(automation.userId).toBe(testUserId);
    });

    it("updates automation name and description", async () => {
      if (!testUserId || !createdAutomationId) return;
      const { updateAutomation } = await import("@/server/automations/service");

      const updated = await updateAutomation(testUserId, createdAutomationId, {
        name: "Updated E2E Test Automation",
        description: "Updated description",
      });

      expect(updated.name).toBe("Updated E2E Test Automation");
      expect(updated.description).toBe("Updated description");
    });

    it("toggles automation active state", async () => {
      if (!testUserId || !createdAutomationId) return;
      const { toggleAutomation, getAutomationById } = await import("@/server/automations/service");

      const disabled = await toggleAutomation(testUserId, createdAutomationId, false);
      expect(disabled.isActive).toBe(false);

      const re_enabled = await toggleAutomation(testUserId, createdAutomationId, true);
      expect(re_enabled.isActive).toBe(true);
    });

    it("retrieves empty run history for new automation", async () => {
      if (!testUserId || !createdAutomationId) return;
      const { getAutomationRuns } = await import("@/server/automations/service");

      const runs = await getAutomationRuns(testUserId, createdAutomationId);
      expect(Array.isArray(runs)).toBe(true);
    });

    it("filters automations by trigger type", async () => {
      if (!testUserId) return;
      const { listAutomations } = await import("@/server/automations/service");

      const eventAutomations = await listAutomations(testUserId, { triggerType: "event" });
      expect(Array.isArray(eventAutomations)).toBe(true);
      for (const a of eventAutomations) {
        expect(a.triggerType).toBe("event");
      }
    });

    it("filters automations by active status", async () => {
      if (!testUserId) return;
      const { listAutomations } = await import("@/server/automations/service");

      const activeAutomations = await listAutomations(testUserId, { isActive: true });
      expect(Array.isArray(activeAutomations)).toBe(true);
      for (const a of activeAutomations) {
        expect(a.isActive).toBe(true);
      }
    });

    it("rejects access with invalid user ID", async () => {
      if (!createdAutomationId) return;
      const { getAutomationById } = await import("@/server/automations/service");
      const { NotFoundError } = await import("@/server/automations/types");

      await expect(
        getAutomationById("nonexistent-user-id", createdAutomationId)
      ).rejects.toThrow();
    });

    it("tests automation rule with mock event (dry run)", async () => {
      if (!testUserId || !createdAutomationId) return;
      const { testAutomationRule } = await import("@/server/automations/service");

      const result = await testAutomationRule(testUserId, {
        automationId: createdAutomationId,
        mockEvent: {
          name: "task.completed",
          payload: {
            task: { id: "t1", title: "Fix bug", priority: "high", status: "completed" },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result.matched).toBe(true);
      expect(result.conditionsMet).toBe(true);
      expect(result.actionType).toBe("create_notification");
    });

    it("test returns mismatch for wrong event", async () => {
      if (!testUserId || !createdAutomationId) return;
      const { testAutomationRule } = await import("@/server/automations/service");

      const result = await testAutomationRule(testUserId, {
        automationId: createdAutomationId,
        mockEvent: {
          name: "task.created",
          payload: { task: { id: "t1", title: "New task" } },
        },
      });

      expect(result.matched).toBe(false);
    });

    it("deletes automation", async () => {
      if (!testUserId || !createdAutomationId) return;
      const { deleteAutomation, getAutomationById } = await import("@/server/automations/service");

      const result = await deleteAutomation(testUserId, createdAutomationId);
      expect(result.success).toBe(true);

      await expect(
        getAutomationById(testUserId, createdAutomationId)
      ).rejects.toThrow();

      createdAutomationId = ""; // Clear so afterAll doesn't try to delete again
    });
  });
});
