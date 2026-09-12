import { describe, it, expect } from "vitest";
import {
  requireResourceOwnership,
  requireAuthenticatedUser,
  withUserScope,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import { updatePreferencesSchema } from "@/server/preferences/service";
import { userPreferences } from "@/server/db/schema";
import { sql } from "drizzle-orm";

describe("Plan 01-04: Server Authorization Guard & Input Validation", () => {
  describe("requireResourceOwnership", () => {
    it("permits access when resource owner matches authenticated user identity", () => {
      expect(() => {
        requireResourceOwnership("user_abc123", "user_abc123");
      }).not.toThrow();
    });

    it("fails closed (throws AuthorizationError / 403) when user IDs differ (IDOR prevention)", () => {
      expect(() => {
        requireResourceOwnership("victim_user_456", "attacker_user_123");
      }).toThrow(AuthorizationError);

      try {
        requireResourceOwnership("victim_user_456", "attacker_user_123");
      } catch (err) {
        expect(err).toBeInstanceOf(AuthorizationError);
        expect((err as AuthorizationError).status).toBe(403);
        expect((err as AuthorizationError).code).toBe("FORBIDDEN");
      }
    });

    it("fails closed when resource owner ID or authenticated user ID is null or empty", () => {
      expect(() => requireResourceOwnership(null, "user_123")).toThrow(AuthorizationError);
      expect(() => requireResourceOwnership("user_123", "")).toThrow(AuthorizationError);
      expect(() => requireResourceOwnership(undefined, "user_123")).toThrow(AuthorizationError);
    });
  });

  describe("withUserScope", () => {
    it("builds SQL condition anchoring query to authenticated user ID", () => {
      const scopeCondition = withUserScope(userPreferences.userId, "owner_user_789");
      expect(scopeCondition).toBeDefined();
    });

    it("fails closed if authenticated user ID is empty", () => {
      expect(() => withUserScope(userPreferences.userId, "")).toThrow(AuthorizationError);
    });
  });

  describe("updatePreferencesSchema (Input Validation & Identity Protection)", () => {
    it("accepts valid preference configurations", () => {
      const valid = {
        theme: "dark" as const,
        dateFormat: "YYYY-MM-DD",
        timeFormat: "24h" as const,
        workingHoursStart: "08:30",
        workingHoursEnd: "17:30",
      };

      const result = updatePreferencesSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("rejects client attempts to inject or override userId in payload", () => {
      const maliciousPayload = {
        theme: "light",
        userId: "victim_user_id_override",
      };

      const result = updatePreferencesSchema.safeParse(maliciousPayload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes("userId"))).toBe(true);
      }
    });

    it("rejects invalid themes and malformed working hour formats", () => {
      expect(updatePreferencesSchema.safeParse({ theme: "neon-blue" }).success).toBe(false);
      expect(updatePreferencesSchema.safeParse({ workingHoursStart: "25:00" }).success).toBe(false);
      expect(updatePreferencesSchema.safeParse({ workingHoursStart: "9:00" }).success).toBe(false);
      expect(updatePreferencesSchema.safeParse({ workingHoursEnd: "invalid" }).success).toBe(false);
    });
  });

  describe("requireAuthenticatedUser Fail-Closed Behavior", () => {
    it("throws AuthenticationError (401) when called with empty headers", async () => {
      const emptyHeaders = new Headers();
      await expect(requireAuthenticatedUser(emptyHeaders)).rejects.toThrow(AuthenticationError);

      try {
        await requireAuthenticatedUser(emptyHeaders);
      } catch (err) {
        expect(err).toBeInstanceOf(AuthenticationError);
        expect((err as AuthenticationError).status).toBe(401);
        expect((err as AuthenticationError).code).toBe("UNAUTHORIZED");
      }
    });

    it("throws AuthenticationError (401) when called with forged session cookie", async () => {
      const forgedHeaders = new Headers({
        cookie: "better-auth.session_token=forged_token_that_does_not_exist_in_db; path=/",
      });

      await expect(requireAuthenticatedUser(forgedHeaders)).rejects.toThrow(AuthenticationError);
    });
  });
});
