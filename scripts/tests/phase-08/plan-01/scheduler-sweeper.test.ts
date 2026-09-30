// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();

vi.mock("@/server/db", () => ({
  db: {
    select: () => mockSelect(),
  },
}));

import { googleCalendarSyncSweeper } from "@/server/scheduler/jobs/google-calendar-sync";
import { schedulerEngine } from "@/server/scheduler/engine";
import { googleCalendarSyncEngine } from "@/server/integrations/google-calendar/sync-engine";
import * as lockService from "@/server/scheduler/lock-service";

describe("Plan 08-01: Google Calendar Background Sweeper (Unit Tests)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("is registered with the scheduler engine", () => {
    const sweepers = schedulerEngine.getSweepers();
    const found = sweepers.find((s) => s.name === "google_calendar_sync");
    expect(found).toBeDefined();
    expect(found?.name).toBe("google_calendar_sync");
  });

  it("skips execution when user has no Google Calendar connection", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const result = await googleCalendarSyncSweeper.run("user_no_integration");

    expect(result.executed).toBe(false);
    expect(result.skippedReason).toContain("No Google Calendar integration configured");
    expect(result.jobName).toBe("google_calendar_sync");
  });

  it("skips execution when integration is disconnected or expired", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            { id: "conn_123", status: "disconnected" },
          ]),
        }),
      }),
    });

    const result = await googleCalendarSyncSweeper.run("user_disconnected");

    expect(result.executed).toBe(false);
    expect(result.skippedReason).toContain("disconnected");
  });

  it("skips execution if job lock was already acquired in the 5-minute interval", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            { id: "conn_123", status: "connected" },
          ]),
        }),
      }),
    });

    vi.spyOn(lockService, "acquireJobLock").mockResolvedValue(false);

    const result = await googleCalendarSyncSweeper.run("user_locked");

    expect(result.executed).toBe(false);
    expect(result.skippedReason).toContain("Already synchronized");
  });

  it("executes synchronization and completes job lock when connected and lock acquired", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            { id: "conn_123", status: "connected" },
          ]),
        }),
      }),
    });

    vi.spyOn(lockService, "acquireJobLock").mockResolvedValue(true);
    const completeLockSpy = vi.spyOn(lockService, "completeJobLock").mockResolvedValue(undefined);

    vi.spyOn(googleCalendarSyncEngine, "sync").mockResolvedValue({
      connectionId: "conn_123",
      userId: "user_sync_ok",
      provider: "google_calendar",
      syncType: "incremental",
      status: "success",
      itemsProcessed: 5,
      itemsCreated: 2,
      itemsUpdated: 3,
      itemsDeleted: 0,
      itemsFailed: 0,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 45,
    });

    const result = await googleCalendarSyncSweeper.run("user_sync_ok");

    expect(result.executed).toBe(true);
    expect(result.jobName).toBe("google_calendar_sync");
    expect(result.details?.itemsProcessed).toBe(5);
    expect(result.details?.itemsCreated).toBe(2);
    expect(completeLockSpy).toHaveBeenCalledWith("user_sync_ok", expect.stringContaining("google_calendar_sync:user_sync_ok:"));
  });

  it("handles and isolates sync errors, marking job lock as failed", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            { id: "conn_123", status: "connected" },
          ]),
        }),
      }),
    });

    vi.spyOn(lockService, "acquireJobLock").mockResolvedValue(true);
    const failLockSpy = vi.spyOn(lockService, "failJobLock").mockResolvedValue(undefined);

    vi.spyOn(googleCalendarSyncEngine, "sync").mockRejectedValue(new Error("Network timeout"));

    const result = await googleCalendarSyncSweeper.run("user_error");

    expect(result.executed).toBe(false);
    expect(result.error).toContain("Network timeout");
    expect(failLockSpy).toHaveBeenCalledWith("user_error", expect.any(String));
  });
});
