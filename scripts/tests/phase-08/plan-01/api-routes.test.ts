// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as authGet } from "@/app/api/integrations/google-calendar/auth/route";
import { GET as statusGet } from "@/app/api/integrations/google-calendar/status/route";
import { POST as syncPost } from "@/app/api/integrations/google-calendar/sync/route";
import { POST as disconnectPost } from "@/app/api/integrations/google-calendar/disconnect/route";
import { GET as callbackGet } from "@/app/api/integrations/google-calendar/callback/route";
import * as authGuard from "@/server/auth/guard";
import { googleOAuthService } from "@/server/integrations/google-calendar/oauth-service";
import { googleCalendarSyncEngine } from "@/server/integrations/google-calendar/sync-engine";

describe("Plan 08-01: Google Calendar API Endpoints (Unit / Integration)", () => {
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

  describe("1. GET /api/integrations/google-calendar/auth", () => {
    it("returns 401 when request is unauthenticated", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockRejectedValue(
        new authGuard.AuthenticationError()
      );

      const req = new NextRequest("http://localhost:3000/api/integrations/google-calendar/auth");
      const res = await authGet(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("Authentication required");
    });

    it("returns 503 when Google OAuth credentials are not configured", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      vi.spyOn(googleOAuthService, "isConfigured").mockReturnValue(false);

      const req = new NextRequest("http://localhost:3000/api/integrations/google-calendar/auth");
      const res = await authGet(req);

      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.error).toContain("not configured");
    });

    it("returns authorization URL and sets CSRF state cookie when configured", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      vi.spyOn(googleOAuthService, "isConfigured").mockReturnValue(true);
      vi.spyOn(googleOAuthService, "generateAuthUrl").mockReturnValue({
        url: "https://accounts.google.com/o/oauth2/v2/auth?mock=true",
        state: "mock_state_token_123",
      });

      const req = new NextRequest("http://localhost:3000/api/integrations/google-calendar/auth?redirect=/calendar");
      const res = await authGet(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.url).toContain("https://accounts.google.com");
      expect(data.state).toBe("mock_state_token_123");

      const cookieHeader = res.headers.get("set-cookie");
      expect(cookieHeader).toContain("gcal_oauth_state=mock_state_token_123");
    });
  });

  describe("2. GET /api/integrations/google-calendar/status", () => {
    it("returns 401 when request is unauthenticated", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockRejectedValue(
        new authGuard.AuthenticationError()
      );

      const req = new NextRequest("http://localhost:3000/api/integrations/google-calendar/status");
      const res = await statusGet(req);

      expect(res.status).toBe(401);
    });

    it("returns sanitized DTO when authenticated without exposing tokens", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      vi.spyOn(googleOAuthService, "getConnectionStatus").mockResolvedValue({
        connected: true,
        status: "connected",
        accountEmail: "tester@gmail.com",
        scope: "calendar.events",
        lastSyncedAt: "2026-09-30T00:00:00.000Z",
        syncStats: {
          totalMappings: 12,
          lastSyncStatus: "success",
        },
      });

      const req = new NextRequest("http://localhost:3000/api/integrations/google-calendar/status");
      const res = await statusGet(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.connected).toBe(true);
      expect(data.accountEmail).toBe("tester@gmail.com");
      expect(data.syncStats.totalMappings).toBe(12);

      // Verify no secret leakage
      expect(data).not.toHaveProperty("encryptedAccessToken");
      expect(data).not.toHaveProperty("encryptedRefreshToken");
    });
  });

  describe("3. POST /api/integrations/google-calendar/sync", () => {
    it("executes manual sync and returns SyncResult", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      vi.spyOn(googleCalendarSyncEngine, "sync").mockResolvedValue({
        connectionId: "conn_123",
        userId: mockUser.id,
        provider: "google_calendar",
        syncType: "manual",
        status: "success",
        itemsProcessed: 4,
        itemsCreated: 1,
        itemsUpdated: 2,
        itemsDeleted: 1,
        itemsFailed: 0,
        startedAt: "2026-09-30T01:00:00.000Z",
        completedAt: "2026-09-30T01:00:01.000Z",
        durationMs: 100,
      });

      const req = new NextRequest("http://localhost:3000/api/integrations/google-calendar/sync", {
        method: "POST",
        body: JSON.stringify({ fullSync: false, direction: "bidirectional" }),
      });

      const res = await syncPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("success");
      expect(data.itemsCreated).toBe(1);
    });
  });

  describe("4. POST /api/integrations/google-calendar/disconnect", () => {
    it("disconnects the integration and returns confirmation message", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      const disconnectSpy = vi.spyOn(googleOAuthService, "disconnect").mockResolvedValue(undefined);

      const req = new NextRequest("http://localhost:3000/api/integrations/google-calendar/disconnect", {
        method: "POST",
      });

      const res = await disconnectPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(disconnectSpy).toHaveBeenCalledWith(mockUser.id, expect.any(Object));
    });
  });

  describe("5. GET /api/integrations/google-calendar/callback", () => {
    it("redirects with error parameter if state validation fails", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      vi.spyOn(googleOAuthService, "validateState").mockReturnValue({
        isValid: false,
        redirectTarget: "/calendar",
        error: "CSRF state token mismatch",
      });

      const req = new NextRequest("http://localhost:3000/api/integrations/google-calendar/callback?code=mock_code&state=bad_state");
      const res = await callbackGet(req);

      expect(res.status).toBe(307); // NextResponse.redirect default
      expect(res.headers.get("location")).toContain("error=");
      expect(res.headers.get("location")).toContain("CSRF");
    });

    it("exchanges code, triggers sync, and redirects with status=connected on valid callback", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      vi.spyOn(googleOAuthService, "validateState").mockReturnValue({
        isValid: true,
        redirectTarget: "/calendar",
      });

      vi.spyOn(googleOAuthService, "handleOAuthCallback").mockResolvedValue({
        connectionId: "conn_new_123",
        email: "user@gmail.com",
      });

      const syncSpy = vi.spyOn(googleCalendarSyncEngine, "sync").mockResolvedValue({
        connectionId: "conn_new_123",
        userId: mockUser.id,
        provider: "google_calendar",
        syncType: "initial",
        status: "success",
        itemsProcessed: 0,
        itemsCreated: 0,
        itemsUpdated: 0,
        itemsDeleted: 0,
        itemsFailed: 0,
        startedAt: "",
        completedAt: "",
        durationMs: 0,
      });

      const req = new NextRequest("http://localhost:3000/api/integrations/google-calendar/callback?code=valid_code&state=valid_state");
      const res = await callbackGet(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("status=connected");
      expect(syncSpy).toHaveBeenCalledWith(mockUser.id, { fullSync: true });
    });
  });
});
