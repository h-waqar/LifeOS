// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as githubStatusGet } from "@/app/api/integrations/github/status/route";
import { POST as githubConnectPost } from "@/app/api/integrations/github/connect/route";
import { POST as githubSyncPost } from "@/app/api/integrations/github/sync/route";
import { GET as githubActivitiesGet } from "@/app/api/integrations/github/activities/route";
import { POST as githubDisconnectPost } from "@/app/api/integrations/github/disconnect/route";

import { GET as backupConfigGet, POST as backupConfigPost } from "@/app/api/integrations/backup/config/route";
import { POST as backupCreatePost } from "@/app/api/integrations/backup/create/route";
import { GET as backupListGet } from "@/app/api/integrations/backup/list/route";
import { POST as backupVerifyPost } from "@/app/api/integrations/backup/verify/[id]/route";

import { POST as incomingWebhookPost } from "@/app/api/integrations/webhooks/incoming/route";

import * as authGuard from "@/server/auth/guard";
import { githubService } from "@/server/integrations/github/service";
import { githubSyncEngine } from "@/server/integrations/github/sync-engine";
import { githubActivityService } from "@/server/integrations/github/activity-service";
import { backupService } from "@/server/integrations/backup/service";
import { webhookHandler } from "@/server/integrations/webhooks/handler";

