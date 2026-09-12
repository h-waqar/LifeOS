import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { auditLog } from "@/server/db/schema/audit";
import { projects } from "@/server/db/schema/projects";
import { tasks } from "@/server/db/schema/tasks";
import { eq, desc } from "drizzle-orm";
import { spawn, type ChildProcess } from "node:child_process";

const BASE_URL = process.env.LIVE_HTTP_URL || "http://localhost:3000";

describe("Plan 01-09: Live Production HTTP API Verification Suite", () => {
  let probe: ProbeResult;
  let serverProcess: ChildProcess | null = null;

  const testUser = {
    email: "plan09_http_audit@example.com",
    password: "SecureLivePassword123!",
    name: "Live HTTP Audit User",
  };

  let sessionCookie: string;
  let createdUserId: string;

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    // Check if server is already running on BASE_URL
    let serverRunning = false;
    try {
      const res = await fetch(`${BASE_URL}/api/preferences`, { signal: AbortSignal.timeout(1500) });
      if (res.status === 401 || res.status === 200) {
        serverRunning = true;
      }
    } catch {
      serverRunning = false;
    }

    if (!serverRunning) {
      console.log(`[live-http] Starting Next.js server on ${BASE_URL}...`);
      serverProcess = spawn("npx", ["next", "start", "-p", "3000"], {
        stdio: "ignore",
        detached: true,
      });

      // Poll until server is responding
      const startTime = Date.now();
      while (Date.now() - startTime < 15000) {
        try {
          const res = await fetch(`${BASE_URL}/api/preferences`, { signal: AbortSignal.timeout(1000) });
          if (res.status === 401) {
            serverRunning = true;
            break;
          }
        } catch {
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      if (!serverRunning) {
        throw new Error("Failed to connect to running Next.js server at " + BASE_URL);
      }
    }

    // Clean database to start with pristine state
    await db.delete(user);

    // Register user via live HTTP endpoint
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
    expect(setCookie).toBeTruthy();

    const match = setCookie!.match(/better-auth\.session_token=([^;]+)/);
    expect(match).toBeTruthy();
    sessionCookie = `better-auth.session_token=${match![1]}`;

    const [dbUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testUser.email));
    expect(dbUser).toBeDefined();
    createdUserId = dbUser.id;
  }, 35000);

  afterAll(async () => {
    if (serverProcess && serverProcess.pid) {
      try {
        process.kill(-serverProcess.pid);
      } catch {}
    }
    if (probe?.isAvailable) {
      await db.delete(user);
      await closeDatabase();
    }
  });

  describe("Authentication & Session Verification Over HTTP", () => {
    it("rejects unauthenticated GET /api/preferences with 401 and security headers", async () => {
      if (!probe.isAvailable) return;
      const res = await fetch(`${BASE_URL}/api/preferences`);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("Authentication required");
      expect(res.headers.get("cache-control")).toContain("no-store");
      expect(res.headers.get("x-frame-options")).toBe("DENY");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    });

    it("rejects unauthenticated GET /api/projects with 401", async () => {
      if (!probe.isAvailable) return;
      const res = await fetch(`${BASE_URL}/api/projects`);
      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated GET /api/tasks with 401", async () => {
      if (!probe.isAvailable) return;
      const res = await fetch(`${BASE_URL}/api/tasks`);
      expect(res.status).toBe(401);
    });

    it("rejects forged session token with 401 Unauthorized", async () => {
      if (!probe.isAvailable) return;
      const res = await fetch(`${BASE_URL}/api/tasks`, {
        headers: { Cookie: "better-auth.session_token=forged_token_evil_payload" },
      });
      expect(res.status).toBe(401);
    });

    it("enforces single-user registration lock (Decision D-01) with 403 Forbidden over HTTP", async () => {
      if (!probe.isAvailable) return;
      const res = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: BASE_URL,
        },
        body: JSON.stringify({
          email: "second_user@example.com",
          password: "SecondPassword123!",
          name: "Second User Adversary",
        }),
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.message).toContain("Registration is closed");
    });

    it("accepts valid session cookie and returns user preferences", async () => {
      if (!probe.isAvailable) return;
      const res = await fetch(`${BASE_URL}/api/preferences`, {
        headers: { Cookie: sessionCookie },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.preferences).toBeDefined();
      expect(data.preferences.userId).toBe(createdUserId);
      expect(data.preferences.theme).toBe("dark");
    });
  });

  describe("BOLA / IDOR Scenarios Over Real HTTP", () => {
    const foreignId = "00000000-0000-0000-0000-000000000000";

    it("returns uniform 404 for non-existent or foreign project ID on GET", async () => {
      if (!probe.isAvailable) return;
      const res = await fetch(`${BASE_URL}/api/projects/${foreignId}`, {
        headers: { Cookie: sessionCookie },
      });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("Project not found");
    });

    it("returns uniform 404 for non-existent or foreign project ID on PATCH", async () => {
      if (!probe.isAvailable) return;
      const res = await fetch(`${BASE_URL}/api/projects/${foreignId}`, {
        method: "PATCH",
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Hacked Project" }),
      });
      expect(res.status).toBe(404);
    });

    it("returns uniform 404 for non-existent or foreign project ID on DELETE", async () => {
      if (!probe.isAvailable) return;
      const res = await fetch(`${BASE_URL}/api/projects/${foreignId}`, {
        method: "DELETE",
        headers: { Cookie: sessionCookie },
      });
      expect(res.status).toBe(404);
    });

    it("returns uniform 404 for non-existent or foreign task ID on GET", async () => {
      if (!probe.isAvailable) return;
      const res = await fetch(`${BASE_URL}/api/tasks/${foreignId}`, {
        headers: { Cookie: sessionCookie },
      });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("Task not found");
    });

    it("returns uniform 404 for non-existent or foreign task ID on PATCH", async () => {
      if (!probe.isAvailable) return;
      const res = await fetch(`${BASE_URL}/api/tasks/${foreignId}`, {
        method: "PATCH",
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Hacked Task" }),
      });
      expect(res.status).toBe(404);
    });

    it("returns uniform 404 for non-existent or foreign task ID on DELETE", async () => {
      if (!probe.isAvailable) return;
      const res = await fetch(`${BASE_URL}/api/tasks/${foreignId}`, {
        method: "DELETE",
        headers: { Cookie: sessionCookie },
      });
      expect(res.status).toBe(404);
    });

    it("rejects task creation linked to foreign project with 404 Not Found", async () => {
      if (!probe.isAvailable) return;
      const res = await fetch(`${BASE_URL}/api/tasks`, {
        method: "POST",
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Cross Project Task",
          projectId: foreignId,
        }),
      });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain("Project not found");
    });

    it("rejects task creation linked to foreign parent task with 404 Not Found", async () => {
      if (!probe.isAvailable) return;
      const res = await fetch(`${BASE_URL}/api/tasks`, {
        method: "POST",
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Cross Parent Subtask",
          parentTaskId: foreignId,
        }),
      });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain("Parent task not found");
    });
  });

  describe("Input Validation & Strict Schema Enforcement Over HTTP", () => {
    it("rejects malformed JSON payload with 400 Bad Request", async () => {
      if (!probe.isAvailable) return;
      const res = await fetch(`${BASE_URL}/api/tasks`, {
        method: "POST",
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        body: "{ bad json payload",
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Invalid JSON body");
    });

    it("rejects unsupported media type (text/plain) with 415", async () => {
      if (!probe.isAvailable) return;
      const res = await fetch(`${BASE_URL}/api/tasks`, {
        method: "POST",
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "text/plain",
        },
        body: "title=TextPayload",
      });
      expect(res.status).toBe(415);
    });

    it("rejects oversized request payload (>32KB) with 413 Payload Too Large", async () => {
      if (!probe.isAvailable) return;
      const oversizedPayload = JSON.stringify({
        title: "Large Task",
        description: "A".repeat(35 * 1024),
      });

      const res = await fetch(`${BASE_URL}/api/tasks`, {
        method: "POST",
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(oversizedPayload).toString(),
        },
        body: oversizedPayload,
      });
      expect(res.status).toBe(413);
    });

    it("rejects mass-assignment of userId in body with 400 Bad Request", async () => {
      if (!probe.isAvailable) return;
      const res = await fetch(`${BASE_URL}/api/tasks`, {
        method: "POST",
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Spoofed Task",
          userId: "injected_user_id",
        }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(JSON.stringify(data)).toContain("Client cannot specify userId");
    });

    it("rejects unrecognized properties (prototype pollution / strict schema) with 400", async () => {
      if (!probe.isAvailable) return;
      const res = await fetch(`${BASE_URL}/api/tasks`, {
        method: "POST",
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Safe Task",
          unknownAttribute: "polluted",
        }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(JSON.stringify(data)).toContain("Unrecognized key");
    });

    it("rejects empty or whitespace-only title with 400 Bad Request", async () => {
      if (!probe.isAvailable) return;
      const res = await fetch(`${BASE_URL}/api/tasks`, {
        method: "POST",
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "     " }),
      });
      expect(res.status).toBe(400);
    });

    it("rejects invalid query parameter values with 400 Bad Request", async () => {
      if (!probe.isAvailable) return;
      const res = await fetch(`${BASE_URL}/api/tasks?status=MALICIOUS_STATUS`, {
        headers: { Cookie: sessionCookie },
      });
      expect(res.status).toBe(400);
    });

    it("rejects unexpected query parameters (strict schema) with 400 Bad Request", async () => {
      if (!probe.isAvailable) return;
      const res = await fetch(`${BASE_URL}/api/tasks?evilParam=injection`, {
        headers: { Cookie: sessionCookie },
      });
      expect(res.status).toBe(400);
    });
  });

  describe("Task Hierarchy, Cycles, & Reparenting Over Real HTTP", () => {
    let projectId: string;
    let rootTaskId: string;
    let subtaskId: string;
    let leafTaskId: string;

    it("creates project and root task via live HTTP POST", async () => {
      if (!probe.isAvailable) return;

      const projRes = await fetch(`${BASE_URL}/api/projects`, {
        method: "POST",
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Audit Project",
          description: "Project for hierarchy audit",
          status: "active",
          priority: "high",
        }),
      });
      expect(projRes.status).toBe(201);
      const projData = await projRes.json();
      projectId = projData.project.id;

      const taskRes = await fetch(`${BASE_URL}/api/tasks`, {
        method: "POST",
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Audit Root Task",
          projectId,
          status: "todo",
          priority: "high",
        }),
      });
      expect(taskRes.status).toBe(201);
      const taskData = await taskRes.json();
      rootTaskId = taskData.task.id;
      expect(taskData.task.parentTaskId).toBeNull();
      expect(taskData.task.projectId).toBe(projectId);
    });

    it("creates nested subtask and leaf task (multi-level hierarchy) via HTTP POST", async () => {
      if (!probe.isAvailable) return;

      const subtaskRes = await fetch(`${BASE_URL}/api/tasks`, {
        method: "POST",
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Audit Subtask 1",
          projectId,
          parentTaskId: rootTaskId,
          status: "todo",
        }),
      });
      expect(subtaskRes.status).toBe(201);
      const subtaskData = await subtaskRes.json();
      subtaskId = subtaskData.task.id;
      expect(subtaskData.task.parentTaskId).toBe(rootTaskId);

      const leafRes = await fetch(`${BASE_URL}/api/tasks`, {
        method: "POST",
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Audit Leaf Task 1.1",
          parentTaskId: subtaskId,
        }),
      });
      expect(leafRes.status).toBe(201);
      const leafData = await leafRes.json();
      leafTaskId = leafData.task.id;
      // Should inherit parent's projectId
      expect(leafData.task.projectId).toBe(projectId);
      expect(leafData.task.parentTaskId).toBe(subtaskId);
    });

    it("rejects direct self-parenting attempt with 400 Bad Request", async () => {
      if (!probe.isAvailable) return;
      const res = await fetch(`${BASE_URL}/api/tasks/${rootTaskId}`, {
        method: "PATCH",
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ parentTaskId: rootTaskId }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("cannot be its own parent");
    });

    it("rejects circular reparenting to descendant with 400 Bad Request", async () => {
      if (!probe.isAvailable) return;
      // Attempt to make rootTaskId a child of its grandchild leafTaskId
      const res = await fetch(`${BASE_URL}/api/tasks/${rootTaskId}`, {
        method: "PATCH",
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ parentTaskId: leafTaskId }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("cycle detected");
    });

    it("updates task to completed and automatically sets completedAt timestamp", async () => {
      if (!probe.isAvailable) return;
      const res = await fetch(`${BASE_URL}/api/tasks/${leafTaskId}`, {
        method: "PATCH",
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "completed" }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.task.status).toBe("completed");
      expect(data.task.completedAt).toBeTruthy();
      expect(new Date(data.task.completedAt).getTime()).toBeGreaterThan(0);
    });

    it("reopens completed task and automatically resets completedAt to null", async () => {
      if (!probe.isAvailable) return;
      const res = await fetch(`${BASE_URL}/api/tasks/${leafTaskId}`, {
        method: "PATCH",
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "in_progress" }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.task.status).toBe("in_progress");
      expect(data.task.completedAt).toBeNull();
    });

    it("cascades deletion of child tasks when root task is deleted", async () => {
      if (!probe.isAvailable) return;
      const delRes = await fetch(`${BASE_URL}/api/tasks/${rootTaskId}`, {
        method: "DELETE",
        headers: { Cookie: sessionCookie },
      });
      expect(delRes.status).toBe(200);

      // Verify subtask and leaf task are deleted via cascade
      const checkSubtask = await fetch(`${BASE_URL}/api/tasks/${subtaskId}`, {
        headers: { Cookie: sessionCookie },
      });
      expect(checkSubtask.status).toBe(404);

      const checkLeaf = await fetch(`${BASE_URL}/api/tasks/${leafTaskId}`, {
        headers: { Cookie: sessionCookie },
      });
      expect(checkLeaf.status).toBe(404);
    });

    it("nullifies task projectId when parent project is deleted", async () => {
      if (!probe.isAvailable) return;
      // Create independent task in project
      const taskRes = await fetch(`${BASE_URL}/api/tasks`, {
        method: "POST",
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Task in project to be deleted",
          projectId,
        }),
      });
      const taskData = await taskRes.json();
      const preservedTaskId = taskData.task.id;

      // Delete project
      const delProjRes = await fetch(`${BASE_URL}/api/projects/${projectId}`, {
        method: "DELETE",
        headers: { Cookie: sessionCookie },
      });
      expect(delProjRes.status).toBe(200);

      // Task must still exist with projectId = null
      const checkTask = await fetch(`${BASE_URL}/api/tasks/${preservedTaskId}`, {
        headers: { Cookie: sessionCookie },
      });
      expect(checkTask.status).toBe(200);
      const checkData = await checkTask.json();
      expect(checkData.task.projectId).toBeNull();
    });
  });

  describe("Audit Log Immutability & Transactional Commit Over HTTP", () => {
    it("recorded audit logs in PostgreSQL for all successful HTTP mutations", async () => {
      if (!probe.isAvailable) return;
      const logs = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.userId, createdUserId))
        .orderBy(desc(auditLog.createdAt));

      expect(logs.length).toBeGreaterThanOrEqual(4);
      const actions = logs.map((l) => l.action);
      expect(actions).toContain("project.create");
      expect(actions).toContain("task.create");
      expect(actions).toContain("task.update");
      expect(actions).toContain("task.delete");
    });
  });

  describe("Sign-Out Lifecycle Over Real HTTP", () => {
    it("revokes session via POST /api/auth/sign-out and sets Max-Age=0", async () => {
      if (!probe.isAvailable) return;
      const res = await fetch(`${BASE_URL}/api/auth/sign-out`, {
        method: "POST",
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
          Origin: BASE_URL,
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).toContain("Max-Age=0");
    });

    it("rejects subsequent requests with the revoked session token", async () => {
      if (!probe.isAvailable) return;
      const res = await fetch(`${BASE_URL}/api/preferences`, {
        headers: { Cookie: sessionCookie },
      });
      expect(res.status).toBe(401);
    });
  });
});
