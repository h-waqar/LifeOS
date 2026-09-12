import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { auditLog } from "@/server/db/schema/audit";
import { projects } from "@/server/db/schema/projects";
import { tasks } from "@/server/db/schema/tasks";
import { createAuditLog } from "@/server/audit";
import { eq, sql } from "drizzle-orm";

const BASE_URL = process.env.LIVE_HTTP_URL || "http://localhost:3000";

describe("Plan 01-09: Concurrency, Contention & Race-Condition Verification Suite", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "plan09_concurrency@example.com",
    password: "ConcurrencyPassword123!",
    name: "Concurrency Adversary",
  };

  let sessionCookie: string;
  let createdUserId: string;

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    await db.delete(user);

    const signUpRes = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: BASE_URL,
      },
      body: JSON.stringify(testUser),
    });

    expect(signUpRes.status).toBe(200);
    const setCookie = signUpRes.headers.get("set-cookie");
    const match = setCookie!.match(/better-auth\.session_token=([^;]+)/);
    sessionCookie = `better-auth.session_token=${match![1]}`;

    const [dbUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testUser.email));
    createdUserId = dbUser.id;
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await db.delete(user);
      await closeDatabase();
    }
  });

  describe("Simultaneous Task Mutations & Lock Contention", () => {
    it("handles 10 parallel HTTP task updates on the same entity without corruption or deadlocks", async () => {
      if (!probe.isAvailable) return;

      // 1. Create a task
      const createRes = await fetch(`${BASE_URL}/api/tasks`, {
        method: "POST",
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Contended Task Base",
          priority: "low",
        }),
      });
      const { task } = await createRes.json();

      // 2. Dispatch 10 parallel PATCH updates
      const updatePromises = Array.from({ length: 10 }).map((_, i) =>
        fetch(`${BASE_URL}/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: {
            Cookie: sessionCookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: `Contended Task Update ${i}`,
            priority: i % 2 === 0 ? "high" : "medium",
          }),
        })
      );

      const responses = await Promise.all(updatePromises);
      for (const res of responses) {
        expect(res.status).toBe(200);
      }

      // 3. Verify final state in database
      const [finalTask] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, task.id));
      expect(finalTask).toBeDefined();
      expect(finalTask.title).toMatch(/Contended Task Update/);
    });

    it("handles simultaneous competing completion updates without violating completedAt invariant", async () => {
      if (!probe.isAvailable) return;

      const createRes = await fetch(`${BASE_URL}/api/tasks`, {
        method: "POST",
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Status Contended Task",
          status: "todo",
        }),
      });
      const { task } = await createRes.json();

      // Competing updates: 5 set completed, 5 set in_progress
      const statuses = [
        "completed",
        "in_progress",
        "completed",
        "todo",
        "completed",
        "in_progress",
        "completed",
        "todo",
        "completed",
        "todo",
      ];

      const responses = await Promise.all(
        statuses.map((s) =>
          fetch(`${BASE_URL}/api/tasks/${task.id}`, {
            method: "PATCH",
            headers: {
              Cookie: sessionCookie,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ status: s }),
          })
        )
      );

      for (const res of responses) {
        expect(res.status).toBe(200);
      }

      // Assert PostgreSQL invariant: status = 'completed' <=> completed_at IS NOT NULL
      const [finalTask] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, task.id));

      if (finalTask.status === "completed") {
        expect(finalTask.completedAt).not.toBeNull();
      } else {
        expect(finalTask.completedAt).toBeNull();
      }
    });
  });

  describe("Concurrent Reparenting & Cycle Prevention Races", () => {
    it("prevents circular hierarchy when two clients race to set each other as parent", async () => {
      if (!probe.isAvailable) return;

      // Create Task A and Task B
      const resA = await fetch(`${BASE_URL}/api/tasks`, {
        method: "POST",
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Task A" }),
      });
      const taskA = (await resA.json()).task;

      const resB = await fetch(`${BASE_URL}/api/tasks`, {
        method: "POST",
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Task B" }),
      });
      const taskB = (await resB.json()).task;

      // Launch simultaneous reparenting: A -> B and B -> A
      const [pA, pB] = await Promise.all([
        fetch(`${BASE_URL}/api/tasks/${taskA.id}`, {
          method: "PATCH",
          headers: {
            Cookie: sessionCookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ parentTaskId: taskB.id }),
        }),
        fetch(`${BASE_URL}/api/tasks/${taskB.id}`, {
          method: "PATCH",
          headers: {
            Cookie: sessionCookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ parentTaskId: taskA.id }),
        }),
      ]);

      // At least one MUST NOT succeed with 200 (either 400 Bad Request or serialized failure)
      const statuses = [pA.status, pB.status];
      const successCount = statuses.filter((s) => s === 200).length;
      expect(successCount).toBeLessThanOrEqual(1);

      // Verify database state: no cycle exists
      const rows = await db
        .select({ id: tasks.id, parentTaskId: tasks.parentTaskId })
        .from(tasks)
        .where(sql`${tasks.id} IN (${taskA.id}, ${taskB.id})`);

      const aRow = rows.find((r) => r.id === taskA.id);
      const bRow = rows.find((r) => r.id === taskB.id);

      const isCycle =
        aRow?.parentTaskId === taskB.id && bRow?.parentTaskId === taskA.id;
      expect(isCycle).toBe(false);
    });
  });

  describe("Parent Deletion Concurrent with Child Mutation", () => {
    it("handles parent deletion concurrent with child update cleanly", async () => {
      if (!probe.isAvailable) return;

      const parentRes = await fetch(`${BASE_URL}/api/tasks`, {
        method: "POST",
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Racing Parent Task" }),
      });
      const parentTask = (await parentRes.json()).task;

      const childRes = await fetch(`${BASE_URL}/api/tasks`, {
        method: "POST",
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Racing Child Task",
          parentTaskId: parentTask.id,
        }),
      });
      const childTask = (await childRes.json()).task;

      // Concurrently delete parent while updating child
      const [delRes, updateRes] = await Promise.all([
        fetch(`${BASE_URL}/api/tasks/${parentTask.id}`, {
          method: "DELETE",
          headers: { Cookie: sessionCookie },
        }),
        fetch(`${BASE_URL}/api/tasks/${childTask.id}`, {
          method: "PATCH",
          headers: {
            Cookie: sessionCookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title: "Updated Child During Deletion" }),
        }),
      ]);

      expect(delRes.status).toBe(200);
      // Child update either completed before delete (200) or failed because parent deleted it (404)
      expect([200, 404]).toContain(updateRes.status);

      // In the end, because parent was deleted, child MUST be cascade deleted
      const checkChild = await fetch(`${BASE_URL}/api/tasks/${childTask.id}`, {
        headers: { Cookie: sessionCookie },
      });
      expect(checkChild.status).toBe(404);
    });
  });

  describe("Project Deletion Concurrent with Task Creation", () => {
    it("handles project deletion concurrent with task creation safely", async () => {
      if (!probe.isAvailable) return;

      const projRes = await fetch(`${BASE_URL}/api/projects`, {
        method: "POST",
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Racing Project" }),
      });
      const project = (await projRes.json()).project;

      // Concurrently delete project while creating task in that project
      const [delRes, createRes] = await Promise.all([
        fetch(`${BASE_URL}/api/projects/${project.id}`, {
          method: "DELETE",
          headers: { Cookie: sessionCookie },
        }),
        fetch(`${BASE_URL}/api/tasks`, {
          method: "POST",
          headers: {
            Cookie: sessionCookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: "Task racing with project delete",
            projectId: project.id,
          }),
        }),
      ]);

      expect(delRes.status).toBe(200);
      // Creation either succeeded before delete (201) or failed because project vanished (404)
      expect([201, 404]).toContain(createRes.status);

      // Verify no foreign key violations or corrupted task pointers in database
      const orphanTasks = await db.execute(sql`
        SELECT t.id FROM tasks t
        LEFT JOIN projects p ON t.project_id = p.id
        WHERE t.project_id IS NOT NULL AND p.id IS NULL;
      `);
      expect(orphanTasks.rows.length).toBe(0);
    });
  });

  describe("High-Concurrency Audit Logging", () => {
    it("handles 50 parallel audit log writes without dropped logs or connection exhaustion", async () => {
      if (!probe.isAvailable) return;

      const auditBatch = Array.from({ length: 50 }).map((_, i) =>
        createAuditLog({
          userId: createdUserId,
          category: "mutation",
          action: `concurrency.test.${i}`,
          status: "success",
          details: { index: i, timestamp: Date.now() },
        })
      );

      await expect(Promise.all(auditBatch)).resolves.toBeDefined();

      const countResult = await db.execute(sql`
        SELECT count(*)::int as count FROM audit_log
        WHERE user_id = ${createdUserId} AND action LIKE 'concurrency.test.%';
      `);

      expect(countResult.rows[0].count).toBe(50);
    });
  });
});
