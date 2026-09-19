import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { auth } from "@/server/auth";
import {
  createTask,
  updateTask,
  getTask,
  deleteTask,
  addTaskDependency,
  getTaskDependencies,
  InvariantViolationError,
  NotFoundError,
} from "@/server/tasks/service";
import {
  GET as dependenciesGet,
  POST as dependenciesPost,
} from "@/app/api/tasks/[id]/dependencies/route";
import { DELETE as dependencyDelete } from "@/app/api/tasks/[id]/dependencies/[dependsOnId]/route";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

describe("Plan 02-01: Task Dependencies & DAG Invariants (Integration Suite)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p02_deps_user@example.com",
    password: "Plan02DepsPassword123!",
    name: "User DAG Tester",
  };

  let testUserId: string;
  let cookieHeader: string;
  const foreignTaskId = "foreign_task_" + crypto.randomUUID().slice(0, 8);
  const foreignUserId = "foreign_user_" + crypto.randomUUID().slice(0, 8);

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    await db.delete(user);

    const res = await auth.api.signUpEmail({
      body: testUser,
      asResponse: true,
    });
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie")!;
    const match = cookie.match(/better-auth\.session_token=([^;]+)/);
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

  describe("Self-Dependency & Cycle Rejection Invariants", () => {
    it("rejects direct self-dependency: Task A depends on Task A", async () => {
      if (!probe.isAvailable) return;

      const taskA = await createTask(testUserId, { title: "Task Self Dep" });

      await expect(
        addTaskDependency(testUserId, taskA.id, taskA.id)
      ).rejects.toThrow(InvariantViolationError);

      // Verify via API route
      const req = new NextRequest(
        `http://localhost:3000/api/tasks/${taskA.id}/dependencies`,
        {
          method: "POST",
          headers: {
            cookie: cookieHeader,
            "content-type": "application/json",
          },
          body: JSON.stringify({ dependsOnTaskId: taskA.id }),
        }
      );
      const res = await dependenciesPost(req, {
        params: Promise.resolve({ id: taskA.id }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("cannot depend on itself");
    });

    it("rejects 2-level cycle: Task A depends on B, then B attempts to depend on A", async () => {
      if (!probe.isAvailable) return;

      const taskA = await createTask(testUserId, { title: "Cycle Task A" });
      const taskB = await createTask(testUserId, { title: "Cycle Task B" });

      // A depends on B (B is prerequisite for A)
      const dep1 = await addTaskDependency(testUserId, taskA.id, taskB.id);
      expect(dep1.success).toBe(true);

      // Now B attempts to depend on A -> cycle!
      await expect(
        addTaskDependency(testUserId, taskB.id, taskA.id)
      ).rejects.toThrow(InvariantViolationError);

      // Verify via API route
      const req = new NextRequest(
        `http://localhost:3000/api/tasks/${taskB.id}/dependencies`,
        {
          method: "POST",
          headers: {
            cookie: cookieHeader,
            "content-type": "application/json",
          },
          body: JSON.stringify({ dependsOnTaskId: taskA.id }),
        }
      );
      const res = await dependenciesPost(req, {
        params: Promise.resolve({ id: taskB.id }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Circular task dependency detected");
    });

    it("rejects 3-level transitive cycle: A -> B -> C, then C attempts to depend on A", async () => {
      if (!probe.isAvailable) return;

      const task1 = await createTask(testUserId, { title: "Transitive 1" });
      const task2 = await createTask(testUserId, { title: "Transitive 2" });
      const task3 = await createTask(testUserId, { title: "Transitive 3" });

      // 1 depends on 2
      await addTaskDependency(testUserId, task1.id, task2.id);
      // 2 depends on 3
      await addTaskDependency(testUserId, task2.id, task3.id);

      // 3 attempts to depend on 1 -> cycle: 1 -> 2 -> 3 -> 1
      await expect(
        addTaskDependency(testUserId, task3.id, task1.id)
      ).rejects.toThrow(InvariantViolationError);
    });
  });

  describe("Cross-User Isolation & BOLA Defense Invariants", () => {
    it("returns uniform 404 when user attempts to depend on foreign/nonexistent task", async () => {
      if (!probe.isAvailable) return;

      const task = await createTask(testUserId, { title: "Isolation Task" });

      // Service layer check
      await expect(
        addTaskDependency(testUserId, task.id, foreignTaskId)
      ).rejects.toThrow(NotFoundError);

      // API route check
      const req = new NextRequest(
        `http://localhost:3000/api/tasks/${task.id}/dependencies`,
        {
          method: "POST",
          headers: {
            cookie: cookieHeader,
            "content-type": "application/json",
          },
          body: JSON.stringify({ dependsOnTaskId: foreignTaskId }),
        }
      );
      const res = await dependenciesPost(req, {
        params: Promise.resolve({ id: task.id }),
      });
      expect(res.status).toBe(404);
    });

    it("rejects unauthorized caller accessing another user's task dependencies", async () => {
      if (!probe.isAvailable) return;

      const task = await createTask(testUserId, { title: "User Task" });

      await expect(
        getTaskDependencies(foreignUserId, task.id)
      ).rejects.toThrow(NotFoundError);
    });

    it("returns 404 when querying dependencies for a foreign task ID via API route", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest(
        `http://localhost:3000/api/tasks/${foreignTaskId}/dependencies`,
        {
          method: "GET",
          headers: { cookie: cookieHeader },
        }
      );
      const res = await dependenciesGet(req, {
        params: Promise.resolve({ id: foreignTaskId }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("Dependency Retrieval, Removal, and Cascade Deletion", () => {
    it("correctly categorizes blockedBy and blocks, and reflects penalty score", async () => {
      if (!probe.isAvailable) return;

      // taskMain depends on prereq1 and prereq2
      // follower depends on taskMain
      const taskMain = await createTask(testUserId, {
        title: "Main Feature Implementation",
        priority: "high", // Base 70
      });
      const prereq1 = await createTask(testUserId, {
        title: "Prerequisite 1",
        status: "todo",
      });
      const prereq2 = await createTask(testUserId, {
        title: "Prerequisite 2",
        status: "todo",
      });
      const follower = await createTask(testUserId, {
        title: "Follower Task",
        status: "todo",
      });

      await addTaskDependency(testUserId, taskMain.id, prereq1.id);
      await addTaskDependency(testUserId, taskMain.id, prereq2.id);
      await addTaskDependency(testUserId, follower.id, taskMain.id);

      // Retrieve dependencies for taskMain
      const deps = await getTaskDependencies(testUserId, taskMain.id);
      expect(deps.blockedBy.length).toBe(2);
      expect(deps.blockedBy.map((t) => t.id).sort()).toEqual(
        [prereq1.id, prereq2.id].sort()
      );
      expect(deps.blocks.length).toBe(1);
      expect(deps.blocks[0].id).toBe(follower.id);

      // Check taskMain priority score has blocked penalty (-50)
      const fetchedMain = await getTask(testUserId, taskMain.id);
      expect(fetchedMain?.hasUncompletedDependencies).toBe(true);
      expect(fetchedMain?.priorityScore).toBe(20); // 70 (high) - 50 (blocked) = 20

      // Complete prereq1; still blocked by prereq2
      await updateTask(testUserId, prereq1.id, { status: "completed" });
      const mainAfter1 = await getTask(testUserId, taskMain.id);
      expect(mainAfter1?.hasUncompletedDependencies).toBe(true);
      expect(mainAfter1?.priorityScore).toBe(20);

      // Complete prereq2; all prerequisites complete -> unblocked!
      await updateTask(testUserId, prereq2.id, { status: "completed" });
      const mainAfter2 = await getTask(testUserId, taskMain.id);
      expect(mainAfter2?.hasUncompletedDependencies).toBe(false);
      expect(mainAfter2?.priorityScore).toBe(70); // 70, penalty lifted!
    });

    it("removes dependency via API and cascades on task deletion", async () => {
      if (!probe.isAvailable) return;

      const t1 = await createTask(testUserId, { title: "T1" });
      const t2 = await createTask(testUserId, { title: "T2" });
      await addTaskDependency(testUserId, t1.id, t2.id);

      // Remove dependency via API
      const delReq = new NextRequest(
        `http://localhost:3000/api/tasks/${t1.id}/dependencies/${t2.id}`,
        {
          method: "DELETE",
          headers: { cookie: cookieHeader },
        }
      );
      const delRes = await dependencyDelete(delReq, {
        params: Promise.resolve({ id: t1.id, dependsOnId: t2.id }),
      });
      expect(delRes.status).toBe(200);

      const depsAfter = await getTaskDependencies(testUserId, t1.id);
      expect(depsAfter.blockedBy.length).toBe(0);

      // Re-add and verify cascade deletion on task delete
      await addTaskDependency(testUserId, t1.id, t2.id);
      await deleteTask(testUserId, t2.id);

      const depsAfterTaskDelete = await getTaskDependencies(testUserId, t1.id);
      expect(depsAfterTaskDelete.blockedBy.length).toBe(0);
    });
  });
});
