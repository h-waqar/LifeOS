// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as dashboardGet } from "@/app/api/analytics/dashboard/route";
import { GET as recommendationsGet } from "@/app/api/analytics/recommendations/route";
import {
  GET as snapshotsGet,
  POST as snapshotsPost,
} from "@/app/api/analytics/snapshots/route";
import * as authGuard from "@/server/auth/guard";
import * as analyticsService from "@/server/analytics/service";

describe("Plan 09-01: Analytics API Endpoints (Unit / Integration)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockUser = {
    id: "user_api_tester",
    email: "tester@lifeos.app",
    name: "Tester",
    emailVerified: true,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    singleUserLock: true,
  };

  const mockSession = {
    id: "session_123",
    userId: "user_api_tester",
    token: "token_xyz",
    expiresAt: new Date(Date.now() + 3600 * 1000),
    ipAddress: null,
    userAgent: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe("1. GET /api/analytics/dashboard", () => {
    it("returns 401 when request is unauthenticated", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockRejectedValue(
        new authGuard.AuthenticationError()
      );

      const req = new NextRequest("http://localhost:3000/api/analytics/dashboard");
      const res = await dashboardGet(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain("Authentication required");
    });

    it("returns 400 when query parameters are invalid", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      const req = new NextRequest(
        "http://localhost:3000/api/analytics/dashboard?period=invalid_period"
      );
      const res = await dashboardGet(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Invalid analytics query parameters");
    });

    it("returns 200 with dashboard analytics data and security cache headers", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      const mockDashboard: any = {
        period: { periodType: "30d", startDate: "2026-09-01", endDate: "2026-09-30" },
        overview: { totalFocusHours: 25, taskCompletionRate: 85 },
      };

      vi.spyOn(analyticsService, "getAnalyticsDashboard").mockResolvedValue(mockDashboard);

      const req = new NextRequest(
        "http://localhost:3000/api/analytics/dashboard?period=30d"
      );
      const res = await dashboardGet(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toContain("private, no-cache");
      const json = await res.json();
      expect(json.data).toEqual(mockDashboard);
    });
  });

  describe("2. GET /api/analytics/recommendations", () => {
    it("returns 401 when request is unauthenticated", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockRejectedValue(
        new authGuard.AuthenticationError()
      );

      const req = new NextRequest("http://localhost:3000/api/analytics/recommendations");
      const res = await recommendationsGet(req);

      expect(res.status).toBe(401);
    });

    it("returns 200 with schedule optimization recommendations (INTEL-04)", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      const mockRecs: any = {
        peakFocusWindow: { startHour: "09:00", endHour: "11:30" },
        energyTiers: [{ tier: "high", recommendedTimeWindow: "09:00 - 11:30" }],
      };

      vi.spyOn(analyticsService, "getScheduleRecommendations").mockResolvedValue(mockRecs);

      const req = new NextRequest("http://localhost:3000/api/analytics/recommendations");
      const res = await recommendationsGet(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toEqual(mockRecs);
    });
  });

  describe("3. Snapshots Endpoints (/api/analytics/snapshots)", () => {
    it("GET returns 401 when unauthenticated", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockRejectedValue(
        new authGuard.AuthenticationError()
      );

      const req = new NextRequest("http://localhost:3000/api/analytics/snapshots");
      const res = await snapshotsGet(req);
      expect(res.status).toBe(401);
    });

    it("GET returns 200 with snapshot list", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      vi.spyOn(analyticsService, "getHistoricalSnapshots").mockResolvedValue([
        {
          id: "snap_1",
          userId: mockUser.id,
          periodType: "30d",
          startDate: "2026-09-01",
          endDate: "2026-09-30",
          metrics: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const req = new NextRequest("http://localhost:3000/api/analytics/snapshots?periodType=30d");
      const res = await snapshotsGet(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toHaveLength(1);
    });

    it("POST returns 400 on invalid payload", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      const req = new NextRequest("http://localhost:3000/api/analytics/snapshots", {
        method: "POST",
        body: JSON.stringify({ invalid: "data" }),
      });
      const res = await snapshotsPost(req);

      expect(res.status).toBe(400);
    });

    it("POST returns 201 on valid snapshot creation", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      const mockSnapshot: any = {
        id: "snap_new",
        userId: mockUser.id,
        periodType: "30d",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
      };

      vi.spyOn(analyticsService, "saveAnalyticsSnapshot").mockResolvedValue(mockSnapshot);

      const req = new NextRequest("http://localhost:3000/api/analytics/snapshots", {
        method: "POST",
        body: JSON.stringify({
          periodType: "30d",
          startDate: "2026-09-01",
          endDate: "2026-09-30",
          metrics: { test: true },
        }),
      });
      const res = await snapshotsPost(req);

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.id).toBe("snap_new");
    });
  });
});
