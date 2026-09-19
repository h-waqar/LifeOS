// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { goals, projects, tasks } from "@/server/db/schema";
import { auth } from "@/server/auth";
import { eq, and } from "drizzle-orm";

describe("Phase 2 Plan 02-02: Goal Schema & Database Invariants (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p02_goal_schema_user@example.com",
    password: "Plan02GoalPassword123!",
    name: "Goal Schema Tester",
  };

  let testUserId: string;

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    await db.delete(user);

    const res = await auth.api.signUpEmail({
      body: testUser,
      asResponse: true,
    });
    expect(res.status).toBe(200);

    const [createdUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testUser.email));
    testUserId = createdUser.id;
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await db.delete(user);
      await closeDatabase();
    }
  });

  it("1. Rejects foreign user parent_goal_id via composite foreign key (user_id, parent_goal_id)", async () => {
    const foreignUserId = "foreign_user_" + crypto.randomUUID().slice(0, 8);
    const foreignGoalId = "foreign_goal_" + crypto.randomUUID().slice(0, 8);

    await expect(
      db.insert(goals).values({
        userId: testUserId,
        title: "Malicious Goal Cross-Tenant",
        parentGoalId: foreignGoalId,
      })
    ).rejects.toThrow();
  });

  it("2. Rejects direct self-parenting via database CHECK constraint (parent_goal_id != id)", async () => {
    const goalId = "self_parent_goal_" + crypto.randomUUID().slice(0, 8);

    await expect(
      db.insert(goals).values({
        id: goalId,
        userId: testUserId,
        title: "Self Parenting Goal",
        parentGoalId: goalId,
      })
    ).rejects.toThrow();
  });

  it("3. Blocks direct cycle (A -> B -> A) via recursive CTE trigger", async () => {
    const goalAId = "cycle_a_" + crypto.randomUUID().slice(0, 8);
    const goalBId = "cycle_b_" + crypto.randomUUID().slice(0, 8);

    // Insert Goal A (root)
    await db.insert(goals).values({
      id: goalAId,
      userId: testUserId,
      title: "Goal A",
      parentGoalId: null,
    });

    // Insert Goal B with parent Goal A
    await db.insert(goals).values({
      id: goalBId,
      userId: testUserId,
      title: "Goal B",
      parentGoalId: goalAId,
    });

    // Attempt to set Goal A's parent to Goal B (creates A -> B -> A)
    let err3: any;
    try {
      await db
        .update(goals)
        .set({ parentGoalId: goalBId })
        .where(and(eq(goals.userId, testUserId), eq(goals.id, goalAId)));
    } catch (e: any) {
      err3 = e;
    }
    expect(err3).toBeDefined();
    expect(err3.cause?.message || err3.message).toMatch(/cycle/i);
  });

  it("4. Blocks transitive cycle (A -> B -> C -> A) via recursive CTE trigger", async () => {
    const goalAId = "trans_a_" + crypto.randomUUID().slice(0, 8);
    const goalBId = "trans_b_" + crypto.randomUUID().slice(0, 8);
    const goalCId = "trans_c_" + crypto.randomUUID().slice(0, 8);

    // A -> null
    await db.insert(goals).values({
      id: goalAId,
      userId: testUserId,
      title: "Goal A Transitive",
    });

    // B -> A
    await db.insert(goals).values({
      id: goalBId,
      userId: testUserId,
      title: "Goal B Transitive",
      parentGoalId: goalAId,
    });

    // C -> B
    await db.insert(goals).values({
      id: goalCId,
      userId: testUserId,
      title: "Goal C Transitive",
      parentGoalId: goalBId,
    });

    // Attempt to set A -> C (creates A -> C -> B -> A)
    let err4: any;
    try {
      await db
        .update(goals)
        .set({ parentGoalId: goalCId })
        .where(and(eq(goals.userId, testUserId), eq(goals.id, goalAId)));
    } catch (e: any) {
      err4 = e;
    }
    expect(err4).toBeDefined();
    expect(err4.cause?.message || err4.message).toMatch(/cycle/i);
  });

  it("5. Nullifies parent_goal_id on child goals when parent goal is deleted (ON DELETE SET NULL)", async () => {
    const parentId = "parent_del_" + crypto.randomUUID().slice(0, 8);
    const childId = "child_del_" + crypto.randomUUID().slice(0, 8);

    await db.insert(goals).values({
      id: parentId,
      userId: testUserId,
      title: "Parent To Delete",
    });

    await db.insert(goals).values({
      id: childId,
      userId: testUserId,
      title: "Child Goal",
      parentGoalId: parentId,
    });

    // Delete parent
    await db
      .delete(goals)
      .where(and(eq(goals.userId, testUserId), eq(goals.id, parentId)));

    // Verify child goal now has parent_goal_id = null
    const [child] = await db
      .select({ parentGoalId: goals.parentGoalId })
      .from(goals)
      .where(and(eq(goals.userId, testUserId), eq(goals.id, childId)));

    expect(child).toBeDefined();
    expect(child.parentGoalId).toBeNull();
  });

  it("6. Nullifies goal_id on linked projects and tasks when goal is deleted (ON DELETE SET NULL)", async () => {
    const goalId = "goal_del_links_" + crypto.randomUUID().slice(0, 8);
    const projId = "proj_linked_" + crypto.randomUUID().slice(0, 8);
    const taskId = "task_linked_" + crypto.randomUUID().slice(0, 8);

    await db.insert(goals).values({
      id: goalId,
      userId: testUserId,
      title: "Goal With Linked Resources",
    });

    await db.insert(projects).values({
      id: projId,
      userId: testUserId,
      name: "Linked Project",
      goalId,
    });

    await db.insert(tasks).values({
      id: taskId,
      userId: testUserId,
      title: "Direct Linked Task",
      goalId,
    });

    // Delete goal
    await db
      .delete(goals)
      .where(and(eq(goals.userId, testUserId), eq(goals.id, goalId)));

    // Check project goalId nullified
    const [proj] = await db
      .select({ goalId: projects.goalId })
      .from(projects)
      .where(and(eq(projects.userId, testUserId), eq(projects.id, projId)));
    expect(proj.goalId).toBeNull();

    // Check task goalId nullified
    const [taskRow] = await db
      .select({ goalId: tasks.goalId })
      .from(tasks)
      .where(and(eq(tasks.userId, testUserId), eq(tasks.id, taskId)));
    expect(taskRow.goalId).toBeNull();
  });
});
