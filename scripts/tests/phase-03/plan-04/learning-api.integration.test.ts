// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { auth } from "@/server/auth";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { GET as learningGet, POST as learningPost } from "@/app/api/learning/route";
import {
  GET as learningItemGet,
  PATCH as learningItemPatch,
  PUT as learningItemPut,
  DELETE as learningItemDelete,
} from "@/app/api/learning/[id]/route";
import { GET as learningStatsGet } from "@/app/api/learning/stats/route";
import { GET as learningNotesGet } from "@/app/api/learning/[id]/notes/route";

describe("Phase 3 Plan 03-04: Learning API Route Handlers (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p03_learning_api_user@example.com",
    password: "Plan03LearningApiPassword123!",
    name: "Learning API Tester",
  };

  let testUserId: string;
  let cookieHeader: string;
  let createdItemId: string;

  function createAuthRequest(url: string, init?: RequestInit): NextRequest {
    const headers = new Headers(init?.headers);
    headers.set("cookie", cookieHeader);
    return new NextRequest(url, { ...init, headers } as any);
  }

  function createUnauthRequest(url: string, init?: RequestInit): NextRequest {
    return new NextRequest(url, init as any);
  }

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

    const [u] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testUser.email));
    testUserId = u.id;
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await db.delete(user);
      await closeDatabase();
    }
  });

  it("1. GET /api/learning rejects unauthenticated requests with 401", async () => {
    if (!probe.isAvailable) return;

    const req = createUnauthRequest("http://localhost:3000/api/learning");
    const res = await learningGet(req);
    expect(res.status).toBe(401);
  });

  it("2. POST /api/learning rejects unauthenticated requests with 401", async () => {
    if (!probe.isAvailable) return;

    const req = createUnauthRequest("http://localhost:3000/api/learning", {
      method: "POST",
      body: JSON.stringify({ title: "Unauthorized Item" }),
    });
    const res = await learningPost(req);
    expect(res.status).toBe(401);
  });

  it("3. POST /api/learning validates input and returns 400 for empty title", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest("http://localhost:3000/api/learning", {
      method: "POST",
      body: JSON.stringify({ title: "   ", type: "book" }),
    });
    const res = await learningPost(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it("4. POST /api/learning successfully creates a Learning Item and auto-calculates progress", async () => {
    if (!probe.isAvailable) return;

    const payload = {
      title: "Designing Data-Intensive Applications",
      type: "book",
      author: "Martin Kleppmann",
      totalUnits: 600,
      currentUnits: 300,
      unitType: "pages",
      tags: ["distributed-systems", "databases"],
      keyTakeaways: ["Partitioning and replication are fundamental trade-offs."],
    };

    const req = createAuthRequest("http://localhost:3000/api/learning", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const res = await learningPost(req);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.id).toBeDefined();
    expect(body.data.title).toBe("Designing Data-Intensive Applications");
    expect(body.data.type).toBe("book");
    expect(body.data.author).toBe("Martin Kleppmann");
    expect(body.data.progress).toBe(50); // 300 / 600 * 100
    expect(body.data.status).toBe("in_progress");
    expect(body.data.tags).toEqual(["distributed-systems", "databases"]);

    createdItemId = body.data.id;
  });

  it("5. GET /api/learning returns paginated list of items with filters", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest("http://localhost:3000/api/learning?type=book&status=in_progress");
    const res = await learningGet(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data[0].id).toBe(createdItemId);
  });

  it("6. GET /api/learning/[id] returns detail view with linked notes count", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest(`http://localhost:3000/api/learning/${createdItemId}`);
    const res = await learningItemGet(req, {
      params: Promise.resolve({ id: createdItemId }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.id).toBe(createdItemId);
    expect(body.data.linkedNotesCount).toBe(0);
    expect(body.data.linkedNotes).toEqual([]);
  });

  it("7. GET /api/learning/[id] returns 404 for non-existent id", async () => {
    if (!probe.isAvailable) return;

    const fakeId = crypto.randomUUID();
    const req = createAuthRequest(`http://localhost:3000/api/learning/${fakeId}`);
    const res = await learningItemGet(req, {
      params: Promise.resolve({ id: fakeId }),
    });
    expect(res.status).toBe(404);
  });

  it("8. PATCH /api/learning/[id] updates units, auto-completes item at 100% progress", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest(`http://localhost:3000/api/learning/${createdItemId}`, {
      method: "PATCH",
      body: JSON.stringify({
        currentUnits: 600, // 600 / 600 = 100%
        rating: 5,
      }),
    });
    const res = await learningItemPatch(req, {
      params: Promise.resolve({ id: createdItemId }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.progress).toBe(100);
    expect(body.data.status).toBe("completed");
    expect(body.data.completedAt).not.toBeNull();
    expect(body.data.rating).toBe(5);
  });

  it("9. GET /api/learning/stats returns aggregated metrics", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest("http://localhost:3000/api/learning/stats");
    const res = await learningStatsGet(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.totalItems).toBeGreaterThanOrEqual(1);
    expect(body.data.completedCount).toBeGreaterThanOrEqual(1);
    expect(body.data.byType.book).toBeGreaterThanOrEqual(1);
    expect(body.data.averageProgress).toBeGreaterThanOrEqual(0);
  });

  it("10. DELETE /api/learning/[id] archives and then restores item", async () => {
    if (!probe.isAvailable) return;

    // Archive
    const archiveReq = createAuthRequest(
      `http://localhost:3000/api/learning/${createdItemId}`,
      { method: "DELETE" }
    );
    const archiveRes = await learningItemDelete(archiveReq, {
      params: Promise.resolve({ id: createdItemId }),
    });
    expect(archiveRes.status).toBe(200);

    // Verify archived via GET /api/learning (default filters archived out)
    const listReq = createAuthRequest("http://localhost:3000/api/learning");
    const listRes = await learningGet(listReq);
    const listBody = await listRes.json();
    expect(listBody.data.some((i: any) => i.id === createdItemId)).toBe(false);

    // Restore
    const restoreReq = createAuthRequest(
      `http://localhost:3000/api/learning/${createdItemId}?restore=true`,
      { method: "DELETE" }
    );
    const restoreRes = await learningItemDelete(restoreReq, {
      params: Promise.resolve({ id: createdItemId }),
    });
    expect(restoreRes.status).toBe(200);

    // Verify restored
    const restoredListReq = createAuthRequest("http://localhost:3000/api/learning");
    const restoredListRes = await learningGet(restoredListReq);
    const restoredListBody = await restoredListRes.json();
    expect(restoredListBody.data.some((i: any) => i.id === createdItemId)).toBe(true);
  });

  it("11. DELETE /api/learning/[id]?hard=true permanently deletes item", async () => {
    if (!probe.isAvailable) return;

    const hardDeleteReq = createAuthRequest(
      `http://localhost:3000/api/learning/${createdItemId}?hard=true`,
      { method: "DELETE" }
    );
    const hardDeleteRes = await learningItemDelete(hardDeleteReq, {
      params: Promise.resolve({ id: createdItemId }),
    });
    expect(hardDeleteRes.status).toBe(200);

    // Verify item no longer exists
    const getReq = createAuthRequest(`http://localhost:3000/api/learning/${createdItemId}`);
    const getRes = await learningItemGet(getReq, {
      params: Promise.resolve({ id: createdItemId }),
    });
    expect(getRes.status).toBe(404);
  });
});
