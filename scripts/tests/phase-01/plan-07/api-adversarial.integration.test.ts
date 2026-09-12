import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user, session } from "@/server/db/schema/auth";
import { projects } from "@/server/db/schema/projects";
import { tasks } from "@/server/db/schema/tasks";
import { auditLog } from "@/server/db/schema/audit";
import { auth } from "@/server/auth";
import {
  GET as projectsGet,
  POST as projectsPost,
} from "@/app/api/projects/route";
import {
  GET as projectItemGet,
  PATCH as projectItemPatch,
  DELETE as projectItemDelete,
} from "@/app/api/projects/[id]/route";
import {
  GET as tasksGet,
  POST as tasksPost,
} from "@/app/api/tasks/route";
import {
  GET as taskItemGet,
  PATCH as taskItemPatch,
  DELETE as taskItemDelete,
} from "@/app/api/tasks/[id]/route";
import { makeSignature } from "better-auth/crypto";
import { env } from "@/lib/env";
import { eq, desc } from "drizzle-orm";
import { NextRequest } from "next/server";

describe("Plan 01-07: Adversarial API Boundary & Data-Access Integration Suite", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "plan07_adversary@example.com",
    password: "Plan07Password123!",
    name: "Plan07 Adversary User",
  };

  let testUserId: string;
  let testSessionToken: string;
  let cookieHeader: string;

  const foreignId = "foreign_id_" + crypto.randomUUID().slice(0, 8);

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    // Clean any prior state
    await db.delete(user).where(eq(user.email, testUser.email));

    // Sign up authenticated test user
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
    const signedCookieValue = match![1];
    testSessionToken = signedCookieValue.split(".")[0];
    cookieHeader = `better-auth.session_token=${signedCookieValue}`;

    const userRows = await db
      .select()
      .from(user)
      .where(eq(user.email, testUser.email));
    expect(userRows.length).toBe(1);
    testUserId = userRows[0].id;
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await db.delete(user).where(eq(user.email, testUser.email));
      await closeDatabase();
    }
  });

  describe("Authentication Boundary & Session Security", () => {
    it("rejects unauthenticated GET /api/projects with 401 Unauthorized", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/projects", {
        method: "GET",
      });
      const res = await projectsGet(req);
      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated POST /api/projects with 401 Unauthorized", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Unauthenticated Project" }),
      });
      const res = await projectsPost(req);
      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated GET /api/tasks with 401 Unauthorized", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/tasks", {
        method: "GET",
      });
      const res = await tasksGet(req);
      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated POST /api/tasks with 401 Unauthorized", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Unauthenticated Task" }),
      });
      const res = await tasksPost(req);
      expect(res.status).toBe(401);
    });

    it("rejects expired session with 401 Unauthorized", async () => {
      if (!probe.isAvailable) return;

      const expiredToken = "expired_" + crypto.randomUUID().replace(/-/g, "");
      const expiredDate = new Date(Date.now() - 3600 * 1000);

      await db.insert(session).values({
        id: crypto.randomUUID(),
        userId: testUserId,
        token: expiredToken,
        expiresAt: expiredDate,
      });

      const sig = await makeSignature(expiredToken, env.BETTER_AUTH_SECRET);
      const expiredCookie = `better-auth.session_token=${expiredToken}.${sig}`;

      const req = new NextRequest("http://localhost:3000/api/projects", {
        method: "GET",
        headers: { cookie: expiredCookie },
      });
      const res = await projectsGet(req);
      expect(res.status).toBe(401);

      await db.delete(session).where(eq(session.token, expiredToken));
    });
  });

  describe("Cache-Control Headers & Dynamic Execution", () => {
    it("enforces private, no-store Cache-Control headers on /api/projects", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/projects", {
        method: "GET",
        headers: { cookie: cookieHeader },
      });
      const res = await projectsGet(req);
      expect(res.status).toBe(200);

      const cc = res.headers.get("cache-control");
      expect(cc).toContain("private");
      expect(cc).toContain("no-store");
      expect(cc).toContain("no-cache");
      expect(res.headers.get("pragma")).toBe("no-cache");
    });

    it("enforces private, no-store Cache-Control headers on /api/tasks", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/tasks", {
        method: "GET",
        headers: { cookie: cookieHeader },
      });
      const res = await tasksGet(req);
      expect(res.status).toBe(200);

      const cc = res.headers.get("cache-control");
      expect(cc).toContain("private");
      expect(cc).toContain("no-store");
      expect(cc).toContain("no-cache");
      expect(res.headers.get("pragma")).toBe("no-cache");
    });
  });

  describe("Content-Type & Payload Size Boundaries (DoS Defenses)", () => {
    it("rejects POST /api/projects with non-JSON Content-Type (415 Unsupported Media Type)", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/projects", {
        method: "POST",
        headers: {
          cookie: cookieHeader,
          "content-type": "text/plain",
        },
        body: "name=Project",
      });
      const res = await projectsPost(req);
      expect(res.status).toBe(415);
    });

    it("rejects POST /api/tasks with non-JSON Content-Type (415 Unsupported Media Type)", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/tasks", {
        method: "POST",
        headers: {
          cookie: cookieHeader,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "title=Task",
      });
      const res = await tasksPost(req);
      expect(res.status).toBe(415);
    });

    it("rejects POST /api/projects exceeding 32KB payload limit (413 Payload Too Large)", async () => {
      if (!probe.isAvailable) return;

      const oversizedBody = JSON.stringify({
        name: "Oversized",
        description: "x".repeat(33 * 1024),
      });

      const req = new NextRequest("http://localhost:3000/api/projects", {
        method: "POST",
        headers: {
          cookie: cookieHeader,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(oversizedBody).toString(),
        },
        body: oversizedBody,
      });

      const res = await projectsPost(req);
      expect(res.status).toBe(413);
    });

    it("rejects malformed JSON payload on POST /api/tasks with 400 Bad Request", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/tasks", {
        method: "POST",
        headers: {
          cookie: cookieHeader,
          "content-type": "application/json",
        },
        body: "{ malformed json: true, ",
      });

      const res = await tasksPost(req);
      expect(res.status).toBe(400);
    });
  });

  describe("Ownership Forgery, Mass Assignment & Schema Injection", () => {
    it("rejects client-forged userId in POST /api/projects (400 Bad Request)", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/projects", {
        method: "POST",
        headers: {
          cookie: cookieHeader,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Forged User Project",
          userId: "victim_user_123",
        }),
      });

      const res = await projectsPost(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Validation error");
    });

    it("rejects client-supplied id in POST /api/tasks (400 Bad Request)", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/tasks", {
        method: "POST",
        headers: {
          cookie: cookieHeader,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "Forged ID Task",
          id: "custom_injected_task_id",
        }),
      });

      const res = await tasksPost(req);
      expect(res.status).toBe(400);
    });

    it("rejects unknown properties in PATCH /api/projects/[id] (400 Bad Request)", async () => {
      if (!probe.isAvailable) return;

      // Create a valid project first
      const createReq = new NextRequest("http://localhost:3000/api/projects", {
        method: "POST",
        headers: {
          cookie: cookieHeader,
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "Base Project" }),
      });
      const createRes = await projectsPost(createReq);
      expect(createRes.status).toBe(201);
      const { project } = await createRes.json();

      const patchReq = new NextRequest(
        `http://localhost:3000/api/projects/${project.id}`,
        {
          method: "PATCH",
          headers: {
            cookie: cookieHeader,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            name: "Updated Name",
            isAdmin: true, // Unknown field
          }),
        }
      );

      const patchRes = await projectItemPatch(patchReq, {
        params: Promise.resolve({ id: project.id }),
      });
      expect(patchRes.status).toBe(400);

      // Cleanup
      await projectItemDelete(
        new NextRequest(`http://localhost:3000/api/projects/${project.id}`, {
          method: "DELETE",
          headers: { cookie: cookieHeader },
        }),
        { params: Promise.resolve({ id: project.id }) }
      );
    });
  });

  describe("Cross-User Isolation & BOLA/IDOR Defenses", () => {
    it("returns 404 when reading a non-existent or foreign project (GET /api/projects/[id])", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest(
        `http://localhost:3000/api/projects/${foreignId}`,
        {
          method: "GET",
          headers: { cookie: cookieHeader },
        }
      );

      const res = await projectItemGet(req, {
        params: Promise.resolve({ id: foreignId }),
      });
      expect(res.status).toBe(404);
    });

    it("returns 404 when updating a non-existent or foreign project (PATCH /api/projects/[id])", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest(
        `http://localhost:3000/api/projects/${foreignId}`,
        {
          method: "PATCH",
          headers: {
            cookie: cookieHeader,
            "content-type": "application/json",
          },
          body: JSON.stringify({ name: "Attempted Hack" }),
        }
      );

      const res = await projectItemPatch(req, {
        params: Promise.resolve({ id: foreignId }),
      });
      expect(res.status).toBe(404);
    });

    it("returns 404 when deleting a non-existent or foreign project (DELETE /api/projects/[id])", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest(
        `http://localhost:3000/api/projects/${foreignId}`,
        {
          method: "DELETE",
          headers: { cookie: cookieHeader },
        }
      );

      const res = await projectItemDelete(req, {
        params: Promise.resolve({ id: foreignId }),
      });
      expect(res.status).toBe(404);
    });

    it("returns 404 when reading a non-existent or foreign task (GET /api/tasks/[id])", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest(
        `http://localhost:3000/api/tasks/${foreignId}`,
        {
          method: "GET",
          headers: { cookie: cookieHeader },
        }
      );

      const res = await taskItemGet(req, {
        params: Promise.resolve({ id: foreignId }),
      });
      expect(res.status).toBe(404);
    });

    it("returns 404 when associating a task with a foreign or non-existent projectId", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/tasks", {
        method: "POST",
        headers: {
          cookie: cookieHeader,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "Orphan Link Attempt",
          projectId: foreignId,
        }),
      });

      const res = await tasksPost(req);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("Project not found.");
    });
  });

  describe("State Transitions & Invariants (Task Lifecycle)", () => {
    it("automatically assigns completedAt timestamp when task status transitions to completed", async () => {
      if (!probe.isAvailable) return;

      // Create task in inbox
      const createReq = new NextRequest("http://localhost:3000/api/tasks", {
        method: "POST",
        headers: {
          cookie: cookieHeader,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "Complete Me Task",
          status: "inbox",
        }),
      });

      const createRes = await tasksPost(createReq);
      expect(createRes.status).toBe(201);
      const { task } = await createRes.json();
      expect(task.completedAt).toBeNull();

      // Transition to completed
      const patchReq = new NextRequest(
        `http://localhost:3000/api/tasks/${task.id}`,
        {
          method: "PATCH",
          headers: {
            cookie: cookieHeader,
            "content-type": "application/json",
          },
          body: JSON.stringify({ status: "completed" }),
        }
      );

      const patchRes = await taskItemPatch(patchReq, {
        params: Promise.resolve({ id: task.id }),
      });
      expect(patchRes.status).toBe(200);
      const { task: completedTask } = await patchRes.json();
      expect(completedTask.status).toBe("completed");
      expect(completedTask.completedAt).not.toBeNull();
      expect(typeof completedTask.completedAt).toBe("string");

      // Transition back to in_progress clears completedAt
      const uncompleteReq = new NextRequest(
        `http://localhost:3000/api/tasks/${task.id}`,
        {
          method: "PATCH",
          headers: {
            cookie: cookieHeader,
            "content-type": "application/json",
          },
          body: JSON.stringify({ status: "in_progress" }),
        }
      );

      const uncompleteRes = await taskItemPatch(uncompleteReq, {
        params: Promise.resolve({ id: task.id }),
      });
      expect(uncompleteRes.status).toBe(200);
      const { task: uncompletedTask } = await uncompleteRes.json();
      expect(uncompletedTask.status).toBe("in_progress");
      expect(uncompletedTask.completedAt).toBeNull();

      // Cleanup
      await taskItemDelete(
        new NextRequest(`http://localhost:3000/api/tasks/${task.id}`, {
          method: "DELETE",
          headers: { cookie: cookieHeader },
        }),
        { params: Promise.resolve({ id: task.id }) }
      );
    });

    it("rejects making a task its own parent (400 Bad Request)", async () => {
      if (!probe.isAvailable) return;

      const createReq = new NextRequest("http://localhost:3000/api/tasks", {
        method: "POST",
        headers: {
          cookie: cookieHeader,
          "content-type": "application/json",
        },
        body: JSON.stringify({ title: "Self Parent Test" }),
      });

      const createRes = await tasksPost(createReq);
      const { task } = await createRes.json();

      const patchReq = new NextRequest(
        `http://localhost:3000/api/tasks/${task.id}`,
        {
          method: "PATCH",
          headers: {
            cookie: cookieHeader,
            "content-type": "application/json",
          },
          body: JSON.stringify({ parentTaskId: task.id }),
        }
      );

      const patchRes = await taskItemPatch(patchReq, {
        params: Promise.resolve({ id: task.id }),
      });
      expect(patchRes.status).toBe(400);
      const data = await patchRes.json();
      expect(data.error).toBe("A task cannot be its own parent.");

      // Cleanup
      await taskItemDelete(
        new NextRequest(`http://localhost:3000/api/tasks/${task.id}`, {
          method: "DELETE",
          headers: { cookie: cookieHeader },
        }),
        { params: Promise.resolve({ id: task.id }) }
      );
    });
  });

  describe("Audit Log Invariant Verification", () => {
    it("generates immutable audit log records for project and task mutations", async () => {
      if (!probe.isAvailable) return;

      // 1. Create project
      const projReq = new NextRequest("http://localhost:3000/api/projects", {
        method: "POST",
        headers: {
          cookie: cookieHeader,
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "Audit Verified Project" }),
      });
      const projRes = await projectsPost(projReq);
      const { project } = await projRes.json();

      // 2. Create task
      const taskReq = new NextRequest("http://localhost:3000/api/tasks", {
        method: "POST",
        headers: {
          cookie: cookieHeader,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "Audit Verified Task",
          projectId: project.id,
        }),
      });
      const taskRes = await tasksPost(taskReq);
      const { task } = await taskRes.json();

      // 3. Verify audit log has entries
      const logs = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.userId, testUserId))
        .orderBy(desc(auditLog.createdAt))
        .limit(5);

      const actions = logs.map((l) => l.action);
      expect(actions).toContain("project.create");
      expect(actions).toContain("task.create");

      // Verify log entry fields
      const taskLog = logs.find((l) => l.action === "task.create");
      expect(taskLog).toBeDefined();
      expect(taskLog!.category).toBe("mutation");
      expect(taskLog!.status).toBe("success");

      // Cleanup
      await taskItemDelete(
        new NextRequest(`http://localhost:3000/api/tasks/${task.id}`, {
          method: "DELETE",
          headers: { cookie: cookieHeader },
        }),
        { params: Promise.resolve({ id: task.id }) }
      );
      await projectItemDelete(
        new NextRequest(`http://localhost:3000/api/projects/${project.id}`, {
          method: "DELETE",
          headers: { cookie: cookieHeader },
        }),
        { params: Promise.resolve({ id: project.id }) }
      );
    });
  });
});
