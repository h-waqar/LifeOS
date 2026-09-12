import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import {
  user,
  session,
  account,
  verification,
  passkey,
  userPreferences,
  auditLog,
  FOUNDATIONAL_TABLE_NAMES,
} from "@/server/db/schema";

describe("Foundational Database Schema (Drizzle ORM)", () => {
  describe("Better Auth Core Tables", () => {
    it("defines the 'user' table with required identity fields and constraints", () => {
      const cols = getTableColumns(user);
      expect(cols).toHaveProperty("id");
      expect(cols).toHaveProperty("name");
      expect(cols).toHaveProperty("email");
      expect(cols).toHaveProperty("emailVerified");
      expect(cols).toHaveProperty("image");
      expect(cols).toHaveProperty("createdAt");
      expect(cols).toHaveProperty("updatedAt");

      expect(cols.id.primary).toBe(true);
      expect(cols.name.notNull).toBe(true);
      expect(cols.email.notNull).toBe(true);
      expect(cols.email.isUnique).toBe(true);
      expect(cols.emailVerified.notNull).toBe(true);
      expect(cols.emailVerified.default).toBe(false);
    });

    it("defines the 'session' table with foreign key to user and unique token", () => {
      const cols = getTableColumns(session);
      expect(cols).toHaveProperty("id");
      expect(cols).toHaveProperty("userId");
      expect(cols).toHaveProperty("token");
      expect(cols).toHaveProperty("expiresAt");
      expect(cols).toHaveProperty("ipAddress");
      expect(cols).toHaveProperty("userAgent");
      expect(cols).toHaveProperty("createdAt");
      expect(cols).toHaveProperty("updatedAt");

      expect(cols.id.primary).toBe(true);
      expect(cols.userId.notNull).toBe(true);
      expect(cols.token.notNull).toBe(true);
      expect(cols.token.isUnique).toBe(true);
      expect(cols.expiresAt.notNull).toBe(true);
    });

    it("defines the 'account' table with provider credentials and user foreign key", () => {
      const cols = getTableColumns(account);
      expect(cols).toHaveProperty("id");
      expect(cols).toHaveProperty("userId");
      expect(cols).toHaveProperty("accountId");
      expect(cols).toHaveProperty("providerId");
      expect(cols).toHaveProperty("accessToken");
      expect(cols).toHaveProperty("refreshToken");
      expect(cols).toHaveProperty("idToken");
      expect(cols).toHaveProperty("scope");
      expect(cols).toHaveProperty("password");
      expect(cols).toHaveProperty("createdAt");
      expect(cols).toHaveProperty("updatedAt");

      expect(cols.id.primary).toBe(true);
      expect(cols.userId.notNull).toBe(true);
      expect(cols.accountId.notNull).toBe(true);
      expect(cols.providerId.notNull).toBe(true);
    });

    it("defines the 'verification' table for token verification", () => {
      const cols = getTableColumns(verification);
      expect(cols).toHaveProperty("id");
      expect(cols).toHaveProperty("identifier");
      expect(cols).toHaveProperty("value");
      expect(cols).toHaveProperty("expiresAt");
      expect(cols).toHaveProperty("createdAt");
      expect(cols).toHaveProperty("updatedAt");

      expect(cols.id.primary).toBe(true);
      expect(cols.identifier.notNull).toBe(true);
      expect(cols.value.notNull).toBe(true);
      expect(cols.expiresAt.notNull).toBe(true);
    });

    it("defines the 'passkey' table with WebAuthn credential fields and unique credentialID", () => {
      const cols = getTableColumns(passkey);
      expect(cols).toHaveProperty("id");
      expect(cols).toHaveProperty("name");
      expect(cols).toHaveProperty("publicKey");
      expect(cols).toHaveProperty("userId");
      expect(cols).toHaveProperty("credentialID");
      expect(cols).toHaveProperty("counter");
      expect(cols).toHaveProperty("deviceType");
      expect(cols).toHaveProperty("backedUp");
      expect(cols).toHaveProperty("transports");
      expect(cols).toHaveProperty("createdAt");
      expect(cols).toHaveProperty("aaguid");
      expect((cols as Record<string, unknown>).updatedAt).toBeUndefined();

      expect(cols.id.primary).toBe(true);
      expect(cols.publicKey.notNull).toBe(true);
      expect(cols.userId.notNull).toBe(true);
      expect(cols.credentialID.notNull).toBe(true);
      expect(cols.credentialID.isUnique).toBe(true);
      expect(cols.counter.notNull).toBe(true);
      expect(cols.counter.default).toBe(0);
      expect(cols.deviceType.notNull).toBe(true);
      expect(cols.backedUp.notNull).toBe(true);
      expect(cols.backedUp.default).toBe(false);
      expect(cols.createdAt.notNull).toBe(false);
      expect(cols.aaguid.notNull).toBe(false);
    });
  });

  describe("User Preferences Table", () => {
    it("defines 'user_preferences' with 1-to-1 unique link to user and default settings", () => {
      const cols = getTableColumns(userPreferences);
      expect(cols).toHaveProperty("id");
      expect(cols).toHaveProperty("userId");
      expect(cols).toHaveProperty("theme");
      expect(cols).toHaveProperty("dateFormat");
      expect(cols).toHaveProperty("timeFormat");
      expect(cols).toHaveProperty("workingHoursStart");
      expect(cols).toHaveProperty("workingHoursEnd");
      expect(cols).toHaveProperty("createdAt");
      expect(cols).toHaveProperty("updatedAt");

      expect(cols.id.primary).toBe(true);
      expect(cols.userId.notNull).toBe(true);
      expect(cols.userId.isUnique).toBe(true);
      expect(cols.theme.default).toBe("dark");
      expect(cols.dateFormat.default).toBe("YYYY-MM-DD");
      expect(cols.timeFormat.default).toBe("24h");
      expect(cols.workingHoursStart.default).toBe("09:00");
      expect(cols.workingHoursEnd.default).toBe("18:00");
    });
  });

  describe("Audit Log Table", () => {
    it("defines 'audit_log' with immutable tracking fields and nullable userId", () => {
      const cols = getTableColumns(auditLog);
      expect(cols).toHaveProperty("id");
      expect(cols).toHaveProperty("userId");
      expect(cols).toHaveProperty("category");
      expect(cols).toHaveProperty("action");
      expect(cols).toHaveProperty("status");
      expect(cols).toHaveProperty("actor");
      expect(cols).toHaveProperty("details");
      expect(cols).toHaveProperty("ipAddress");
      expect(cols).toHaveProperty("userAgent");
      expect(cols).toHaveProperty("createdAt");

      expect(cols.id.primary).toBe(true);
      expect(cols.category.notNull).toBe(true);
      expect(cols.action.notNull).toBe(true);
      expect(cols.status.notNull).toBe(true);
      expect(cols.userId.notNull).toBe(false); // Nullable for unauthenticated/system events
    });
  });

  describe("Vertical-Slice Scope Boundary Enforcement", () => {
    it("strictly restricts foundational tables to the approved 7 infrastructure tables", () => {
      expect(FOUNDATIONAL_TABLE_NAMES).toHaveLength(7);
      expect(Array.from(FOUNDATIONAL_TABLE_NAMES)).toEqual([
        "user",
        "session",
        "account",
        "verification",
        "passkey",
        "user_preferences",
        "audit_log",
      ]);
    });

    it("ensures zero domain tables exist in the schema (anti-regression for vertical-slice rule)", () => {
      const forbiddenDomainEntities = [
        "task",
        "tasks",
        "project",
        "projects",
        "goal",
        "goals",
        "habit",
        "habits",
        "timeBlock",
        "timeBlocks",
        "calendar",
        "calendars",
        "note",
        "notes",
        "person",
        "people",
        "interaction",
        "interactions",
        "transaction",
        "transactions",
        "financeAccount",
        "budget",
        "budgets",
        "content",
        "contents",
        "aiMessage",
        "aiMessages",
        "aiConversation",
      ];

      for (const entity of forbiddenDomainEntities) {
        expect(
          (schema as Record<string, unknown>)[entity],
          `Domain entity '${entity}' must NOT be defined in Phase 1 database schema (violates vertical-slice rule).`
        ).toBeUndefined();
      }
    });
  });
});
