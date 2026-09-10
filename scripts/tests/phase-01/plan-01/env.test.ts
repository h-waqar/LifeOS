import { describe, it, expect } from "vitest";
import { envSchema, parseEnv } from "@/lib/env";

describe("Environment Validation (src/lib/env.ts)", () => {
  const baseValidEnv = {
    DATABASE_URL: "postgresql://lifeos:lifeos_password@localhost:5432/lifeos",
    BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    BETTER_AUTH_URL: "http://localhost:3000",
    LIFEOS_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    NODE_ENV: "test" as const,
  };

  describe("DATABASE_URL Protocol and Format Validation", () => {
    it("accepts valid postgresql:// connection URL", () => {
      const result = envSchema.safeParse({
        ...baseValidEnv,
        DATABASE_URL: "postgresql://lifeos:lifeos_password@localhost:5432/lifeos",
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid postgres:// connection URL", () => {
      const result = envSchema.safeParse({
        ...baseValidEnv,
        DATABASE_URL: "postgres://user:pass@db.example.com/lifeos?sslmode=require",
      });
      expect(result.success).toBe(true);
    });

    it("accepts postgres connection URL with localhost without port", () => {
      const result = envSchema.safeParse({
        ...baseValidEnv,
        DATABASE_URL: "postgres://localhost/lifeos",
      });
      expect(result.success).toBe(true);
    });

    it("rejects non-PostgreSQL URL schemes (mysql://, sqlite://, http://, redis://)", () => {
      const invalidSchemes = [
        "mysql://user:pass@localhost:3306/lifeos",
        "sqlite://path/to/database.db",
        "http://localhost:5432/lifeos",
        "https://database.example.com",
        "redis://localhost:6379",
        "mongodb://localhost:27017/lifeos",
      ];

      for (const invalidUrl of invalidSchemes) {
        const result = envSchema.safeParse({
          ...baseValidEnv,
          DATABASE_URL: invalidUrl,
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          const dbIssue = result.error.issues.find((i) => i.path.includes("DATABASE_URL"));
          expect(dbIssue).toBeDefined();
          expect(dbIssue?.message).toContain("PostgreSQL connection URL");
        }
      }
    });

    it("rejects malformed or empty URLs", () => {
      const malformedUrls = [
        "",
        "not-a-url",
        "postgresql://", // protocol only, no host
        "postgres://",
        "://invalid",
        "12345",
      ];

      for (const malformed of malformedUrls) {
        const result = envSchema.safeParse({
          ...baseValidEnv,
          DATABASE_URL: malformed,
        });
        expect(result.success).toBe(false);
      }
    });
  });

  describe("LIFEOS_ENCRYPTION_KEY Validation", () => {
    it("accepts a 64-character hexadecimal key (32 bytes)", () => {
      const result = envSchema.safeParse({
        ...baseValidEnv,
        LIFEOS_ENCRYPTION_KEY: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      });
      expect(result.success).toBe(true);
    });

    it("rejects keys that are not 64 hex characters", () => {
      const invalidKeys = [
        "short_key",
        "0123456789abcdef", // 16 chars
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0", // 65 chars
        "g".repeat(64), // 64 chars, but non-hex 'g'
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcde ", // space
      ];

      for (const key of invalidKeys) {
        const result = envSchema.safeParse({
          ...baseValidEnv,
          LIFEOS_ENCRYPTION_KEY: key,
        });
        expect(result.success).toBe(false);
      }
    });
  });

  describe("BETTER_AUTH_SECRET Validation", () => {
    it("accepts secret with length >= 32", () => {
      const result = envSchema.safeParse({
        ...baseValidEnv,
        BETTER_AUTH_SECRET: "this_is_a_sufficiently_long_auth_secret_key_123",
      });
      expect(result.success).toBe(true);
    });

    it("rejects secret with length < 32", () => {
      const result = envSchema.safeParse({
        ...baseValidEnv,
        BETTER_AUTH_SECRET: "too_short_secret",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("BETTER_AUTH_URL Production Security", () => {
    it("allows http in development/test", () => {
      const result = envSchema.safeParse({
        ...baseValidEnv,
        NODE_ENV: "development",
        BETTER_AUTH_URL: "http://localhost:3000",
      });
      expect(result.success).toBe(true);
    });

    it("requires https in production", () => {
      const httpProd = envSchema.safeParse({
        ...baseValidEnv,
        NODE_ENV: "production",
        BETTER_AUTH_URL: "http://lifeos.example.com",
      });
      expect(httpProd.success).toBe(false);

      const httpsProd = envSchema.safeParse({
        ...baseValidEnv,
        NODE_ENV: "production",
        BETTER_AUTH_URL: "https://lifeos.example.com",
      });
      expect(httpsProd.success).toBe(true);
    });
  });

  describe("parseEnv Fail-Fast Behavior", () => {
    it("throws on missing required environment variables", () => {
      expect(() => parseEnv({})).toThrow(/Invalid environment configuration/);
    });
  });
});
