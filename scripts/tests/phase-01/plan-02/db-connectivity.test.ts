import { describe, it, expect, vi, afterEach } from "vitest";
import { checkDatabaseHealth, closeDatabase } from "@/server/db";
import { Pool } from "pg";

describe("Database Connectivity & Health Check", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await closeDatabase();
  });

  it("returns { ok: false, error: string } without throwing when PostgreSQL is offline or unreachable", async () => {
    const connectSpy = vi
      .spyOn(Pool.prototype, "connect")
      .mockImplementationOnce(() => {
        return Promise.reject(new Error("connect ECONNREFUSED 127.0.0.1:5432"));
      });

    const result = await checkDatabaseHealth();
    expect(result.ok).toBe(false);
    expect(result.error).toContain("ECONNREFUSED");
    expect(result.latencyMs).toBeUndefined();
    expect(connectSpy).toHaveBeenCalled();
  });

  it("returns { ok: true, latencyMs: number } when PostgreSQL responds successfully", async () => {
    const mockRelease = vi.fn();
    const mockQuery = vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] });
    const mockClient = { query: mockQuery, release: mockRelease };

    vi.spyOn(Pool.prototype, "connect").mockImplementationOnce(() => {
      return Promise.resolve(mockClient as any);
    });

    const result = await checkDatabaseHealth();
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(mockQuery).toHaveBeenCalledWith("SELECT 1");
    expect(mockRelease).toHaveBeenCalled();
  });

  it("safely releases client back to pool even when query fails", async () => {
    const mockRelease = vi.fn();
    const mockQuery = vi.fn().mockRejectedValue(new Error("Query failed: timeout"));
    const mockClient = { query: mockQuery, release: mockRelease };

    vi.spyOn(Pool.prototype, "connect").mockImplementationOnce(() => {
      return Promise.resolve(mockClient as any);
    });

    const result = await checkDatabaseHealth();
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Query failed");
    expect(mockRelease).toHaveBeenCalled();
  });

  describe("probeDatabase three-state authenticity contract", () => {
    it("returns isAvailable=false when DB offline and REQUIRE_DB unset", async () => {
      const { probeDatabase } = await import("./db-probe");
      vi.spyOn(Pool.prototype, "connect").mockRejectedValueOnce(
        new Error("connect ECONNREFUSED")
      );
      const original = process.env.REQUIRE_DB;
      delete process.env.REQUIRE_DB;
      try {
        const probe = await probeDatabase();
        expect(probe.isAvailable).toBe(false);
        expect(probe.error).toContain("ECONNREFUSED");
      } finally {
        if (original) process.env.REQUIRE_DB = original;
      }
    });

    it("throws critical error when DB offline and REQUIRE_DB=true", async () => {
      const { probeDatabase } = await import("./db-probe");
      vi.spyOn(Pool.prototype, "connect").mockRejectedValueOnce(
        new Error("connect ECONNREFUSED")
      );
      const original = process.env.REQUIRE_DB;
      process.env.REQUIRE_DB = "true";
      try {
        await expect(probeDatabase()).rejects.toThrow(
          /CRITICAL REQUIRE_DB FAILURE/
        );
      } finally {
        if (original) {
          process.env.REQUIRE_DB = original;
        } else {
          delete process.env.REQUIRE_DB;
        }
      }
    });

    it("returns isAvailable=true when DB is online", async () => {
      const { probeDatabase } = await import("./db-probe");
      const mockRelease = vi.fn();
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }),
        release: mockRelease,
      };
      vi.spyOn(Pool.prototype, "connect").mockResolvedValueOnce(
        mockClient as any
      );

      const probe = await probeDatabase();
      expect(probe.isAvailable).toBe(true);
      expect(probe.error).toBeUndefined();
    });
  });
});
