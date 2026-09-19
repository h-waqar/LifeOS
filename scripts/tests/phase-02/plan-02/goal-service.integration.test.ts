import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { auditLog } from "@/server/db/schema/audit";
import { auth } from "@/server/auth";
import {
  createGoal,
  getGoal,
  listGoals,
  updateGoal,
  deleteGoal,
  NotFoundError,
  InvariantViolationError,
} from "@/server/goals/service";
import { AuthorizationError } from "@/server/auth/guard";
import { eq, and } from "drizzle-orm";

describe("Plan 02-02: Goals Service (CRUD, User Isolation, Filtering, Audit Logs)", () => {
  let probe: ProbeResult;

  const testUserData = {
    email: "p02_goal_service@example.com",
    password: "GoalServicePassword123!",
    name: "Goal Service Tester",
  };

  let testUserId: string;

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    await db.delete(user);

    const res = await auth.api.signUpEmail({
      body: testUserData,
      asResponse: true,
    });
    expect(res.status).toBe(200);

    const [createdUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testUserData.email));
    testUserId = createdUser.id;
  });

  afterAll(async () => {
    if (!probe.isAvailable) return;
    await db.delete(user);
    await closeDatabase();
  });

  describe("Goal Creation & Audit Logging", () => {
    it("creates a multi-horizon goal with metric and generates an audit log", async () => {
      if (!probe.isAvailable) return;

      const created = await createGoal(testUserId, {
        title: "Become Principal Engineer",
        description: "Advance career to principal technical leadership level",
        horizon: "long_term",
        area: "career",
        priority: "high",
        metricType: "numeric",
        targetValue: 10,
        currentValue: 3,
        unit: "tech leads mentored",
      });

      expect(created.id).toBeDefined();
      expect(created.userId).toBe(testUserId);
      expect(created.title).toBe("Become Principal Engineer");
      expect(created.horizon).toBe("long_term");
      expect(created.area).toBe("career");
      expect(created.metricType).toBe("numeric");
      expect(created.targetValue).toBe(10);
      expect(created.currentValue).toBe(3);
      // Metric progress: 3 / 10 = 30%
      expect(created.progress).toBe(30);

      // Verify audit log entry
      const logs = await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.userId, testUserId),
            eq(auditLog.action, "goal.create")
          )
        );

      expect(logs.length).toBeGreaterThan(0);
      const latestLog = logs[logs.length - 1];
      expect((latestLog.details as any).goalId).toBe(created.id);
      expect((latestLog.details as any).title).toBe(created.title);
    });

    it("throws AuthorizationError when userId is empty", async () => {
      if (!probe.isAvailable) return;

      await expect(
        createGoal("", {
          title: "Unauthorized Goal",
        })
      ).rejects.toThrow(AuthorizationError);
    });

    it("fails when referencing a non-existent parent goal", async () => {
      if (!probe.isAvailable) return;

      await expect(
        createGoal(testUserId, {
          title: "Invalid Parent Goal",
          parentGoalId: "non-existent-parent-id",
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("Goal Retrieval & Relation Counts", () => {
    it("retrieves a goal with correct progress and counts", async () => {
      if (!probe.isAvailable) return;

      const parent = await createGoal(testUserId, {
        title: "Master Financial Health",
        horizon: "long_term",
        area: "finance",
      });

      const child = await createGoal(testUserId, {
        title: "Build 6-Month Emergency Fund",
        horizon: "medium_term",
        area: "finance",
        parentGoalId: parent.id,
        metricType: "currency",
        targetValue: 30000,
        currentValue: 15000,
        unit: "USD",
      });

      const fetchedParent = await getGoal(testUserId, parent.id);
      expect(fetchedParent).not.toBeNull();
      expect(fetchedParent?.id).toBe(parent.id);
      expect(fetchedParent?.childGoalsCount).toBe(1);
      // Parent progress rollup from child (15000/30000 = 50%)
      expect(fetchedParent?.progress).toBe(50);

      const fetchedChild = await getGoal(testUserId, child.id);
      expect(fetchedChild?.progress).toBe(50);
      expect(fetchedChild?.parentGoalId).toBe(parent.id);
    });

    it("returns null for non-existent goal", async () => {
      if (!probe.isAvailable) return;

      const result = await getGoal(testUserId, "non_existent_goal_id");
      expect(result).toBeNull();
    });

    it("guarantees user isolation: cannot read other user's goal", async () => {
      if (!probe.isAvailable) return;

      const goal = await createGoal(testUserId, {
        title: "Secret Personal Goal",
        area: "personal_development",
      });

      const foreignUserId = "foreign_user_" + crypto.randomUUID().slice(0, 8);
      const result = await getGoal(foreignUserId, goal.id);
      expect(result).toBeNull();
    });
  });

  describe("Goal Listing & Filtering", () => {
    it("filters goals by horizon, area, and status", async () => {
      if (!probe.isAvailable) return;

      const gHealth = await createGoal(testUserId, {
        title: "Run a Marathon",
        horizon: "medium_term",
        area: "health",
        status: "in_progress",
      });

      const gCareer = await createGoal(testUserId, {
        title: "Publish 5 Technical Papers",
        horizon: "long_term",
        area: "career",
        status: "in_progress",
      });

      const gRelationships = await createGoal(testUserId, {
        title: "Host Weekly Family Dinners",
        horizon: "short_term",
        area: "relationships",
        status: "completed",
      });

      // Filter by horizon
      const mediumTerm = await listGoals(testUserId, { horizon: "medium_term" });
      expect(mediumTerm.some((g) => g.id === gHealth.id)).toBe(true);
      expect(mediumTerm.some((g) => g.id === gCareer.id)).toBe(false);

      // Filter by area
      const careerGoals = await listGoals(testUserId, { area: "career" });
      expect(careerGoals.some((g) => g.id === gCareer.id)).toBe(true);
      expect(careerGoals.some((g) => g.id === gHealth.id)).toBe(false);

      // Filter by status
      const completedGoals = await listGoals(testUserId, { status: "completed" });
      expect(completedGoals.some((g) => g.id === gRelationships.id)).toBe(true);
      expect(completedGoals.some((g) => g.id === gHealth.id)).toBe(false);
    });

    it("returns empty list for a user with no goals", async () => {
      if (!probe.isAvailable) return;

      const foreignUserId = "user_no_goals_" + crypto.randomUUID().slice(0, 8);
      const list = await listGoals(foreignUserId);
      expect(list).toEqual([]);
    });
  });

  describe("Goal Update & Cascade Recalculation", () => {
    it("updates goal fields and recalculates progress upward", async () => {
      if (!probe.isAvailable) return;

      const parent = await createGoal(testUserId, {
        title: "Parent Horizon Goal",
        horizon: "long_term",
      });

      const child = await createGoal(testUserId, {
        title: "Child Horizon Goal",
        parentGoalId: parent.id,
        metricType: "numeric",
        targetValue: 100,
        currentValue: 10,
      });

      expect(child.progress).toBe(10);
      let parentUpdated = await getGoal(testUserId, parent.id);
      expect(parentUpdated?.progress).toBe(10);

      // Update child metric to 80
      const updatedChild = await updateGoal(testUserId, child.id, {
        currentValue: 80,
      });
      expect(updatedChild.progress).toBe(80);

      // Verify parent goal automatically recalculated to 80
      parentUpdated = await getGoal(testUserId, parent.id);
      expect(parentUpdated?.progress).toBe(80);

      // Verify audit log for update
      const updateLogs = await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.userId, testUserId),
            eq(auditLog.action, "goal.update")
          )
        );
      expect(updateLogs.length).toBeGreaterThan(0);
    });

    it("rejects updating parentGoalId that would create a hierarchy cycle", async () => {
      if (!probe.isAvailable) return;

      const top = await createGoal(testUserId, { title: "Top Level Goal" });
      const mid = await createGoal(testUserId, {
        title: "Mid Level Goal",
        parentGoalId: top.id,
      });

      // Attempt to set top's parent to mid (cycle)
      await expect(
        updateGoal(testUserId, top.id, {
          parentGoalId: mid.id,
        })
      ).rejects.toThrow(InvariantViolationError);
    });

    it("updates status to completed and sets completedAt", async () => {
      if (!probe.isAvailable) return;

      const goal = await createGoal(testUserId, {
        title: "Goal to Complete",
        status: "in_progress",
      });
      expect(goal.completedAt).toBeNull();

      const updated = await updateGoal(testUserId, goal.id, {
        status: "completed",
      });
      expect(updated.status).toBe("completed");
      expect(updated.completedAt).not.toBeNull();
    });
  });

  describe("Goal Deletion", () => {
    it("deletes goal, logs audit, and recalculates parent progress", async () => {
      if (!probe.isAvailable) return;

      const parent = await createGoal(testUserId, {
        title: "Parent with 2 children",
      });

      const child1 = await createGoal(testUserId, {
        title: "Child 1",
        parentGoalId: parent.id,
        metricType: "numeric",
        targetValue: 100,
        currentValue: 100,
      });

      const child2 = await createGoal(testUserId, {
        title: "Child 2",
        parentGoalId: parent.id,
        metricType: "numeric",
        targetValue: 100,
        currentValue: 0,
      });

      // Parent progress is avg(100, 0) = 50%
      let parentGoal = await getGoal(testUserId, parent.id);
      expect(parentGoal?.progress).toBe(50);

      // Delete child2
      const delResult = await deleteGoal(testUserId, child2.id);
      expect(delResult.success).toBe(true);

      // Child 2 should no longer exist
      const fetchedChild2 = await getGoal(testUserId, child2.id);
      expect(fetchedChild2).toBeNull();

      // Parent now only has child1 (100%), so parent progress becomes 100%
      parentGoal = await getGoal(testUserId, parent.id);
      expect(parentGoal?.progress).toBe(100);

      // Verify delete audit log
      const deleteLogs = await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.userId, testUserId),
            eq(auditLog.action, "goal.delete")
          )
        );
      expect(deleteLogs.length).toBeGreaterThan(0);
    });

    it("throws NotFoundError when deleting a non-existent goal", async () => {
      if (!probe.isAvailable) return;

      await expect(
        deleteGoal(testUserId, "non_existent_goal_id")
      ).rejects.toThrow(NotFoundError);
    });
  });
});