describe("Plan 08-02: API Route Handlers (Integration Tests)", () => {
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

  describe("1. GitHub Routes Auth & Operations", () => {
    it("GET /api/integrations/github/status returns 401 when unauthenticated", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockRejectedValue(
        new authGuard.AuthenticationError()
      );

      const req = new NextRequest("http://localhost:3000/api/integrations/github/status");
      const res = await githubStatusGet(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("Authentication required");
    });

    it("GET /api/integrations/github/status returns status when authenticated", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      vi.spyOn(githubService, "getConnection").mockResolvedValue({
        connected: true,
        status: "connected",
        username: "octocat",
        avatarUrl: null,
        repos: ["lifeos/core"],
        lastSyncAt: null,
        lastEventId: null,
        error: null,
      });

      const req = new NextRequest("http://localhost:3000/api/integrations/github/status");
      const res = await githubStatusGet(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("connected");
      expect(data.username).toBe("octocat");
    });

    it("POST /api/integrations/github/connect connects account", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      vi.spyOn(githubService, "connectWithToken").mockResolvedValue({
        connected: true,
        status: "connected",
        username: "octocat",
        avatarUrl: null,
        repos: [],
        lastSyncAt: null,
        lastEventId: null,
        error: null,
      });

      const req = new NextRequest("http://localhost:3000/api/integrations/github/connect", {
        method: "POST",
        body: JSON.stringify({
          token: "ghp_mock_token_12345",
        }),
      });

      const res = await githubConnectPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.connection.username).toBe("octocat");
    });

    it("POST /api/integrations/github/sync triggers incremental sync", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      vi.spyOn(githubSyncEngine, "sync").mockResolvedValue({
        status: "success",
        itemsProcessed: 5,
        itemsCreated: 3,
        itemsSkipped: 2,
      });

      const req = new NextRequest("http://localhost:3000/api/integrations/github/sync", {
        method: "POST",
        body: JSON.stringify({ forceFull: false }),
      });

      const res = await githubSyncPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.itemsProcessed).toBe(5);
      expect(data.itemsCreated).toBe(3);
    });

    it("GET /api/integrations/github/activities queries activities by date", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      vi.spyOn(githubActivityService, "listActivities").mockResolvedValue([
        {
          id: "act-1",
          userId: "user_api_tester",
          connectionId: "conn-1",
          externalId: "sha123",
          activityType: "commit",
          repository: "lifeos/core",
          actor: "octocat",
          title: "Initial commit",
          summary: null,
          url: "https://github.com/lifeos/core/commit/sha123",
          timestamp: "2026-09-30T10:00:00Z",
          metadata: { shortSha: "sha123" },
          createdAt: "2026-09-30T10:00:00Z",
        },
      ]);

      const req = new NextRequest(
        "http://localhost:3000/api/integrations/github/activities?date=2026-09-30"
      );
      const res = await githubActivitiesGet(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.activities).toHaveLength(1);
      expect(data.activities[0].title).toBe("Initial commit");
    });

    it("POST /api/integrations/github/disconnect disconnects account", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      vi.spyOn(githubService, "disconnect").mockResolvedValue(undefined);

      const req = new NextRequest("http://localhost:3000/api/integrations/github/disconnect", {
        method: "POST",
      });
      const res = await githubDisconnectPost(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe("2. Backup Routes Auth & Operations", () => {
    it("GET /api/integrations/backup/config returns current config", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      vi.spyOn(backupService, "getConfig").mockResolvedValue({
        provider: "local",
        encrypt: false,
        schedule: "daily",
        localPath: "./backups",
      });

      const req = new NextRequest("http://localhost:3000/api/integrations/backup/config");
      const res = await backupConfigGet(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.config.provider).toBe("local");
    });

    it("POST /api/integrations/backup/config updates config", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      vi.spyOn(backupService, "configure").mockResolvedValue({
        provider: "local",
        encrypt: true,
        schedule: "weekly",
        localPath: "./backups",
      });

      const req = new NextRequest("http://localhost:3000/api/integrations/backup/config", {
        method: "POST",
        body: JSON.stringify({
          provider: "local",
          encrypt: true,
          schedule: "weekly",
        }),
      });

      const res = await backupConfigPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.config.encrypt).toBe(true);
    });

    it("POST /api/integrations/backup/create creates a manual backup", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      vi.spyOn(backupService, "createBackup").mockResolvedValue({
        id: "backup-xyz",
        userId: "user_api_tester",
        storageProvider: "local",
        status: "completed",
        destination: "./backups/user_api_tester/backup-xyz.json",
        sizeBytes: 2048,
        checksum: "abc123sha",
        encrypted: false,
        entityCounts: { tasks: 1 },
        errorMessage: null,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });

      const req = new NextRequest("http://localhost:3000/api/integrations/backup/create", {
        method: "POST",
        body: JSON.stringify({ provider: "local" }),
      });

      const res = await backupCreatePost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.backup.id).toBe("backup-xyz");
    });

    it("GET /api/integrations/backup/list lists user backup records", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      vi.spyOn(backupService, "listBackups").mockResolvedValue([
        {
          id: "backup-1",
          userId: "user_api_tester",
          storageProvider: "local",
          status: "completed",
          destination: "./backups/archive.json",
          sizeBytes: 1024,
          checksum: "hash123",
          encrypted: false,
          entityCounts: {},
          errorMessage: null,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      ]);

      const req = new NextRequest("http://localhost:3000/api/integrations/backup/list");
      const res = await backupListGet(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.backups).toHaveLength(1);
    });

    it("POST /api/integrations/backup/verify/[id] performs SEC-04 verification", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      vi.spyOn(backupService, "verifyBackup").mockResolvedValue({
        valid: true,
        backupId: "backup-1",
        checksumMatches: true,
        manifest: {
          backupId: "lifeos-backup-1",
          schemaVersion: "1.0",
          timestamp: new Date().toISOString(),
          userId: "user_api_tester",
          checksum: "sha256_valid",
          encrypted: false,
          entityCounts: {},
        },
        entityCounts: {},
        errors: [],
      });

      const req = new NextRequest(
        "http://localhost:3000/api/integrations/backup/verify/backup-1",
        { method: "POST" }
      );
      const res = await backupVerifyPost(req, {
        params: Promise.resolve({ id: "backup-1" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.valid).toBe(true);
      expect(data.checksumMatches).toBe(true);
    });
  });

  describe("3. Inbound Webhook Route Auth", () => {
    it("POST /api/integrations/webhooks/incoming accepts authenticated webhook", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      vi.spyOn(webhookHandler, "handleIncomingWebhook").mockResolvedValue({
        success: true,
        deliveryId: "deliv-123",
      });

      const req = new NextRequest("http://localhost:3000/api/integrations/webhooks/incoming", {
        method: "POST",
        body: JSON.stringify({ taskName: "Auto-synced task" }),
        headers: {
          "x-webhook-provider": "zapier",
          "x-webhook-event": "task.created",
        },
      });

      const res = await incomingWebhookPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.deliveryId).toBe("deliv-123");
    });
  });
});
