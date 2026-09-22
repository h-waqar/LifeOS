// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { auth } from "@/server/auth";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { GET as contentListGet, POST as contentCreatePost } from "@/app/api/content/route";
import {
  GET as contentItemGet,
  PATCH as contentItemPatch,
  DELETE as contentItemDelete,
} from "@/app/api/content/[id]/route";
import { POST as variantUpsertPost } from "@/app/api/content/[id]/variants/route";
import { DELETE as variantDelete } from "@/app/api/content/[id]/variants/[variantId]/route";
import { POST as statusTransitionPost } from "@/app/api/content/[id]/status/route";

describe("Phase 5 Plan 05-01: Content API Route Handlers (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p05_content_api@example.com",
    password: "Plan05ContentApiPassword123!",
    name: "Content API Tester",
  };

  let testUserId: string;
  let cookieHeader: string;
  let createdItemId: string;
  let createdVariantId: string;

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

  it("1. GET /api/content rejects unauthenticated requests with 401", async () => {
    if (!probe.isAvailable) return;

    const req = createUnauthRequest("http://localhost:3000/api/content");
    const res = await contentListGet(req);
    expect(res.status).toBe(401);
  });

  it("2. POST /api/content rejects unauthenticated requests with 401", async () => {
    if (!probe.isAvailable) return;

    const req = createUnauthRequest("http://localhost:3000/api/content", {
      method: "POST",
      body: JSON.stringify({ title: "Unauthorized Content" }),
    });
    const res = await contentCreatePost(req);
    expect(res.status).toBe(401);
  });

  it("3. POST /api/content validates input and returns 400 for empty title", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest("http://localhost:3000/api/content", {
      method: "POST",
      body: JSON.stringify({ title: "   " }),
    });
    const res = await contentCreatePost(req);
    expect(res.status).toBe(400);
  });

  it("4. POST /api/content creates content item and returns 201 with data", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest("http://localhost:3000/api/content", {
      method: "POST",
      body: JSON.stringify({
        title: "Scaling Distributed Caching",
        contentType: "article",
        topic: "Systems Architecture",
        targetAudience: "Backend Engineers",
        targetChannels: ["blog", "linkedin"],
        tags: ["caching", "performance"],
        summary: "Detailed overview of cache stampede prevention and cache invalidation.",
      }),
    });
    const res = await contentCreatePost(req);
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.data).toBeDefined();
    expect(json.data.title).toBe("Scaling Distributed Caching");
    expect(json.data.contentType).toBe("article");
    expect(json.data.variants.length).toBe(2);

    createdItemId = json.data.id;
  });

  it("5. GET /api/content lists user's content items with 200", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest("http://localhost:3000/api/content?limit=10");
    const res = await contentListGet(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.total).toBeGreaterThanOrEqual(1);
    expect(json.data.some((i: any) => i.id === createdItemId)).toBe(true);
  });

  it("6. GET /api/content/[id] returns 200 with item and platform variants", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest(`http://localhost:3000/api/content/${createdItemId}`);
    const res = await contentItemGet(req, {
      params: Promise.resolve({ id: createdItemId }),
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.id).toBe(createdItemId);
    expect(json.data.title).toBe("Scaling Distributed Caching");
    expect(json.data.variants.length).toBe(2);
  });

  it("7. PATCH /api/content/[id] updates content item title and summary", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest(`http://localhost:3000/api/content/${createdItemId}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: "Mastering Distributed Caching at Scale",
        summary: "Comprehensive guide to multi-tier caching architectures.",
      }),
    });
    const res = await contentItemPatch(req, {
      params: Promise.resolve({ id: createdItemId }),
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.title).toBe("Mastering Distributed Caching at Scale");
    expect(json.data.summary).toBe("Comprehensive guide to multi-tier caching architectures.");
  });

  it("8. POST /api/content/[id]/variants upserts a new platform variant", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest(
      `http://localhost:3000/api/content/${createdItemId}/variants`,
      {
        method: "POST",
        body: JSON.stringify({
          platform: "twitter",
          body: "Caching at scale requires solving 3 hard problems: invalidation, thundering herds, and consistency.",
          threadItems: [
            "Caching at scale requires solving 3 hard problems: invalidation, thundering herds, and consistency.",
            "Problem 1: Thundering herd. Use mutex locks or probabilistic early expiration (XFetch).",
          ],
          customSettings: {
            threadNumbering: true,
          },
        }),
      }
    );
    const res = await variantUpsertPost(req, {
      params: Promise.resolve({ id: createdItemId }),
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.platform).toBe("twitter");
    expect(json.data.threadItems.length).toBe(2);
    expect(json.data.charCount).toBeGreaterThan(0);

    createdVariantId = json.data.id;
  });

  it("9. POST /api/content/[id]/status transitions status with validation", async () => {
    if (!probe.isAvailable) return;

    // Transition idea -> draft
    const draftReq = createAuthRequest(
      `http://localhost:3000/api/content/${createdItemId}/status`,
      {
        method: "POST",
        body: JSON.stringify({
          targetStatus: "draft",
        }),
      }
    );
    const draftRes = await statusTransitionPost(draftReq, {
      params: Promise.resolve({ id: createdItemId }),
    });
    expect(draftRes.status).toBe(200);

    // Invalid transition: draft directly to published should return 400
    const invalidReq = createAuthRequest(
      `http://localhost:3000/api/content/${createdItemId}/status`,
      {
        method: "POST",
        body: JSON.stringify({
          targetStatus: "published",
        }),
      }
    );
    const invalidRes = await statusTransitionPost(invalidReq, {
      params: Promise.resolve({ id: createdItemId }),
    });
    expect(invalidRes.status).toBe(400);
  });

  it("10. DELETE /api/content/[id]/variants/[variantId] removes the specific variant", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest(
      `http://localhost:3000/api/content/${createdItemId}/variants/${createdVariantId}`,
      { method: "DELETE" }
    );
    const res = await variantDelete(req, {
      params: Promise.resolve({
        id: createdItemId,
        variantId: createdVariantId,
      }),
    });
    expect(res.status).toBe(200);

    // Check variant is gone
    const detailReq = createAuthRequest(`http://localhost:3000/api/content/${createdItemId}`);
    const detailRes = await contentItemGet(detailReq, {
      params: Promise.resolve({ id: createdItemId }),
    });
    const detailJson = await detailRes.json();
    expect(detailJson.data.variants.some((v: any) => v.id === createdVariantId)).toBe(false);
  });

  it("11. DELETE /api/content/[id] soft archives by default and hard deletes with ?hard=true", async () => {
    if (!probe.isAvailable) return;

    // Soft delete
    const softReq = createAuthRequest(
      `http://localhost:3000/api/content/${createdItemId}`,
      { method: "DELETE" }
    );
    const softRes = await contentItemDelete(softReq, {
      params: Promise.resolve({ id: createdItemId }),
    });
    expect(softRes.status).toBe(200);

    // Verify item is archived
    const checkReq = createAuthRequest(
      `http://localhost:3000/api/content/${createdItemId}`
    );
    const checkRes = await contentItemGet(checkReq, {
      params: Promise.resolve({ id: createdItemId }),
    });
    const checkJson = await checkRes.json();
    expect(checkJson.data.isArchived).toBe(true);

    // Hard delete
    const hardReq = createAuthRequest(
      `http://localhost:3000/api/content/${createdItemId}?hard=true`,
      { method: "DELETE" }
    );
    const hardRes = await contentItemDelete(hardReq, {
      params: Promise.resolve({ id: createdItemId }),
    });
    expect(hardRes.status).toBe(200);

    // Verify 404 after hard delete
    const finalReq = createAuthRequest(
      `http://localhost:3000/api/content/${createdItemId}`
    );
    const finalRes = await contentItemGet(finalReq, {
      params: Promise.resolve({ id: createdItemId }),
    });
    expect(finalRes.status).toBe(404);
  });
});
