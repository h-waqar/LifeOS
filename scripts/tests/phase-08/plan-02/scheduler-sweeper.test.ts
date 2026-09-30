// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();

vi.mock("@/server/db", () => ({
  db: {
    select: () => mockSelect(),
  },
}));

import { githubActivitySweeper } from "@/server/scheduler/jobs/github-activity-sync";
import { cloudBackupSweeper } from "@/server/scheduler/jobs/cloud-backup";
import { schedulerEngine } from "@/server/scheduler/engine";
import { githubSyncEngine } from "@/server/integrations/github/sync-engine";
import { backupService } from "@/server/integrations/backup/service";
import * as lockService from "@/server/scheduler/lock-service";

describe("Plan 08-02: Background Sweepers (Unit Tests)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Sweeper Registration", () => {
    it("registers github_activity_sync and cloud_backup with scheduler engine", () => {
      const sweepers = schedulerEngine.getSweepers();
      expect(sweepers.find((s) => s.name === "github_activity_sync")).toBeDefined();
      expect(sweepers.find((s) => s.name === "cloud_backup")).toBeDefined();
    });
  });

  describe("2. githubActivitySweeper", () => {
    it("skips execution when user has no GitHub connection", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await githubActivitySweeper.run("user_no_github");
      expect(result.executed).toBe(false);
      expect(result.skippedReason).toContain("No GitHub integration configured");
    });

    it("skips execution when already locked in the 15-minute slot", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: "conn_1", status: "connected" },
            ]),
          }),
        }),
      });

      vi.spyOn(lockService, "acquireJobLock").mockResolvedValue(false);

      const result = await githubActivitySweeper.run("user_locked");
      expect(result.executed).toBe(false);
      expect(result.skippedReason).toContain("Already synchronized in this 15-minute interval");
    });

    it("executes sync and releases lock upon success", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: "conn_1", status: "connected" },
            ]),
          }),
        }),
      });

      vi.spyOn(lockService, "acquireJobLock").mockResolvedValue(true);
      const completeSpy = vi.spyOn(lockService, "completeJobLock").mockResolvedValue(undefined);

      vi.spyOn(githubSyncEngine, "sync").mockResolvedValue({
        status: "success",
        itemsProcessed: 12,
        itemsCreated: 8,
        itemsSkipped: 4,
      });

      const result = await githubActivitySweeper.run("user_ok");
      expect(result.executed).toBe(true);
      expect(result.details?.itemsProcessed).toBe(12);
      expect(result.details?.itemsCreated).toBe(8);
      expect(completeSpy).toHaveBeenCalledWith("user_ok", expect.any(String));
    });

    it("marks lock as failed when sync throws", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: "conn_1", status: "connected" },
            ]),
          }),
        }),
      });

      vi.spyOn(lockService, "acquireJobLock").mockResolvedValue(true);
      const failSpy = vi.spyOn(lockService, "failJobLock").mockResolvedValue(undefined);

      vi.spyOn(githubSyncEngine, "sync").mockRejectedValue(new Error("API rate limit exceeded"));

      const result = await githubActivitySweeper.run("user_error");
      expect(result.executed).toBe(false);
      expect(result.error).toContain("API rate limit exceeded");
      expect(failSpy).toHaveBeenCalledWith("user_error", expect.any(String));
    });
  });

  describe("3. cloudBackupSweeper", () => {
    it("skips when backups are disabled in connection metadata", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: "conn_b1", status: "connected", metadata: { schedule: "disabled" } },
            ]),
          }),
        }),
      });

      const result = await cloudBackupSweeper.run("user_disabled");
      expect(result.executed).toBe(false);
      expect(result.skippedReason).toContain("disabled");
    });

    it("skips weekly backup when not Sunday", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: "conn_b1", status: "connected", metadata: { schedule: "weekly" } },
            ]),
          }),
        }),
      });

      // Wednesday 2026-09-30 (dayOfWeek === 3)
      const result = await cloudBackupSweeper.run("user_weekly", {
        referenceDate: new Date("2026-09-30T10:00:00Z"),
      });

      expect(result.executed).toBe(false);
      expect(result.skippedReason).toContain("Weekly backup scheduled for Sunday");
    });

    it("executes automated backup when daily schedule active and lock acquired", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "conn_b1",
                status: "connected",
                metadata: { schedule: "daily", provider: "local" },
              },
            ]),
          }),
        }),
      });

      vi.spyOn(lockService, "acquireJobLock").mockResolvedValue(true);
      const completeSpy = vi.spyOn(lockService, "completeJobLock").mockResolvedValue(undefined);

      vi.spyOn(backupService, "createBackup").mockResolvedValue({
        id: "backup_123",
        userId: "user_daily",
        storageProvider: "local",
        status: "completed",
        destination: "./backups/user_daily/backup_123.json",
        sizeBytes: 1024,
        checksum: "abc123sha",
        encrypted: false,
        entityCounts: { tasks: 5 },
        errorMessage: null,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });

      const result = await cloudBackupSweeper.run("user_daily");
      expect(result.executed).toBe(true);
      expect(result.details?.backupId).toBe("backup_123");
      expect(completeSpy).toHaveBeenCalledWith("user_daily", expect.any(String));
    });
  });
});
