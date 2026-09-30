// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user, automations, automationRuns } from "@/server/db/schema";
import { auth } from "@/server/auth";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import {
  GET as automationsGet,
  POST as automationsPost,
} from "@/app/api/automations/route";
import {
  GET as automationDetailGet,
  PATCH as automationDetailPatch,
  DELETE as automationDetailDelete,
} from "@/app/api/automations/[id]/route";
import {
  PATCH as togglePatch,
  POST as togglePost,
} from "@/app/api/automations/[id]/toggle/route";
import { GET as runsGet } from "@/app/api/automations/[id]/runs/route";
import { POST as testPost } from "@/app/api/automations/test/route";
import { clearAllAutomations } from "@/server/automations/service";

describe("Plan 07-03: Automations REST API Endpoints (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p07_automations_api@example.com",
    password: "Plan07ApiPassword123!",
    name: "Automations API Tester",
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
    const match = res.headers.get("set-cookie")!.match(/better-auth\.session_token=([^;]+)/);
    cookieHeader = `better-auth.session_token=${match![1]}`;

    const [dbUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testUser.email));
    testUserId = dbUser.id;
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await db.delete(user);
      await closeDatabase();
    }
  });

  beforeEach(async () => {
    if (!probe?.isAvailable) return;
    await clearAllAutomations(testUserId);
  });

  describe("Authentication Guard (401 Unauthorized)", () => {
    it("rejects unauthenticated requests to /api/automations with 401", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/automations");
      const res = await automationsGet(req);
      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated requests to /api/automations/[id] with 401", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/automations/fake-id");
      const res = await automationDetailGet(req, {
        params: Promise.resolve({ id: "fake-id" }),
      });
      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated requests to /api/automations/[id]/toggle with 401", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/automations/fake-id/toggle", {
        method: "PATCH",
        body: JSON.stringify({ isActive: false }),
      });
      const res = await togglePatch(req, {
        params: Promise.resolve({ id: "fake-id" }),
      });
      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated requests to /api/automations/[id]/runs with 401", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/automations/fake-id/runs");
      const res = await runsGet(req, {
        params: Promise.resolve({ id: "fake-id" }),
      });
      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated requests to /api/automations/test with 401", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/automations/test", {
        method: "POST",
        body: JSON.stringify({ mockEvent: { name: "test" } }),
      });
      const res = await testPost(req);
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/automations & Validation", () => {
    it("creates an automation rule with valid payload and returns 201", async () => {
      if (!probe.isAvailable) return;

      const payload = {
        name: "Test High Priority Auto",
        triggerType: "event",
        triggerConfig: { eventName: "task.completed" },
        conditions: [
          { field: "task.priority", operator: "equals", value: "high" },
        ],
        actionType: "create_notification",
        actionConfig: {
          title: "High Priority Task Done",
          message: "Task completed",
          type: "success",
        },
      };

      const req = new NextRequest("http://localhost:3000/api/automations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: cookieHeader,
        },
        body: JSON.stringify(payload),
      });

      const res = await automationsPost(req);
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.data).toBeDefined();
      expect(json.data.id).toBeDefined();
      expect(json.data.userId).toBe(testUserId);
      expect(json.data.name).toBe("Test High Priority Auto");
      expect(json.data.isActive).toBe(true);
      expect(json.data.executionCount).toBe(0);
    });

    it("rejects invalid input with 400", async () => {
      if (!probe.isAvailable) return;

      // Missing name and missing triggerConfig.eventName for event trigger
      const payload = {
        triggerType: "event",
        actionType: "create_notification",
      };

      const req = new NextRequest("http://localhost:3000/api/automations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: cookieHeader,
        },
        body: JSON.stringify(payload),
      });

      const res = await automationsPost(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe("Validation error");
    });
  });

  describe("GET /api/automations & Filtering", () => {
    it("lists automations with filtering by triggerType and isActive", async () => {
      if (!probe.isAvailable) return;

      // 1. Create active event rule
      await automationsPost(
        new NextRequest("http://localhost:3000/api/automations", {
          method: "POST",
          headers: { "Content-Type": "application/json", cookie: cookieHeader },
          body: JSON.stringify({
            name: "Active Event Rule",
            triggerType: "event",
            triggerConfig: { eventName: "task.created" },
            actionType: "create_notification",
            actionConfig: { title: "E", message: "E" },
            isActive: true,
          }),
        })
      );

      // 2. Create inactive event rule
      await automationsPost(
        new NextRequest("http://localhost:3000/api/automations", {
          method: "POST",
          headers: { "Content-Type": "application/json", cookie: cookieHeader },
          body: JSON.stringify({
            name: "Inactive Rule",
            triggerType: "event",
            triggerConfig: { eventName: "task.completed" },
            actionType: "create_notification",
            actionConfig: { title: "I", message: "I" },
            isActive: false,
          }),
        })
      );

      // List all
      const listReq = new NextRequest("http://localhost:3000/api/automations", {
        headers: { cookie: cookieHeader },
      });
      const listRes = await automationsGet(listReq);
      expect(listRes.status).toBe(200);
      const listJson = await listRes.json();
      expect(listJson.data).toHaveLength(2);

      // Filter isActive = true
      const activeReq = new NextRequest("http://localhost:3000/api/automations?isActive=true", {
        headers: { cookie: cookieHeader },
      });
      const activeRes = await automationsGet(activeReq);
      const activeJson = await activeRes.json();
      expect(activeJson.data).toHaveLength(1);
      expect(activeJson.data[0].name).toBe("Active Event Rule");
    });
  });

  describe("Single Automation CRUD", () => {
    it("retrieves single automation by ID, but returns 404 for nonexistent id", async () => {
      if (!probe.isAvailable) return;

      const createReq = new NextRequest("http://localhost:3000/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookieHeader },
        body: JSON.stringify({
          name: "Detail Target",
          triggerType: "event",
          triggerConfig: { eventName: "task.completed" },
          actionType: "create_task",
          actionConfig: { title: "Followup" },
        }),
      });
      const createRes = await automationsPost(createReq);
      const created = (await createRes.json()).data;

      // Existing fetch
      const getReq = new NextRequest(`http://localhost:3000/api/automations/${created.id}`, {
        headers: { cookie: cookieHeader },
      });
      const getRes = await automationDetailGet(getReq, {
        params: Promise.resolve({ id: created.id }),
      });
      expect(getRes.status).toBe(200);

      // Nonexistent ID -> 404
      const nonExistentReq = new NextRequest(
        "http://localhost:3000/api/automations/nonexistent-id",
        { headers: { cookie: cookieHeader } }
      );
      const nonExistentRes = await automationDetailGet(nonExistentReq, {
        params: Promise.resolve({ id: "nonexistent-id" }),
      });
      expect(nonExistentRes.status).toBe(404);
    });

    it("updates automation rule attributes", async () => {
      if (!probe.isAvailable) return;

      const createReq = new NextRequest("http://localhost:3000/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookieHeader },
        body: JSON.stringify({
          name: "Pre-Update Rule",
          triggerType: "event",
          triggerConfig: { eventName: "task.completed" },
          actionType: "create_notification",
          actionConfig: { title: "Old", message: "Old" },
        }),
      });
      const created = (await (await automationsPost(createReq)).json()).data;

      const patchReq = new NextRequest(`http://localhost:3000/api/automations/${created.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", cookie: cookieHeader },
        body: JSON.stringify({
          name: "Post-Update Rule",
          actionConfig: { title: "New", message: "New" },
        }),
      });
      const patchRes = await automationDetailPatch(patchReq, {
        params: Promise.resolve({ id: created.id }),
      });
      expect(patchRes.status).toBe(200);

      const json = await patchRes.json();
      expect(json.data.name).toBe("Post-Update Rule");
      expect(json.data.actionConfig.title).toBe("New");
    });

    it("toggles automation active status via /toggle route", async () => {
      if (!probe.isAvailable) return;

      const createReq = new NextRequest("http://localhost:3000/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookieHeader },
        body: JSON.stringify({
          name: "Toggle Test Rule",
          triggerType: "event",
          triggerConfig: { eventName: "task.created" },
          actionType: "create_notification",
          actionConfig: { title: "T", message: "T" },
        }),
      });
      const created = (await (await automationsPost(createReq)).json()).data;
      expect(created.isActive).toBe(true);

      // Disable
      const toggleReq1 = new NextRequest(`http://localhost:3000/api/automations/${created.id}/toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", cookie: cookieHeader },
        body: JSON.stringify({ isActive: false }),
      });
      const toggleRes1 = await togglePatch(toggleReq1, {
        params: Promise.resolve({ id: created.id }),
      });
      expect(toggleRes1.status).toBe(200);
      expect((await toggleRes1.json()).data.isActive).toBe(false);

      // Enable via POST
      const toggleReq2 = new NextRequest(`http://localhost:3000/api/automations/${created.id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookieHeader },
        body: JSON.stringify({ isActive: true }),
      });
      const toggleRes2 = await togglePost(toggleReq2, {
        params: Promise.resolve({ id: created.id }),
      });
      expect(toggleRes2.status).toBe(200);
      expect((await toggleRes2.json()).data.isActive).toBe(true);
    });

    it("deletes automation rule and cascades properly", async () => {
      if (!probe.isAvailable) return;

      const createReq = new NextRequest("http://localhost:3000/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookieHeader },
        body: JSON.stringify({
          name: "Delete Me",
          triggerType: "event",
          triggerConfig: { eventName: "task.created" },
          actionType: "create_notification",
          actionConfig: { title: "D", message: "D" },
        }),
      });
      const created = (await (await automationsPost(createReq)).json()).data;

      const deleteReq = new NextRequest(`http://localhost:3000/api/automations/${created.id}`, {
        method: "DELETE",
        headers: { cookie: cookieHeader },
      });
      const deleteRes = await automationDetailDelete(deleteReq, {
        params: Promise.resolve({ id: created.id }),
      });
      expect(deleteRes.status).toBe(200);

      // Verify deletion in DB
      const inDb = await db.select().from(automations).where(eq(automations.id, created.id));
      expect(inDb).toHaveLength(0);

      // Subsequent delete returns 404
      const secondDelRes = await automationDetailDelete(deleteReq, {
        params: Promise.resolve({ id: created.id }),
      });
      expect(secondDelRes.status).toBe(404);
    });
  });

  describe("Rule Dry-Run & Simulation (/api/automations/test)", () => {
    it("simulates matching rule against mock event payload without writing to database", async () => {
      if (!probe.isAvailable) return;

      const testPayload = {
        rule: {
          name: "Simulated Rule",
          triggerType: "event",
          triggerConfig: { eventName: "task.completed" },
          conditions: [
            { field: "task.priority", operator: "equals", value: "critical" },
          ],
          actionType: "create_task",
          actionConfig: {
            title: "Post-Incident: {{task.title}}",
            priority: "critical",
          },
        },
        mockEvent: {
          name: "task.completed",
          payload: {
            task: {
              id: "mock-task-1",
              title: "Server Outage Remediation",
              priority: "critical",
            },
          },
        },
      };

      const req = new NextRequest("http://localhost:3000/api/automations/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookieHeader },
        body: JSON.stringify(testPayload),
      });

      const res = await testPost(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.matched).toBe(true);
      expect(json.data.conditionsMet).toBe(true);
      expect(json.data.interpolatedActionConfig.title).toBe("Post-Incident: Server Outage Remediation");
      expect(json.data.interpolatedActionConfig.simulated).toBe(true);

      // Verify zero automations or tasks were created in DB
      const dbAutos = await db.select().from(automations).where(eq(automations.userId, testUserId));
      expect(dbAutos).toHaveLength(0);
    });

    it("returns conditionsMet: false when condition does not match mock payload", async () => {
      if (!probe.isAvailable) return;

      const testPayload = {
        rule: {
          name: "Simulated Rule",
          triggerType: "event",
          triggerConfig: { eventName: "task.completed" },
          conditions: [
            { field: "task.priority", operator: "equals", value: "critical" },
          ],
          actionType: "create_notification",
          actionConfig: { title: "Alert", message: "Alert" },
        },
        mockEvent: {
          name: "task.completed",
          payload: {
            task: {
              title: "Minor Typo Fix",
              priority: "low",
            },
          },
        },
      };

      const req = new NextRequest("http://localhost:3000/api/automations/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookieHeader },
        body: JSON.stringify(testPayload),
      });

      const res = await testPost(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.matched).toBe(true);
      expect(json.data.conditionsMet).toBe(false);
    });

    it("returns matched: false when event name does not match rule triggerConfig", async () => {
      if (!probe.isAvailable) return;

      const testPayload = {
        rule: {
          name: "Mismatched Event Rule",
          triggerType: "event",
          triggerConfig: { eventName: "task.completed" },
          conditions: [],
          actionType: "create_notification",
          actionConfig: { title: "T", message: "T" },
        },
        mockEvent: {
          name: "habit.logged",
          payload: {},
        },
      };

      const req = new NextRequest("http://localhost:3000/api/automations/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookieHeader },
        body: JSON.stringify(testPayload),
      });

      const res = await testPost(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.matched).toBe(false);
    });
  });

  describe("GET /api/automations/[id]/runs", () => {
    it("returns run history and handles nonexistent id", async () => {
      if (!probe.isAvailable) return;

      // Create rule
      const createReq = new NextRequest("http://localhost:3000/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookieHeader },
        body: JSON.stringify({
          name: "Run History Rule",
          triggerType: "event",
          triggerConfig: { eventName: "task.created" },
          actionType: "log_audit",
          actionConfig: { action: "test.run" },
        }),
      });
      const created = (await (await automationsPost(createReq)).json()).data;

      // Seed run rows in database
      await db.insert(automationRuns).values([
        {
          userId: testUserId,
          automationId: created.id,
          triggerEvent: "task.created",
          status: "success",
          executionDurationMs: 12,
        },
        {
          userId: testUserId,
          automationId: created.id,
          triggerEvent: "task.created",
          status: "skipped",
          executionDurationMs: 3,
        },
      ]);

      // Query runs
      const runsReq = new NextRequest(`http://localhost:3000/api/automations/${created.id}/runs`, {
        headers: { cookie: cookieHeader },
      });
      const runsRes = await runsGet(runsReq, {
        params: Promise.resolve({ id: created.id }),
      });
      expect(runsRes.status).toBe(200);

      const json = await runsRes.json();
      expect(json.data).toHaveLength(2);
      expect(json.count).toBe(2);

      // Query runs for nonexistent id returns 404
      const nonExistentReq = new NextRequest("http://localhost:3000/api/automations/nonexistent/runs", {
        headers: { cookie: cookieHeader },
      });
      const nonExistentRes = await runsGet(nonExistentReq, {
        params: Promise.resolve({ id: "nonexistent" }),
      });
      expect(nonExistentRes.status).toBe(404);
    });
  });
});
