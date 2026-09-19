import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { auth } from "@/server/auth";
import { POST as quickCapturePost } from "@/app/api/tasks/quick-capture/route";
import { GET as tasksGet } from "@/app/api/tasks/route";
import { createProject } from "@/server/projects/service";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

describe("Plan 02-01: Quick Capture & Enhanced Tasks API (Integration Suite)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p02_qc_api@example.com",
    password: "Plan02QcPassword123!",
    name: "Quick Capture API Tester",
  };

  let testUserId: string;
  let cookieHeader: string;

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    await db.delete(user);

    const res = await auth.api.signUpEmail({
      body: testUser,
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

  describe("POST /api/tasks/quick-capture", () => {
    it("creates task from raw string with full token syntax", async () => {
      if (!probe.isAvailable) return;

      const project = await createProject(testUserId, {
        name: "Infrastructure",
      });

      const req = new NextRequest(
        "http://localhost:3000/api/tasks/quick-capture",
        {
          method: "POST",
          headers: {
            cookie: cookieHeader,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            raw: "Deploy production docker containers !critical ^tomorrow @high #Infrastructure ~45m +devops +infra",
          }),
        }
      );

      const res = await quickCapturePost(req);
      expect(res.status).toBe(201);
      const data = await res.json();

      expect(data.task).toBeDefined();
      expect(data.task.title).toBe("Deploy production docker containers");
      expect(data.task.priority).toBe("critical");
      expect(data.task.energyLevel).toBe("high");
      expect(data.task.projectId).toBe(project.id);
      expect(data.task.estimatedDuration).toBe(45);
      expect(data.task.tags).toContain("devops");
      expect(data.task.tags).toContain("infra");
      expect(data.task.dueDate).toBeTruthy();
      expect(data.task.priorityScore).toBe(135);
    });

    it("honors overrideProjectId when specified", async () => {
      if (!probe.isAvailable) return;

      const projectExplicit = await createProject(testUserId, {
        name: "ExplicitProject",
      });

      const req = new NextRequest(
        "http://localhost:3000/api/tasks/quick-capture",
        {
          method: "POST",
          headers: {
            cookie: cookieHeader,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            raw: "Task with override project !low",
            overrideProjectId: projectExplicit.id,
          }),
        }
      );

      const res = await quickCapturePost(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.task.projectId).toBe(projectExplicit.id);
    });

    it("rejects unauthenticated requests with 401", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest(
        "http://localhost:3000/api/tasks/quick-capture",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ raw: "Unauthorized task" }),
        }
      );

      const res = await quickCapturePost(req);
      expect(res.status).toBe(401);
    });

    it("rejects non-json content-type with 415", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest(
        "http://localhost:3000/api/tasks/quick-capture",
        {
          method: "POST",
          headers: {
            cookie: cookieHeader,
            "content-type": "text/plain",
          },
          body: "raw text",
        }
      );

      const res = await quickCapturePost(req);
      expect(res.status).toBe(415);
    });

    it("rejects empty raw input with 400", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest(
        "http://localhost:3000/api/tasks/quick-capture",
        {
          method: "POST",
          headers: {
            cookie: cookieHeader,
            "content-type": "application/json",
          },
          body: JSON.stringify({ raw: "   " }),
        }
      );

      const res = await quickCapturePost(req);
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/tasks with Phase 2 Filters and Sorting", () => {
    it("returns sorted tasks by priority_score via API route", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest(
        "http://localhost:3000/api/tasks?sortBy=priority_score&sortDir=desc",
        {
          method: "GET",
          headers: { cookie: cookieHeader },
        }
      );

      const res = await tasksGet(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(Array.isArray(data.tasks)).toBe(true);
      if (data.tasks.length >= 2) {
        expect(data.tasks[0].priorityScore).toBeGreaterThanOrEqual(
          data.tasks[1].priorityScore
        );
      }
    });

    it("filters tasks by energyLevel via API route", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest(
        "http://localhost:3000/api/tasks?energyLevel=high",
        {
          method: "GET",
          headers: { cookie: cookieHeader },
        }
      );

      const res = await tasksGet(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(Array.isArray(data.tasks)).toBe(true);
      for (const t of data.tasks) {
        expect(t.energyLevel).toBe("high");
      }
    });
  });
});
