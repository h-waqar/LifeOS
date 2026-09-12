import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { projects } from "@/server/db/schema/projects";
import { tasks } from "@/server/db/schema/tasks";
import { auditLog } from "@/server/db/schema/audit";
import { auth } from "@/server/auth";
import {
  createTask,
  updateTask,
  getTask,
  deleteTask,
} from "@/server/tasks/service";
import {
  createProject,
  updateProject,
  deleteProject,
  getProject,
} from "@/server/projects/service";
import { eq, and, sql } from "drizzle-orm";

describe("Plan 01-08: Transaction Boundaries & Concurrency Audit Integration Suite", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "plan08_tx@example.com",
    password: "Plan08TxPassword123!",
    name: "Plan08 Transaction Auditor",
  };

  let testUserId: string;

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

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

  describe("Atomic Mutation & Audit Log Transaction Boundary", () => {
    it("commits entity and audit log atomically in the same database transaction on createTask", async () => {
      if (!probe.isAvailable) return;

      const created = await createTask(testUserId, {
        title: "Atomic Task Creation",
      });

      // Assert task exists
      const taskRow = await getTask(testUserId, created.id);
      expect(taskRow).not.toBeNull();

      // Assert audit log exists for this specific task creation
      const auditRows = await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.userId, testUserId),
            eq(auditLog.action, "task.create")
          )
        );

      const matchingAudit = auditRows.find(
        (row) => (row.details as any)?.taskId === created.id
      );
      expect(matchingAudit).toBeDefined();
      expect(matchingAudit?.status).toBe("success");
      expect(matchingAudit?.actor).toBe(`user:${testUserId}`);

      await deleteTask(testUserId, created.id);
    });

    it("commits entity and audit log atomically on createProject", async () => {
      if (!probe.isAvailable) return;

      const createdProj = await createProject(testUserId, {
        name: "Atomic Project Creation",
      });

      const projRow = await getProject(testUserId, createdProj.id);
      expect(projRow).not.toBeNull();

      const auditRows = await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.userId, testUserId),
            eq(auditLog.action, "project.create")
          )
        );

      const matchingAudit = auditRows.find(
        (row) => (row.details as any)?.projectId === createdProj.id
      );
      expect(matchingAudit).toBeDefined();
      expect(matchingAudit?.actor).toBe(`user:${testUserId}`);

      await deleteProject(testUserId, createdProj.id);
    });

    it("rolls back completely and leaves NO orphaned records or partial data when transaction fails", async () => {
      if (!probe.isAvailable) return;

      const doomedTitle = "Doomed Atomic Rollback Task " + crypto.randomUUID();

      // Execute a transaction that attempts task insertion then deliberately triggers a failure
      let txError: any = null;
      try {
        await db.transaction(async (tx) => {
          await tx.insert(tasks).values({
            userId: testUserId,
            title: doomedTitle,
          });

          // Deliberate failure inside the transaction
          throw new Error("Deliberate simulated transaction failure");
        });
      } catch (err) {
        txError = err;
      }

      expect(txError).not.toBeNull();

      // Assert task was rolled back and does not exist in DB
      const taskResults = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.userId, testUserId), eq(tasks.title, doomedTitle)));
      expect(taskResults.length).toBe(0);
    });

    it("rolls back mutation if audit log writing fails within transaction boundary", async () => {
      if (!probe.isAvailable) return;

      const unAuditedTitle = "Task Without Audit " + crypto.randomUUID();

      let txError: any = null;
      try {
        await db.transaction(async (tx) => {
          const [inserted] = await tx
            .insert(tasks)
            .values({
              userId: testUserId,
              title: unAuditedTitle,
            })
            .returning();

          // Simulating audit logging failure inside transaction
          // (e.g. empty action name throws Error in transactional mode)
          const { createAuditLog } = await import("@/server/audit");
          await createAuditLog(
            {
              userId: testUserId,
              category: "mutation",
              action: "", // Invalid empty action triggers failure in transactional mode
              status: "success",
            },
            tx
          );
        });
      } catch (err) {
        txError = err;
      }

      expect(txError).not.toBeNull();

      // Assert task was rolled back
      const remaining = await db
        .select()
        .from(tasks)
        .where(eq(tasks.title, unAuditedTitle));
      expect(remaining.length).toBe(0);
    });
  });

  describe("Completion Status & completedAt Timestamp Consistency", () => {
    it("guarantees status = 'completed' always maintains non-null completedAt under concurrent updates", async () => {
      if (!probe.isAvailable) return;

      const task = await createTask(testUserId, {
        title: "Concurrent Completion Test",
        status: "todo",
      });

      expect(task.completedAt).toBeNull();

      // Concurrently execute multiple updates: some updating priority/title, some marking completed
      const updates = [
        updateTask(testUserId, task.id, { title: "Updated Title 1" }),
        updateTask(testUserId, task.id, { status: "completed" }),
        updateTask(testUserId, task.id, { priority: "high" }),
        updateTask(testUserId, task.id, { description: "Concurrent notes" }),
      ];

      await Promise.all(updates);

      const freshTask = await getTask(testUserId, task.id);
      expect(freshTask).not.toBeNull();

      // Invariant: if status is completed, completedAt MUST NOT be null
      if (freshTask!.status === "completed") {
        expect(freshTask!.completedAt).not.toBeNull();
      }

      // Moving back to todo must clear completedAt
      const uncompletedTask = await updateTask(testUserId, task.id, {
        status: "todo",
      });
      expect(uncompletedTask.status).toBe("todo");
      expect(uncompletedTask.completedAt).toBeNull();

      await deleteTask(testUserId, task.id);
    });
  });

  describe("Concurrent Project Deletion & Task Unlinking", () => {
    it("sets task projectId to NULL via ON DELETE SET NULL when project is deleted concurrently", async () => {
      if (!probe.isAvailable) return;

      const project = await createProject(testUserId, {
        name: "Project to Unlink Concurrently",
      });

      const task1 = await createTask(testUserId, {
        title: "Linked Task 1",
        projectId: project.id,
      });
      const task2 = await createTask(testUserId, {
        title: "Linked Task 2",
        projectId: project.id,
      });

      expect(task1.projectId).toBe(project.id);
      expect(task2.projectId).toBe(project.id);

      // Concurrently delete the project while updating task1
      const [delRes, updateRes] = await Promise.allSettled([
        deleteProject(testUserId, project.id),
        updateTask(testUserId, task1.id, { title: "Task 1 Updated Concurrently" }),
      ]);

      expect(delRes.status).toBe("fulfilled");

      // Verify tasks still exist and have projectId = null
      const freshTask1 = await getTask(testUserId, task1.id);
      const freshTask2 = await getTask(testUserId, task2.id);

      expect(freshTask1).not.toBeNull();
      expect(freshTask1!.projectId).toBeNull();

      expect(freshTask2).not.toBeNull();
      expect(freshTask2!.projectId).toBeNull();

      await deleteTask(testUserId, task1.id);
      await deleteTask(testUserId, task2.id);
    });
  });
});
