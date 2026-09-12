import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { userPreferences, user } from "@/server/db/schema";
import {
  updatePreferencesSchema,
  getUserPreferences,
  updateUserPreferences,
} from "@/server/preferences/service";
import { AuthorizationError } from "@/server/auth/guard";
import { eq } from "drizzle-orm";

describe("Plan 01-05: Adversarial Preferences Service Boundary & Concurrency", () => {
  let probe: ProbeResult;
  let testUserId: string;

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    testUserId = "user_pref_adv_" + crypto.randomUUID().slice(0, 8);
    // Create base user in PostgreSQL
    await db.insert(user).values({
      id: testUserId,
      name: "Pref Adversarial User",
      email: `${testUserId}@example.com`,
    });
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await db.delete(user).where(eq(user.id, testUserId));
      await closeDatabase();
    }
  });

  describe("updatePreferencesSchema Strictness & Type Confusion", () => {
    it("rejects unknown properties: ownerId, user_id, id, role, admin", () => {
      expect(updatePreferencesSchema.safeParse({ theme: "dark", ownerId: "victim" }).success).toBe(false);
      expect(updatePreferencesSchema.safeParse({ theme: "dark", user_id: "victim" }).success).toBe(false);
      expect(updatePreferencesSchema.safeParse({ theme: "dark", id: "random_id" }).success).toBe(false);
      expect(updatePreferencesSchema.safeParse({ theme: "dark", role: "admin" }).success).toBe(false);
      expect(updatePreferencesSchema.safeParse({ theme: "dark", admin: true }).success).toBe(false);
      expect(updatePreferencesSchema.safeParse({ theme: "dark", singleUserLock: false }).success).toBe(false);
    });

    it("rejects explicit userId in payload", () => {
      const res = updatePreferencesSchema.safeParse({ theme: "dark", userId: "victim" });
      expect(res.success).toBe(false);
    });

    it("rejects whitespace-only dateFormat", () => {
      expect(updatePreferencesSchema.safeParse({ dateFormat: "   " }).success).toBe(false);
      expect(updatePreferencesSchema.safeParse({ dateFormat: "\t\n" }).success).toBe(false);
      expect(updatePreferencesSchema.safeParse({ dateFormat: "" }).success).toBe(false);
    });

    it("accepts valid preferences", () => {
      const res = updatePreferencesSchema.safeParse({
        theme: "light",
        dateFormat: "DD/MM/YYYY",
        timeFormat: "12h",
        workingHoursStart: "08:00",
        workingHoursEnd: "17:00",
      });
      expect(res.success).toBe(true);
    });

    it("rejects non-object types (null, array, string, number, boolean)", () => {
      expect(updatePreferencesSchema.safeParse(null).success).toBe(false);
      expect(updatePreferencesSchema.safeParse([1, 2, 3]).success).toBe(false);
      expect(updatePreferencesSchema.safeParse("string").success).toBe(false);
      expect(updatePreferencesSchema.safeParse(12345).success).toBe(false);
      expect(updatePreferencesSchema.safeParse(true).success).toBe(false);
    });
  });

  describe("Service Identity Parameter Validation", () => {
    it("getUserPreferences fails closed on empty or whitespace user ID", async () => {
      await expect(getUserPreferences("")).rejects.toThrow(AuthorizationError);
      await expect(getUserPreferences("   ")).rejects.toThrow(AuthorizationError);
      await expect(getUserPreferences(null as any)).rejects.toThrow(AuthorizationError);
      await expect(getUserPreferences(undefined as any)).rejects.toThrow(AuthorizationError);
    });

    it("updateUserPreferences fails closed on empty or whitespace user ID", async () => {
      await expect(updateUserPreferences("", { theme: "dark" })).rejects.toThrow(AuthorizationError);
      await expect(updateUserPreferences("   ", { theme: "dark" })).rejects.toThrow(AuthorizationError);
      await expect(updateUserPreferences(null as any, { theme: "dark" })).rejects.toThrow(AuthorizationError);
    });
  });

  describe("Atomic Upsert Concurrency & Race Resistance", () => {
    it("handles concurrent updates simultaneously without 23505 unique_violation", async () => {
      if (!probe.isAvailable) return;

      // Clean preferences for this user first
      await db.delete(userPreferences).where(eq(userPreferences.userId, testUserId));

      const CONCURRENCY = 10;
      let releaseBarrier: () => void;
      const barrier = new Promise<void>((resolve) => {
        releaseBarrier = resolve;
      });

      const promises = Array.from({ length: CONCURRENCY }).map(async (_, idx) => {
        await barrier;
        return updateUserPreferences(testUserId, {
          theme: idx % 2 === 0 ? "dark" : "light",
          timeFormat: idx % 2 === 0 ? "24h" : "12h",
        });
      });

      // Release all concurrent requests into the event loop simultaneously
      releaseBarrier!();

      const results = await Promise.allSettled(promises);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // ALL concurrent operations must succeed due to atomic onConflictDoUpdate
      expect(fulfilled.length).toBe(CONCURRENCY);
      expect(rejected.length).toBe(0);

      // Verify exactly 1 row exists in database for this user
      const dbRows = await db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, testUserId));
      expect(dbRows.length).toBe(1);
    });
  });
});
