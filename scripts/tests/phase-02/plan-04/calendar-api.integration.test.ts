// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { tasks, timeBlocks } from "@/server/db/schema";
import { auth } from "@/server/auth";
import { eq, and } from "drizzle-orm";
import { NextRequest } from "next/server";
import { GET as timeBlocksGet, POST as timeBlocksPost } from "@/app/api/time-blocks/route";
import {
  GET as timeBlockDetailGet,
  PATCH as timeBlockDetailPatch,
  DELETE as timeBlockDetailDelete,
} from "@/app/api/time-blocks/[id]/route";
import { POST as timeBlockCompletePost } from "@/app/api/time-blocks/[id]/complete/route";
import { GET as calendarFeedGet } from "@/app/api/calendar/route";

describe("Plan 02-04 Wave 2: Calendar & Time Blocking API Routes (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p02_cal_api_user@example.com",
    password: "Plan02CalApiPassword123!",
    name: "Calendar API Tester",
  };

  let testUserId: string;
  let cookieHeader: string;
  let testTaskId: string;

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

    const [createdTask] = await db
      .insert(tasks)
      .values({
        userId: testUserId,
        title: "API Linked Task",
        actualDuration: 0,
      })
      .returning();
    testTaskId = createdTask.id;
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await db.delete(user);
      await closeDatabase();
    }
  });

  describe("1. Authentication Guards", () => {
    it("rejects unauthenticated GET /api/time-blocks with 401", async () => {
      const req = new NextRequest("http://localhost:3000/api/time-blocks");
      const res = await timeBlocksGet(req);
      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated POST /api/time-blocks with 401", async () => {
      const req = new NextRequest("http://localhost:3000/api/time-blocks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Unauthorized Block" }),
      });
      const res = await timeBlocksPost(req);
      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated GET /api/calendar with 401", async () => {
      const req = new NextRequest("http://localhost:3000/api/calendar?startDate=2026-10-01&endDate=2026-10-07");
      const res = await calendarFeedGet(req);
      expect(res.status).toBe(401);
    });
  });

  describe("2. Time Block CRUD Operations & Invariants", () => {
    let createdBlockId: string;

    it("creates a new time block (POST /api/time-blocks -> 201)", async () => {
      const req = new NextRequest("http://localhost:3000/api/time-blocks", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: cookieHeader,
        },
        body: JSON.stringify({
          title: "API Deep Work Block",
          startTime: "2026-10-01T08:00:00.000Z",
          endTime: "2026-10-01T09:30:00.000Z",
          commitmentLevel: "hard",
          taskId: testTaskId,
        }),
      });

      const res = await timeBlocksPost(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.timeBlock).toBeDefined();
      expect(data.timeBlock.title).toBe("API Deep Work Block");
      expect(data.timeBlock.durationMinutes).toBe(90);
      createdBlockId = data.timeBlock.id;
    });

    it("rejects overlapping hard commitment (POST /api/time-blocks -> 409)", async () => {
      // Overlaps 08:30 - 09:30
      const req = new NextRequest("http://localhost:3000/api/time-blocks", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: cookieHeader,
        },
        body: JSON.stringify({
          title: "Conflicting API Hard Block",
          startTime: "2026-10-01T08:30:00.000Z",
          endTime: "2026-10-01T10:00:00.000Z",
          commitmentLevel: "hard",
        }),
      });

      const res = await timeBlocksPost(req);
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.code).toBe("CALENDAR_CONFLICT");
    });

    it("retrieves time block by ID (GET /api/time-blocks/[id] -> 200)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/time-blocks/${createdBlockId}`, {
        headers: { cookie: cookieHeader },
      });

      const res = await timeBlockDetailGet(req, {
        params: Promise.resolve({ id: createdBlockId }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.timeBlock.id).toBe(createdBlockId);
    });

    it("updates time block (PATCH /api/time-blocks/[id] -> 200)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/time-blocks/${createdBlockId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: cookieHeader,
        },
        body: JSON.stringify({
          title: "API Deep Work Block (Updated)",
        }),
      });

      const res = await timeBlockDetailPatch(req, {
        params: Promise.resolve({ id: createdBlockId }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.timeBlock.title).toBe("API Deep Work Block (Updated)");
    });

    it("completes time block and updates task duration (POST /api/time-blocks/[id]/complete -> 200)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/time-blocks/${createdBlockId}/complete`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: cookieHeader,
        },
        body: JSON.stringify({
          actualMinutes: 90,
          completeLinkedTask: false,
        }),
      });

      const res = await timeBlockCompletePost(req, {
        params: Promise.resolve({ id: createdBlockId }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.timeBlock.status).toBe("completed");
      expect(data.timeBlock.actualMinutes).toBe(90);

      // Verify task duration updated in DB
      const [t] = await db
        .select({ actualDuration: tasks.actualDuration })
        .from(tasks)
        .where(and(eq(tasks.userId, testUserId), eq(tasks.id, testTaskId)));
      expect(t.actualDuration).toBe(90);
    });

    it("deletes time block (DELETE /api/time-blocks/[id] -> 200)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/time-blocks/${createdBlockId}`, {
        method: "DELETE",
        headers: { cookie: cookieHeader },
      });

      const res = await timeBlockDetailDelete(req, {
        params: Promise.resolve({ id: createdBlockId }),
      });
      expect(res.status).toBe(200);

      // Verify it's gone
      const checkReq = new NextRequest(`http://localhost:3000/api/time-blocks/${createdBlockId}`, {
        headers: { cookie: cookieHeader },
      });
      const checkRes = await timeBlockDetailGet(checkReq, {
        params: Promise.resolve({ id: createdBlockId }),
      });
      expect(checkRes.status).toBe(404);
    });
  });

  describe("3. Aggregated Calendar Feed (CAL-01)", () => {
    it("returns aggregated feed items (GET /api/calendar -> 200)", async () => {
      const req = new NextRequest(
        "http://localhost:3000/api/calendar?startDate=2026-10-01&endDate=2026-10-07&view=week",
        {
          headers: { cookie: cookieHeader },
        }
      );

      const res = await calendarFeedGet(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.feed).toBeDefined();
      expect(Array.isArray(data.feed.timeBlocks)).toBe(true);
      expect(Array.isArray(data.feed.deadlines)).toBe(true);
      expect(typeof data.feed.totalScheduledMinutes).toBe("number");
    });
  });
});
