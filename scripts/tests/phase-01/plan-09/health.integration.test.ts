import { describe, it, expect, vi, afterEach } from "vitest";
import { GET } from "@/app/api/health/route";
import * as dbModule from "@/server/db";
import { Pool } from "pg";

describe("Plan 01-09: Operational Healthcheck API Suite", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 200 and healthy status when database is operational", async () => {
    const res = await GET();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("healthy");
    expect(data.database).toBe("connected");
    expect(typeof data.latencyMs).toBe("number");
    expect(data.timestamp).toBeTruthy();
    expect(data.error).toBeUndefined();

    // Security assertions: no sensitive connection strings or passwords leaked
    const rawBody = JSON.stringify(data);
    expect(rawBody).not.toContain("password");
    expect(rawBody).not.toContain("postgresql://");
    expect(rawBody).not.toContain("5432");

    // Cache headers assertion
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("returns 503 and unhealthy status when database connection fails", async () => {
    vi.spyOn(dbModule, "checkDatabaseHealth").mockResolvedValueOnce({
      ok: false,
      error: "ECONNREFUSED",
    });

    const res = await GET();
    expect(res.status).toBe(503);

    const data = await res.json();
    expect(data.status).toBe("unhealthy");
    expect(data.database).toBe("disconnected");
    expect(data.error).toBe("Database connectivity check failed");
    expect(data.timestamp).toBeTruthy();

    // Security assertions: no credentials or stack traces leaked
    const rawBody = JSON.stringify(data);
    expect(rawBody).not.toContain("password");
    expect(rawBody).not.toContain("postgresql://");
  });

  it("returns 503 and handles unexpected exceptions safely", async () => {
    vi.spyOn(dbModule, "checkDatabaseHealth").mockRejectedValueOnce(
      new Error("Unexpected internal runtime failure")
    );

    const res = await GET();
    expect(res.status).toBe(503);

    const data = await res.json();
    expect(data.status).toBe("unhealthy");
    expect(data.error).toBe("Healthcheck execution failed");
  });
});
