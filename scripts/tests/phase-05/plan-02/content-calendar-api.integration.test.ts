// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { auth } from "@/server/auth";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { createContentItem } from "@/server/content/service";

import { GET as calendarGet } from "@/app/api/content/calendar/route";
import { POST as schedulePost } from "@/app/api/content/[id]/schedule/route";
import { PATCH as publicationPatch } from "@/app/api/content/publications/[id]/route";
import { POST as publicationPublishPost } from "@/app/api/content/publications/[id]/publish/route";
import {
  GET as metricsGet,
  POST as metricsPost,
} from "@/app/api/content/[id]/metrics/route";
import { GET as analyticsGet } from "@/app/api/content/analytics/route";

describe("Phase 5 Plan 05-02: Content Calendar & Metrics API Route Handlers (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p05_cal_api@example.com",
    password: "Plan05CalApiPassword123!",
    name: "Calendar API Tester",
  };

  let testUserId: string;
  let cookieHeader: string;
  let testItemId: string;
  let testPublicationId: string;

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

    // Create a base content item
    const item = await createContentItem(testUserId, {
      title: "API Calendar Post",
      contentType: "post",
      primaryPlatform: "twitter",
    });
    testItemId = item.id;
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await db.delete(user);
      await closeDatabase();
    }
  });

  // 1. POST /api/content/[id]/schedule
  describe("1. POST /api/content/[id]/schedule", () => {
    it("rejects unauthenticated requests with 401", async () => {
      if (!probe.isAvailable) return;

      const req = createUnauthRequest(`http://localhost:3000/api/content/${testItemId}/schedule`, {
        method: "POST",
        body: JSON.stringify({
          platform: "twitter",
          scheduledFor: "2026-11-01T10:00:00.000Z",
        }),
      });

      const res = await schedulePost(req, {
        params: Promise.resolve({ id: testItemId }),
      });
      expect(res.status).toBe(401);
    });

    it("rejects invalid input with 400", async () => {
      if (!probe.isAvailable) return;

      const req = createAuthRequest(`http://localhost:3000/api/content/${testItemId}/schedule`, {
        method: "POST",
        body: JSON.stringify({
          platform: "invalid-platform",
          scheduledFor: "not-a-date",
        }),
      });

      const res = await schedulePost(req, {
        params: Promise.resolve({ id: testItemId }),
      });
      expect(res.status).toBe(400);
    });

    it("creates publication with 201 for valid request", async () => {
      if (!probe.isAvailable) return;

      const req = createAuthRequest(`http://localhost:3000/api/content/${testItemId}/schedule`, {
        method: "POST",
        body: JSON.stringify({
          platform: "twitter",
          scheduledFor: "2026-11-01T15:00:00.000Z",
        }),
      });

      const res = await schedulePost(req, {
        params: Promise.resolve({ id: testItemId }),
      });
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.data.id).toBeDefined();
      expect(json.data.platform).toBe("twitter");
      testPublicationId = json.data.id;
    });
  });

  // 2. GET /api/content/calendar
  describe("2. GET /api/content/calendar", () => {
    it("rejects unauthenticated requests with 401", async () => {
      if (!probe.isAvailable) return;

      const req = createUnauthRequest(
        "http://localhost:3000/api/content/calendar?startDate=2026-11-01&endDate=2026-11-30"
      );
      const res = await calendarGet(req);
      expect(res.status).toBe(401);
    });

    it("rejects query with invalid date order with 400", async () => {
      if (!probe.isAvailable) return;

      const req = createAuthRequest(
        "http://localhost:3000/api/content/calendar?startDate=2026-11-30&endDate=2026-11-01"
      );
      const res = await calendarGet(req);
      expect(res.status).toBe(400);
    });

    it("returns calendar items for valid range with 200", async () => {
      if (!probe.isAvailable) return;

      const req = createAuthRequest(
        "http://localhost:3000/api/content/calendar?startDate=2026-11-01&endDate=2026-11-30"
      );
      const res = await calendarGet(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.some((p: any) => p.id === testPublicationId)).toBe(true);
    });
  });

  // 3. PATCH /api/content/publications/[id]
  describe("3. PATCH /api/content/publications/[id]", () => {
    it("rejects unauthenticated request with 401", async () => {
      if (!probe.isAvailable) return;

      const req = createUnauthRequest(
        `http://localhost:3000/api/content/publications/${testPublicationId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            scheduledFor: "2026-11-05T10:00:00.000Z",
          }),
        }
      );

      const res = await publicationPatch(req, {
        params: Promise.resolve({ id: testPublicationId }),
      });
      expect(res.status).toBe(401);
    });

    it("reschedules publication with 200", async () => {
      if (!probe.isAvailable) return;

      const newDate = "2026-11-08T18:00:00.000Z";
      const req = createAuthRequest(
        `http://localhost:3000/api/content/publications/${testPublicationId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            scheduledFor: newDate,
          }),
        }
      );

      const res = await publicationPatch(req, {
        params: Promise.resolve({ id: testPublicationId }),
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(new Date(json.data.scheduledFor).toISOString()).toBe(newDate);
    });
  });

  // 4. POST /api/content/publications/[id]/publish
  describe("4. POST /api/content/publications/[id]/publish", () => {
    it("rejects unauthenticated request with 401", async () => {
      if (!probe.isAvailable) return;

      const req = createUnauthRequest(
        `http://localhost:3000/api/content/publications/${testPublicationId}/publish`,
        {
          method: "POST",
          body: JSON.stringify({
            postUrl: "https://twitter.com/hamza/status/112233",
          }),
        }
      );

      const res = await publicationPublishPost(req, {
        params: Promise.resolve({ id: testPublicationId }),
      });
      expect(res.status).toBe(401);
    });

    it("marks publication as published with 200", async () => {
      if (!probe.isAvailable) return;

      const req = createAuthRequest(
        `http://localhost:3000/api/content/publications/${testPublicationId}/publish`,
        {
          method: "POST",
          body: JSON.stringify({
            publishedAt: "2026-11-08T18:05:00.000Z",
            postUrl: "https://twitter.com/hamza/status/112233",
            externalPostId: "112233",
            notes: "Published via web UI",
          }),
        }
      );

      const res = await publicationPublishPost(req, {
        params: Promise.resolve({ id: testPublicationId }),
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.status).toBe("published");
      expect(json.data.postUrl).toBe("https://twitter.com/hamza/status/112233");
    });
  });

  // 5. POST & GET /api/content/[id]/metrics
  describe("5. POST & GET /api/content/[id]/metrics", () => {
    it("rejects unauthenticated metrics logging with 401", async () => {
      if (!probe.isAvailable) return;

      const req = createUnauthRequest(
        `http://localhost:3000/api/content/${testPublicationId}/metrics`,
        {
          method: "POST",
          body: JSON.stringify({
            views: 500,
            likes: 25,
          }),
        }
      );

      const res = await metricsPost(req, {
        params: Promise.resolve({ id: testPublicationId }),
      });
      expect(res.status).toBe(401);
    });

    it("logs metric snapshot with 201", async () => {
      if (!probe.isAvailable) return;

      const req = createAuthRequest(
        `http://localhost:3000/api/content/${testPublicationId}/metrics`,
        {
          method: "POST",
          body: JSON.stringify({
            views: 1000,
            likes: 60,
            comments: 10,
            shares: 10,
            saves: 10,
            clicks: 10, // 100 engagements = 10%
            notes: "Day 1 snapshot",
          }),
        }
      );

      const res = await metricsPost(req, {
        params: Promise.resolve({ id: testPublicationId }),
      });
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.data.views).toBe(1000);
      expect(json.data.engagementRate).toBe(10.0);
    });

    it("returns metrics history with 200", async () => {
      if (!probe.isAvailable) return;

      const req = createAuthRequest(
        `http://localhost:3000/api/content/${testPublicationId}/metrics`
      );

      const res = await metricsGet(req, {
        params: Promise.resolve({ id: testPublicationId }),
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  // 6. GET /api/content/analytics
  describe("6. GET /api/content/analytics", () => {
    it("rejects unauthenticated request with 401", async () => {
      if (!probe.isAvailable) return;

      const req = createUnauthRequest("http://localhost:3000/api/content/analytics");
      const res = await analyticsGet(req);
      expect(res.status).toBe(401);
    });

    it("returns analytics summary, platform breakdown, and leaderboard with 200", async () => {
      if (!probe.isAvailable) return;

      const req = createAuthRequest(
        "http://localhost:3000/api/content/analytics?startDate=2026-11-01&endDate=2026-11-30"
      );
      const res = await analyticsGet(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.totalViews).toBeGreaterThanOrEqual(1000);
      expect(json.data.totalEngagements).toBeGreaterThanOrEqual(100);
      expect(Array.isArray(json.data.channelBreakdown)).toBe(true);
      expect(Array.isArray(json.data.leaderboard)).toBe(true);
    });
  });
});
