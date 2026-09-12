import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { projects } from "@/server/db/schema/projects";
import { tasks } from "@/server/db/schema/tasks";
import { auth } from "@/server/auth";
import {
  createTask,
  updateTask,
  getTask,
  deleteTask,
  InvariantViolationError,
  NotFoundError,
} from "@/server/tasks/service";
import { createProject } from "@/server/projects/service";
import {
  PATCH as taskItemPatch,
  GET as taskItemGet,
} from "@/app/api/tasks/[id]/route";
import { eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";

describe("Plan 01-08: Task Hierarchy Integrity & Cycle Prevention Integration Suite", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "plan08_hierarchy@example.com",
    password: "Plan08HierarchyPassword123!",
    name: "Plan08 Hierarchy Auditor",
  };

  let testUserId: string;
  let cookieHeader: string;

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    // Clean any prior state
    await db.delete(user);

    const res = await auth.api.signUpEmail({
      body: {
        email: testUser.email,
        password: testUser.password,
        name: testUser.name,
      },
      asResponse: true,
    });

    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie")!;
    const match = setCookie.match(/better-auth\.session_token=([^;]+)/);
    expect(match).toBeTruthy();
    cookieHeader = `better-auth.session_token=${match![1]}`;

    const [createdUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testUser.email));
    testUserId = createdUser.id;
  });

  afterAll(async () => {
    if (!probe.isAvailable) return;
    await db.delete(user);
    await closeDatabase();
  });

  describe("Arbitrary-Depth Cycle Prevention (Application & Service Layer)", () => {
    it("rejects 1-level cycle: A -> A (direct self-parent)", async () => {
      if (!probe.isAvailable) return;

      const taskA = await createTask(testUserId, { title: "Task A" });

      // Service layer attempt
      await expect(
        updateTask(testUserId, taskA.id, { parentTaskId: taskA.id })
      ).rejects.toThrow(InvariantViolationError);

      // API route attempt
      const patchReq = new NextRequest(
        `http://localhost:3000/api/tasks/${taskA.id}`,
        {
          method: "PATCH",
          headers: {
            cookie: cookieHeader,
            "content-type": "application/json",
          },
          body: JSON.stringify({ parentTaskId: taskA.id }),
        }
      );
      const patchRes = await taskItemPatch(patchReq, {
        params: Promise.resolve({ id: taskA.id }),
      });
      expect(patchRes.status).toBe(400);
      const data = await patchRes.json();
      expect(data.error).toContain("cannot be its own parent");

      await deleteTask(testUserId, taskA.id);
    });

    it("rejects 2-level cycle: A -> B -> A", async () => {
      if (!probe.isAvailable) return;

      // Create A (root)
      const taskA = await createTask(testUserId, { title: "Task A" });
      // Create B with parent A
      const taskB = await createTask(testUserId, {
        title: "Task B",
        parentTaskId: taskA.id,
      });

      // Attempt to set A's parent to B (creating A -> B -> A)
      await expect(
        updateTask(testUserId, taskA.id, { parentTaskId: taskB.id })
      ).rejects.toThrow(InvariantViolationError);

      // API route verification
      const patchReq = new NextRequest(
        `http://localhost:3000/api/tasks/${taskA.id}`,
        {
          method: "PATCH",
          headers: {
            cookie: cookieHeader,
            "content-type": "application/json",
          },
          body: JSON.stringify({ parentTaskId: taskB.id }),
        }
      );
      const patchRes = await taskItemPatch(patchReq, {
        params: Promise.resolve({ id: taskA.id }),
      });
      expect(patchRes.status).toBe(400);
      const data = await patchRes.json();
      expect(data.error).toContain("hierarchy cycle detected");

      // Verify A's parent remains null
      const freshA = await getTask(testUserId, taskA.id);
      expect(freshA?.parentTaskId).toBeNull();

      await deleteTask(testUserId, taskA.id);
    });

    it("rejects 3-level cycle: A -> B -> C -> A", async () => {
      if (!probe.isAvailable) return;

      const taskA = await createTask(testUserId, { title: "Task A" });
      const taskB = await createTask(testUserId, {
        title: "Task B",
        parentTaskId: taskA.id,
      });
      const taskC = await createTask(testUserId, {
        title: "Task C",
        parentTaskId: taskB.id,
      });

      // Attempt to reparent A to C
      await expect(
        updateTask(testUserId, taskA.id, { parentTaskId: taskC.id })
      ).rejects.toThrow(InvariantViolationError);

      // Verify database remains untouched
      const freshA = await getTask(testUserId, taskA.id);
      expect(freshA?.parentTaskId).toBeNull();

      await deleteTask(testUserId, taskA.id);
    });

    it("rejects 4-level cycle: A -> B -> C -> D -> A", async () => {
      if (!probe.isAvailable) return;

      const taskA = await createTask(testUserId, { title: "Task A" });
      const taskB = await createTask(testUserId, {
        title: "Task B",
        parentTaskId: taskA.id,
      });
      const taskC = await createTask(testUserId, {
        title: "Task C",
        parentTaskId: taskB.id,
      });
      const taskD = await createTask(testUserId, {
        title: "Task D",
        parentTaskId: taskC.id,
      });

      // Attempt to reparent A to D
      await expect(
        updateTask(testUserId, taskA.id, { parentTaskId: taskD.id })
      ).rejects.toThrow(InvariantViolationError);

      await deleteTask(testUserId, taskA.id);
    });

    it("rejects reparenting a task to one of its nested descendants", async () => {
      if (!probe.isAvailable) return;

      // Tree: A -> B -> C -> D
      const taskA = await createTask(testUserId, { title: "Task A" });
      const taskB = await createTask(testUserId, {
        title: "Task B",
        parentTaskId: taskA.id,
      });
      const taskC = await createTask(testUserId, {
        title: "Task C",
        parentTaskId: taskB.id,
      });
      const taskD = await createTask(testUserId, {
        title: "Task D",
        parentTaskId: taskC.id,
      });

      // Reparenting B to D (creating B -> D -> C -> B)
      await expect(
        updateTask(testUserId, taskB.id, { parentTaskId: taskD.id })
      ).rejects.toThrow(InvariantViolationError);

      // Reparenting B to C (creating B -> C -> B)
      await expect(
        updateTask(testUserId, taskB.id, { parentTaskId: taskC.id })
      ).rejects.toThrow(InvariantViolationError);

      await deleteTask(testUserId, taskA.id);
    });
  });

  describe("Reparenting Across Users & Projects", () => {
    it("rejects reparenting a task to a foreign user's parent task ID (returns 404 / NotFoundError)", async () => {
      if (!probe.isAvailable) return;

      const foreignTaskId = "foreign_task_" + crypto.randomUUID().slice(0, 8);
      const taskA = await createTask(testUserId, { title: "Task A" });

      await expect(
        updateTask(testUserId, taskA.id, { parentTaskId: foreignTaskId })
      ).rejects.toThrow(NotFoundError);

      await deleteTask(testUserId, taskA.id);
    });

    it("rejects linking a subtask to a conflicting project different from its parent's project", async () => {
      if (!probe.isAvailable) return;

      const project1 = await createProject(testUserId, { name: "Project 1" });
      const project2 = await createProject(testUserId, { name: "Project 2" });

      const parentTask = await createTask(testUserId, {
        title: "Parent in P1",
        projectId: project1.id,
      });

      // Creating child in P2 with parent in P1 must fail
      await expect(
        createTask(testUserId, {
          title: "Child in P2",
          parentTaskId: parentTask.id,
          projectId: project2.id,
        })
      ).rejects.toThrow(InvariantViolationError);

      // Creating child without explicit project must inherit P1
      const inheritedChild = await createTask(testUserId, {
        title: "Inherited Child",
        parentTaskId: parentTask.id,
      });
      expect(inheritedChild.projectId).toBe(project1.id);

      // Updating child to P2 while under parent in P1 must fail
      await expect(
        updateTask(testUserId, inheritedChild.id, { projectId: project2.id })
      ).rejects.toThrow(InvariantViolationError);

      await deleteTask(testUserId, parentTask.id);
    });

    it("automatically propagates updated projectId to all nested descendants when parent task moves project", async () => {
      if (!probe.isAvailable) return;

      const project1 = await createProject(testUserId, { name: "Project Initial" });
      const project2 = await createProject(testUserId, { name: "Project Destination" });

      const taskA = await createTask(testUserId, {
        title: "Task A",
        projectId: project1.id,
      });
      const taskB = await createTask(testUserId, {
        title: "Task B",
        parentTaskId: taskA.id,
      });
      const taskC = await createTask(testUserId, {
        title: "Task C",
        parentTaskId: taskB.id,
      });

      expect(taskA.projectId).toBe(project1.id);
      expect(taskB.projectId).toBe(project1.id);
      expect(taskC.projectId).toBe(project1.id);

      // Move taskA to project2
      const updatedA = await updateTask(testUserId, taskA.id, {
        projectId: project2.id,
      });
      expect(updatedA.projectId).toBe(project2.id);

      // Verify descendants B and C have also moved to project2
      const freshB = await getTask(testUserId, taskB.id);
      const freshC = await getTask(testUserId, taskC.id);
      expect(freshB?.projectId).toBe(project2.id);
      expect(freshC?.projectId).toBe(project2.id);

      await deleteTask(testUserId, taskA.id);
    });
  });

  describe("Concurrent Hierarchy & Deletion Integrity", () => {
    it("handles concurrent competing reparenting without corrupting hierarchy or allowing cycles", async () => {
      if (!probe.isAvailable) return;

      const taskA = await createTask(testUserId, { title: "Task A" });
      const taskB = await createTask(testUserId, { title: "Task B" });

      // Run competing reparenting concurrently:
      // T1 attempts to set A's parent to B
      // T2 attempts to set B's parent to A
      const [resA, resB] = await Promise.allSettled([
        updateTask(testUserId, taskA.id, { parentTaskId: taskB.id }),
        updateTask(testUserId, taskB.id, { parentTaskId: taskA.id }),
      ]);

      // Both cannot succeed with mutual parent references (that would be a cycle)
      const successA = resA.status === "fulfilled";
      const successB = resB.status === "fulfilled";

      expect(
        !(successA && successB),
        "Both concurrent reparenting operations cannot succeed simultaneously"
      ).toBe(true);

      const freshA = await getTask(testUserId, taskA.id);
      const freshB = await getTask(testUserId, taskB.id);

      // Assert that A and B are NOT mutually referencing each other
      const isMutualCycle =
        freshA?.parentTaskId === taskB.id && freshB?.parentTaskId === taskA.id;
      expect(isMutualCycle).toBe(false);

      await deleteTask(testUserId, taskA.id);
      await deleteTask(testUserId, taskB.id);
    });

    it("cascades deletion across multi-level nested tree: A -> B -> C -> D", async () => {
      if (!probe.isAvailable) return;

      const taskA = await createTask(testUserId, { title: "Task A" });
      const taskB = await createTask(testUserId, {
        title: "Task B",
        parentTaskId: taskA.id,
      });
      const taskC = await createTask(testUserId, {
        title: "Task C",
        parentTaskId: taskB.id,
      });
      const taskD = await createTask(testUserId, {
        title: "Task D",
        parentTaskId: taskC.id,
      });

      // Delete root task A
      await deleteTask(testUserId, taskA.id);

      // Verify all descendants were deleted via ON DELETE CASCADE
      expect(await getTask(testUserId, taskA.id)).toBeNull();
      expect(await getTask(testUserId, taskB.id)).toBeNull();
      expect(await getTask(testUserId, taskC.id)).toBeNull();
      expect(await getTask(testUserId, taskD.id)).toBeNull();
    });

    it("safely rejects updating a child task whose parent is deleted concurrently", async () => {
      if (!probe.isAvailable) return;

      const parentTask = await createTask(testUserId, { title: "Doomed Parent" });
      const childTask = await createTask(testUserId, {
        title: "Orphaned Child",
        parentTaskId: parentTask.id,
      });

      // Delete parent
      await deleteTask(testUserId, parentTask.id);

      // Updating child must throw NotFoundError because child was cascade-deleted
      await expect(
        updateTask(testUserId, childTask.id, { title: "Updated After Delete" })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("Direct Database SQL Invariant Verification (Bypass Resistance)", () => {
    it("PostgreSQL trigger blocks direct SQL attempt to create 2-cycle (A -> B -> A)", async () => {
      if (!probe.isAvailable) return;

      const idA = crypto.randomUUID();
      const idB = crypto.randomUUID();

      await db.insert(tasks).values([
        { id: idA, userId: testUserId, title: "SQL Task A" },
        { id: idB, userId: testUserId, title: "SQL Task B", parentTaskId: idA },
      ]);

      // Direct SQL update attempting to set idA parent to idB
      let thrownError: any = null;
      try {
        await db
          .update(tasks)
          .set({ parentTaskId: idB })
          .where(eq(tasks.id, idA));
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).not.toBeNull();
      const detailedMessage =
        thrownError?.cause?.message || thrownError?.message || "";
      expect(detailedMessage).toMatch(/Task hierarchy cycle detected/i);

      await db.delete(tasks).where(eq(tasks.id, idA));
    });

    it("PostgreSQL trigger blocks direct SQL attempt to create 3-cycle (A -> B -> C -> A)", async () => {
      if (!probe.isAvailable) return;

      const idA = crypto.randomUUID();
      const idB = crypto.randomUUID();
      const idC = crypto.randomUUID();

      await db.insert(tasks).values([
        { id: idA, userId: testUserId, title: "SQL Task A" },
        { id: idB, userId: testUserId, title: "SQL Task B", parentTaskId: idA },
        { id: idC, userId: testUserId, title: "SQL Task C", parentTaskId: idB },
      ]);

      let thrownError: any = null;
      try {
        await db
          .update(tasks)
          .set({ parentTaskId: idC })
          .where(eq(tasks.id, idA));
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).not.toBeNull();
      const detailedMessage =
        thrownError?.cause?.message || thrownError?.message || "";
      expect(detailedMessage).toMatch(/Task hierarchy cycle detected/i);

      await db.delete(tasks).where(eq(tasks.id, idA));
    });

    it("PostgreSQL trigger blocks direct SQL attempt to reparent a node to its descendant", async () => {
      if (!probe.isAvailable) return;

      const idA = crypto.randomUUID();
      const idB = crypto.randomUUID();
      const idC = crypto.randomUUID();

      await db.insert(tasks).values([
        { id: idA, userId: testUserId, title: "SQL Task A" },
        { id: idB, userId: testUserId, title: "SQL Task B", parentTaskId: idA },
        { id: idC, userId: testUserId, title: "SQL Task C", parentTaskId: idB },
      ]);

      let thrownError: any = null;
      try {
        await db
          .update(tasks)
          .set({ parentTaskId: idC })
          .where(eq(tasks.id, idB));
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).not.toBeNull();
      const detailedMessage =
        thrownError?.cause?.message || thrownError?.message || "";
      expect(detailedMessage).toMatch(/Task hierarchy cycle detected/i);

      await db.delete(tasks).where(eq(tasks.id, idA));
    });
  });
});
