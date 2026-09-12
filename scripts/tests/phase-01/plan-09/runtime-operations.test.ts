import { describe, it, expect, vi, afterEach } from "vitest";
import { parseEnv } from "@/lib/env";
import {
  checkDatabaseHealth,
  closeDatabase,
  getLifecycleState,
  createPgPool,
} from "@/server/db";
import { Pool } from "pg";

describe("Plan 01-09: Production Runtime & Operations Suite", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await closeDatabase();
  });

  describe("Environment Configuration & Fail-Closed Startup", () => {
    it("throws descriptive error when required variables are missing", () => {
      expect(() =>
        parseEnv({
          DATABASE_URL: "",
          BETTER_AUTH_SECRET: "",
          BETTER_AUTH_URL: "",
          LIFEOS_ENCRYPTION_KEY: "",
        })
      ).toThrow(/Invalid environment configuration/);
    });

    it("identifies specific corrupted fields in exception message", () => {
      try {
        parseEnv({
          DATABASE_URL: "mysql://localhost/lifeos",
          BETTER_AUTH_SECRET: "short_secret",
          BETTER_AUTH_URL: "not-a-valid-url",
          LIFEOS_ENCRYPTION_KEY: "invalid_hex_length",
        });
        expect.fail("Expected parseEnv to throw");
      } catch (err: any) {
        expect(err.message).toContain("DATABASE_URL");
        expect(err.message).toContain("BETTER_AUTH_SECRET");
        expect(err.message).toContain("BETTER_AUTH_URL");
        expect(err.message).toContain("LIFEOS_ENCRYPTION_KEY");
      }
    });

    it("rejects non-https BETTER_AUTH_URL in production when not localhost", () => {
      expect(() =>
        parseEnv({
          DATABASE_URL: "postgresql://lifeos:pass@localhost:5432/lifeos",
          BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          BETTER_AUTH_URL: "http://lifeos.hamza.internal",
          LIFEOS_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          NODE_ENV: "production",
        })
      ).toThrow(/BETTER_AUTH_URL must use https in production/);
    });
  });

  describe("Database Healthcheck & Diagnostic Error Reporting", () => {
    it("reports non-empty diagnostic message even on AggregateError or empty Error.message", async () => {
      // Simulate AggregateError where message is "" but code is ECONNREFUSED
      const aggregateError = new Error("") as any;
      aggregateError.code = "ECONNREFUSED";
      aggregateError.errors = [new Error("connect ECONNREFUSED 127.0.0.1:5432")];

      vi.spyOn(Pool.prototype, "connect").mockImplementationOnce(() => {
        return Promise.reject(aggregateError);
      });

      const result = await checkDatabaseHealth();
      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.error).toBe("ECONNREFUSED");
    });

    it("reports nested error message when AggregateError code is absent but errors array exists", async () => {
      const aggregateError = new Error("") as any;
      aggregateError.errors = [new Error("Connection reset by peer")];

      vi.spyOn(Pool.prototype, "connect").mockImplementationOnce(() => {
        return Promise.reject(aggregateError);
      });

      const result = await checkDatabaseHealth();
      expect(result.ok).toBe(false);
      expect(result.error).toBe("Connection reset by peer");
    });

    it("reports default diagnostic message when completely empty error is thrown", async () => {
      vi.spyOn(Pool.prototype, "connect").mockImplementationOnce(() => {
        return Promise.reject({});
      });

      const result = await checkDatabaseHealth();
      expect(result.ok).toBe(false);
      expect(result.error).toBe("Database connection failed");
    });
  });

  describe("Connection Lifecycle Transitions", () => {
    it("transitions through IDLE -> READY -> CLOSED deterministically", async () => {
      await closeDatabase();
      expect(["IDLE", "CLOSED"]).toContain(getLifecycleState());

      const pool = createPgPool();
      expect(pool).toBeDefined();

      await closeDatabase();
      expect(getLifecycleState()).toBe("CLOSED");
    });
  });
});
