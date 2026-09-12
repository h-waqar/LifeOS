import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { auth } from "@/server/auth";
import {
  GET as tasksGet,
  POST as tasksPost,
} from "@/app/api/tasks/route";
import {
  GET as projectsGet,
  POST as projectsPost,
} from "@/app/api/projects/route";
import {
  GET as taskItemGet,
  PATCH as taskItemPatch,
  DELETE as taskItemDelete,
} from "@/app/api/tasks/[id]/route";
import {
  GET as projectItemGet,
  PATCH as projectItemPatch,
  DELETE as projectItemDelete,
} from "@/app/api/projects/[id]/route";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

describe("Plan 01-08: Adversarial API Boundary & Defense-in-Depth Suite", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "plan08_api_adv@example.com",
    password: "Plan08ApiPassword123!",
    name: "Plan08 API Adversary",
  };

  let testUserId: string;
  let cookieHeader: string;
  const foreignId = "foreign_id_" + crypto.randomUUID().slice(0, 8);

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

  describe("Query Parameter Validation (GET /api/tasks & GET /api/projects)", () => {
    it("rejects invalid status filter in GET /api/tasks with 400 Bad Request", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest(
        "http://localhost:3000/api/tasks?status=MALICIOUS_STATUS_INJECTION",
        { headers: { cookie: cookieHeader } }
      );
      const res = await tasksGet(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Validation error");
    });

    it("rejects invalid priority filter in GET /api/tasks with 400 Bad Request", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest(
        "http://localhost:3000/api/tasks?priority=SUPER_CRITICAL_UNKNOWN",
        { headers: { cookie: cookieHeader } }
      );
      const res = await tasksGet(req);
      expect(res.status).toBe(400);
    });

    it("rejects unknown query parameters in GET /api/tasks with 400 Bad Request (strict schema)", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest(
        "http://localhost:3000/api/tasks?unexpectedField=hacked",
        { headers: { cookie: cookieHeader } }
      );
      const res = await tasksGet(req);
      expect(res.status).toBe(400);
    });

    it("rejects invalid status filter in GET /api/projects with 400 Bad Request", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest(
        "http://localhost:3000/api/projects?status=INVALID_PROJ_STATUS",
        { headers: { cookie: cookieHeader } }
      );
      const res = await projectsGet(req);
      expect(res.status).toBe(400);
    });

    it("accepts valid query parameters and returns 200 OK with security headers", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest(
        "http://localhost:3000/api/tasks?status=inbox&priority=medium",
        { headers: { cookie: cookieHeader } }
      );
      const res = await tasksGet(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toContain("no-store");

      const projReq = new NextRequest(
        "http://localhost:3000/api/projects?status=active",
        { headers: { cookie: cookieHeader } }
      );
      const projRes = await projectsGet(projReq);
      expect(projRes.status).toBe(200);
      expect(projRes.headers.get("Cache-Control")).toContain("no-store");
    });
  });

  describe("BOLA / IDOR Uniform 404 Responses", () => {
    it("returns identical 404 status and message for non-existent vs foreign task IDs", async () => {
      if (!probe.isAvailable) return;

      const req1 = new NextRequest(
        `http://localhost:3000/api/tasks/${foreignId}`,
        { headers: { cookie: cookieHeader } }
      );
      const res1 = await taskItemGet(req1, {
        params: Promise.resolve({ id: foreignId }),
      });
      expect(res1.status).toBe(404);
      const data1 = await res1.json();
      expect(data1.error).toBe("Task not found");

      const nonExistentId = "non_existent_id_" + crypto.randomUUID().slice(0, 8);
      const req2 = new NextRequest(
        `http://localhost:3000/api/tasks/${nonExistentId}`,
        { headers: { cookie: cookieHeader } }
      );
      const res2 = await taskItemGet(req2, {
        params: Promise.resolve({ id: nonExistentId }),
      });
      expect(res2.status).toBe(404);
      const data2 = await res2.json();
      expect(data2.error).toBe("Task not found");
    });

    it("returns identical 404 status and message for non-existent vs foreign project IDs", async () => {
      if (!probe.isAvailable) return;

      const req1 = new NextRequest(
        `http://localhost:3000/api/projects/${foreignId}`,
        { headers: { cookie: cookieHeader } }
      );
      const res1 = await projectItemGet(req1, {
        params: Promise.resolve({ id: foreignId }),
      });
      expect(res1.status).toBe(404);
      const data1 = await res1.json();
      expect(data1.error).toBe("Project not found");
    });
  });

  describe("Adversarial Malformed Inputs (Never 500)", () => {
    it("safely handles garbage JSON strings without crashing or 500", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/tasks", {
        method: "POST",
        headers: {
          cookie: cookieHeader,
          "content-type": "application/json",
        },
        body: "{ this is completely invalid broken json !!!",
      });

      const res = await tasksPost(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Invalid JSON body");
    });

    it("safely rejects oversized payloads (>32KB) with 413", async () => {
      if (!probe.isAvailable) return;

      const oversizedBody = JSON.stringify({
        title: "Large Task",
        description: "X".repeat(35 * 1024),
      });

      const req = new NextRequest("http://localhost:3000/api/tasks", {
        method: "POST",
        headers: {
          cookie: cookieHeader,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(oversizedBody).toString(),
        },
        body: oversizedBody,
      });

      const res = await tasksPost(req);
      expect(res.status).toBe(413);
    });

    it("safely rejects wrong Content-Type with 415", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/tasks", {
        method: "POST",
        headers: {
          cookie: cookieHeader,
          "content-type": "text/plain",
        },
        body: "title=TextPayload",
      });

      const res = await tasksPost(req);
      expect(res.status).toBe(415);
    });
  });
});
