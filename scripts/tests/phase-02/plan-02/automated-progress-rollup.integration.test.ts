import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { auth } from "@/server/auth";
import {
  createGoal,
  getGoal,
  updateGoal,
  recalculateGoalProgress,
} from "@/server/goals/service";
import {
  createProject,
  getProject,
  addMilestone,
  updateMilestone,
} from "@/server/projects/service";
import {
  createTask,
  updateTask,
} from "@/server/tasks/service";
import { eq } from "drizzle-orm";

describe("Plan 02-02: Automated Progress Rollups (End-to-End Integration)", () => {
  let probe: ProbeResult;

  const testUserData = {
    email: "p02_rollup_user@example.com",
    password: "RollupPassword123!",
    name: "Rollup Tester",
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

  describe("Project 50/50 Rollup (Tasks and Milestones)", () => {
    it("progressively recalculates project progress across task and milestone lifecycle", async () => {
      if (!probe.isAvailable) return;

      const proj = await createProject(testUserId, {
        name: "Q4 Infrastructure Upgrade",
        area: "career",
      });

      // Initially empty project -> 0%
      let p = await getProject(testUserId, proj.id);
      expect(p?.progress).toBe(0);

      // Add 2 milestones
      const m1 = await addMilestone(testUserId, proj.id, {
        title: "Architecture Design Review",
      });
      const m2 = await addMilestone(testUserId, proj.id, {
        title: "Production Migration",
      });

      // Add 2 tasks
      const t1 = await createTask(testUserId, {
        title: "Setup CI/CD pipeline",
        projectId: proj.id,
      });
      const t2 = await createTask(testUserId, {
        title: "Configure load balancer",
        projectId: proj.id,
      });

      // 0 completed -> 0%
      p = await getProject(testUserId, proj.id);
      expect(p?.progress).toBe(0);
      expect(p?.tasksCount).toBe(2);
      expect(p?.milestonesCount).toBe(2);

      // Complete 1 task (1/2 tasks = 50% task contribution, 0/2 milestones = 0%)
      // 0.5 * 50 + 0.5 * 0 = 25%
      await updateTask(testUserId, t1.id, { status: "completed" });
      p = await getProject(testUserId, proj.id);
      expect(p?.progress).toBe(25);

      // Complete 1 milestone (1/2 tasks = 50%, 1/2 milestones = 50%)
      // 0.5 * 50 + 0.5 * 50 = 50%
      await updateMilestone(testUserId, proj.id, m1.id, { status: "completed" });
      p = await getProject(testUserId, proj.id);
      expect(p?.progress).toBe(50);

      // Complete 2nd task (2/2 tasks = 100%, 1/2 milestones = 50%)
      // 0.5 * 100 + 0.5 * 50 = 75%
      await updateTask(testUserId, t2.id, { status: "completed" });
      p = await getProject(testUserId, proj.id);
      expect(p?.progress).toBe(75);

      // Complete 2nd milestone (2/2 tasks = 100%, 2/2 milestones = 100%)
      // 0.5 * 100 + 0.5 * 100 = 100%
      await updateMilestone(testUserId, proj.id, m2.id, { status: "completed" });
      p = await getProject(testUserId, proj.id);
      expect(p?.progress).toBe(100);
    });
  });

  describe("Goal Rollup via Linked Project Mutation", () => {
    it("automatically cascades project progress to parent goal", async () => {
      if (!probe.isAvailable) return;

      const goal = await createGoal(testUserId, {
        title: "Deliver Scalable Architecture",
        horizon: "medium_term",
        area: "career",
      });

      const proj = await createProject(testUserId, {
        name: "Microservices Split",
        goalId: goal.id,
      });

      const t1 = await createTask(testUserId, {
        title: "Decompose auth service",
        projectId: proj.id,
      });
      const t2 = await createTask(testUserId, {
        title: "Decompose payment service",
        projectId: proj.id,
      });

      // Initially goal progress should be 0
      let g = await getGoal(testUserId, goal.id);
      expect(g?.progress).toBe(0);

      // Complete 1 of 2 tasks on the linked project
      await updateTask(testUserId, t1.id, { status: "completed" });

      // Goal progress should now reflect project's 50%
      g = await getGoal(testUserId, goal.id);
      expect(g?.progress).toBe(50);

      // Complete 2nd task
      await updateTask(testUserId, t2.id, { status: "completed" });

      g = await getGoal(testUserId, goal.id);
      expect(g?.progress).toBe(100);
    });
  });

  describe("Goal 50/50 Rollup (Metric + Deliverables)", () => {
    it("combines 50% metric and 50% deliverable progress correctly", async () => {
      if (!probe.isAvailable) return;

      // Goal with numeric metric: target 100, current 50 (50% metric progress)
      const goal = await createGoal(testUserId, {
        title: "Grow Investment Portfolio",
        horizon: "long_term",
        area: "finance",
        metricType: "currency",
        targetValue: 100000,
        currentValue: 50000,
        unit: "USD",
      });

      // Deliverable: 1 linked project with 1 completed task (100% deliverable progress)
      const proj = await createProject(testUserId, {
        name: "Max Out Retirement Contribution",
        goalId: goal.id,
      });

      const task = await createTask(testUserId, {
        title: "Transfer yearly Roth IRA max",
        projectId: proj.id,
      });

      // Complete the project task -> project is 100%
      await updateTask(testUserId, task.id, { status: "completed" });

      // Goal progress: 0.5 * 50% (metric) + 0.5 * 100% (project) = 75%
      const g = await getGoal(testUserId, goal.id);
      expect(g?.progress).toBe(75);

      // Now update metric to 100,000 (100% metric)
      await updateGoal(testUserId, goal.id, { currentValue: 100000 });

      // Goal progress: 0.5 * 100% + 0.5 * 100% = 100%
      const gFull = await getGoal(testUserId, goal.id);
      expect(gFull?.progress).toBe(100);
    });
  });

  describe("Multi-Tier Goal Hierarchy Cascade", () => {
    it("cascades progress upward from grandchild -> child -> parent goal", async () => {
      if (!probe.isAvailable) return;

      // Long-term parent goal
      const parent = await createGoal(testUserId, {
        title: "Reach Peak Physical Fitness",
        horizon: "long_term",
        area: "health",
      });

      // Medium-term child goal
      const child = await createGoal(testUserId, {
        title: "Run Half Marathon Under 2 Hours",
        horizon: "medium_term",
        area: "health",
        parentGoalId: parent.id,
      });

      // Short-term grandchild goal with metric
      const grandchild = await createGoal(testUserId, {
        title: "Build 20km Weekly Base",
        horizon: "short_term",
        area: "health",
        parentGoalId: child.id,
        metricType: "numeric",
        targetValue: 20,
        currentValue: 10, // 50%
        unit: "km",
      });

      expect(grandchild.progress).toBe(50);

      // Child goal should have rolled up from grandchild
      let fetchedChild = await getGoal(testUserId, child.id);
      expect(fetchedChild?.progress).toBe(50);

      // Parent goal should have rolled up from child
      let fetchedParent = await getGoal(testUserId, parent.id);
      expect(fetchedParent?.progress).toBe(50);

      // Update grandchild to 20km (100%)
      await updateGoal(testUserId, grandchild.id, { currentValue: 20 });

      fetchedChild = await getGoal(testUserId, child.id);
      expect(fetchedChild?.progress).toBe(100);

      fetchedParent = await getGoal(testUserId, parent.id);
      expect(fetchedParent?.progress).toBe(100);
    });
  });

  describe("Direct Task on Goal Rollup (No Project)", () => {
    it("recalculates goal progress based on direct tasks", async () => {
      if (!probe.isAvailable) return;

      const goal = await createGoal(testUserId, {
        title: "Declutter Home Office",
        horizon: "short_term",
        area: "personal_development",
      });

      const t1 = await createTask(testUserId, {
        title: "Donate old monitors",
        goalId: goal.id,
      });

      const t2 = await createTask(testUserId, {
        title: "Shred obsolete tax records",
        goalId: goal.id,
      });

      let g = await getGoal(testUserId, goal.id);
      expect(g?.progress).toBe(0);
      expect(g?.directTasksCount).toBe(2);

      // Complete task 1
      await updateTask(testUserId, t1.id, { status: "completed" });

      g = await getGoal(testUserId, goal.id);
      expect(g?.progress).toBe(50);

      // Complete task 2
      await updateTask(testUserId, t2.id, { status: "completed" });

      g = await getGoal(testUserId, goal.id);
      expect(g?.progress).toBe(100);
    });
  });
});
