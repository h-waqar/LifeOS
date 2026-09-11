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
});
