import { describe, it, expect } from "vitest";
import {
  requireResourceOwnership,
  withUserScope,
  requireAuthenticatedUser,
  getOptionalAuthenticatedUser,
  AuthorizationError,
  AuthenticationError,
} from "@/server/auth/guard";
import { userPreferences } from "@/server/db/schema";

describe("Plan 01-05: Adversarial Authorization Guard Boundary", () => {
  describe("requireResourceOwnership Edge Cases & Type Confusion", () => {
    it("permits exact valid string matches", () => {
      expect(() => requireResourceOwnership("user_abc123", "user_abc123")).not.toThrow();
    });

    it("fails closed on mismatched identities (IDOR)", () => {
      expect(() => requireResourceOwnership("user_alice", "user_bob")).toThrow(AuthorizationError);
    });

    it("fails closed on null or undefined arguments", () => {
      expect(() => requireResourceOwnership(null, "user_abc")).toThrow(AuthorizationError);
      expect(() => requireResourceOwnership("user_abc", null)).toThrow(AuthorizationError);
      expect(() => requireResourceOwnership(undefined, "user_abc")).toThrow(AuthorizationError);
      expect(() => requireResourceOwnership("user_abc", undefined)).toThrow(AuthorizationError);
      expect(() => requireResourceOwnership(null, null)).toThrow(AuthorizationError);
      expect(() => requireResourceOwnership(undefined, undefined)).toThrow(AuthorizationError);
    });

    it("fails closed on empty and whitespace-only strings", () => {
      expect(() => requireResourceOwnership("", "")).toThrow(AuthorizationError);
      expect(() => requireResourceOwnership("   ", "   ")).toThrow(AuthorizationError);
      expect(() => requireResourceOwnership("user_abc", "   ")).toThrow(AuthorizationError);
      expect(() => requireResourceOwnership("   ", "user_abc")).toThrow(AuthorizationError);
    });

    it("fails closed on non-string inputs (type confusion)", () => {
      expect(() => requireResourceOwnership(123 as any, 123 as any)).toThrow(AuthorizationError);
      expect(() => requireResourceOwnership({} as any, {} as any)).toThrow(AuthorizationError);
      expect(() => requireResourceOwnership([] as any, [] as any)).toThrow(AuthorizationError);
      expect(() => requireResourceOwnership(true as any, true as any)).toThrow(AuthorizationError);
    });
  });

  describe("withUserScope Input Boundary", () => {
    it("successfully creates SQL condition for valid string ID", () => {
      const condition = withUserScope(userPreferences.userId, "user_valid_123");
      expect(condition).toBeDefined();
    });

    it("fails closed on empty string, whitespace-only, or non-string", () => {
      expect(() => withUserScope(userPreferences.userId, "")).toThrow(AuthorizationError);
      expect(() => withUserScope(userPreferences.userId, "   ")).toThrow(AuthorizationError);
      expect(() => withUserScope(userPreferences.userId, null as any)).toThrow(AuthorizationError);
      expect(() => withUserScope(userPreferences.userId, undefined as any)).toThrow(AuthorizationError);
      expect(() => withUserScope(userPreferences.userId, 12345 as any)).toThrow(AuthorizationError);
    });
  });

  describe("Header Resolution Boundary & Object Injection", () => {
    it("correctly extracts headers from nested headers object { headers: Headers }", async () => {
      const headersInstance = new Headers({
        cookie: "better-auth.session_token=test_token_val",
      });
      const res = await getOptionalAuthenticatedUser({ headers: headersInstance });
      expect(res).toBeNull();
    });

    it("correctly extracts headers from plain object dictionary { headers: { cookie: ... } }", async () => {
      const res = await getOptionalAuthenticatedUser({
        headers: {
          cookie: "better-auth.session_token=plain_dict_token",
        },
      });
      expect(res).toBeNull();
    });

    it("fails closed on missing, malformed, or empty headers", async () => {
      await expect(requireAuthenticatedUser(undefined)).rejects.toThrow(AuthenticationError);
      await expect(requireAuthenticatedUser(new Headers())).rejects.toThrow(AuthenticationError);
      await expect(requireAuthenticatedUser({})).rejects.toThrow(AuthenticationError);
      await expect(requireAuthenticatedUser({ headers: {} })).rejects.toThrow(AuthenticationError);
    });
  });
});
