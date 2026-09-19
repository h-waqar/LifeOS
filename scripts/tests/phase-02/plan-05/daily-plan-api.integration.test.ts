// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { tasks } from "@/server/db/schema";
import { auth } from "@/server/auth";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { GET as dailyPlanGet, POST as dailyPlanPost } from "@/app/api/daily-plan/route";
import { POST as eveningReviewPost } from "@/app/api/daily-plan/evening-review/route";
import { POST as rolloverPost } from "@/app/api/daily-plan/rollover/route";
import { GET as historyGet } from "@/app/api/daily-plan/history/route";

describe("Phase 2 Plan 02-05: Daily Planning API Routes (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p02_dp_api_user@example.com",
    password: "Plan02DpApiPassword123!",
    name: "Daily Plan API User",
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
        title: "API Daily Plan Task",
        status: "todo",
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

  it("1. Rejects unauthenticated requests with HTTP 401", async () => {
    const req = new NextRequest("http://localhost:3000/api/daily-plan");
    const res = await dailyPlanGet(req);
    expect(res.status).toBe(401);
  });

  it("2. GET /api/daily-plan returns daily planning context for authenticated user", async () => {
    const req = new NextRequest("http://localhost:3000/api/daily-plan?date=2026-10-25", {
      headers: { cookie: cookieHeader },
    });
    const res = await dailyPlanGet(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.context).toBeDefined();
    expect(data.context.date).toBe("2026-10-25");
    expect(Array.isArray(data.context.priorityTasks)).toBe(true);
  });

  it("3. POST /api/daily-plan creates/updates morning daily plan (PLAN-01)", async () => {
    const req = new NextRequest("http://localhost:3000/api/daily-plan", {
      method: "POST",
      headers: {
        cookie: cookieHeader,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        date: "2026-10-25",
        priorityTaskIds: [testTaskId],
        morningNotes: "Morning ritual notes via API",
        complete: true,
      }),
    });

    const res = await dailyPlanPost(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.plan).toBeDefined();
    expect(data.plan.status).toBe("completed");
    expect(data.plan.priorityTaskIds).toContain(testTaskId);
  });

  it("4. POST /api/daily-plan/evening-review submits review and calculates score (PLAN-02)", async () => {
    const req = new NextRequest("http://localhost:3000/api/daily-plan/evening-review", {
      method: "POST",
      headers: {
        cookie: cookieHeader,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        date: "2026-10-25",
        positiveReflections: "API review completed smoothly",
        challengesReflections: "None",
        notes: "Good day overall",
        selfRating: 9,
      }),
    });

    const res = await eveningReviewPost(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.review).toBeDefined();
    expect(data.review.productivityScore).toBeGreaterThanOrEqual(0);
    expect(data.review.positiveReflections).toBe("API review completed smoothly");
  });

  it("5. POST /api/daily-plan/rollover executes zero-duplication rollover (PLAN-03)", async () => {
    const req = new NextRequest("http://localhost:3000/api/daily-plan/rollover", {
      method: "POST",
      headers: {
        cookie: cookieHeader,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        date: "2026-10-25",
        actions: [{ taskId: testTaskId, action: "carry_over" }],
      }),
    });

    const res = await rolloverPost(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.rolledOverCount).toBe(1);
    expect(data.summary.carriedOver).toBe(1);
  });

  it("6. GET /api/daily-plan/history returns completion trend analysis (PLAN-04)", async () => {
    const req = new NextRequest("http://localhost:3000/api/daily-plan/history?days=7", {
      headers: { cookie: cookieHeader },
    });

    const res = await historyGet(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.history).toBeDefined();
    expect(data.history.totalDays).toBe(7);
    expect(Array.isArray(data.history.days)).toBe(true);
    expect(typeof data.history.morningPlanCompletionRate).toBe("number");
    expect(typeof data.history.eveningReviewCompletionRate).toBe("number");
  });
});
