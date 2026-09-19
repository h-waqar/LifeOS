// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { dailyPlans, eveningReviews } from "@/server/db/schema";
import { auth } from "@/server/auth";
import { eq } from "drizzle-orm";

describe("Phase 2 Plan 02-05: Daily Plan Schema Invariants & Isolation (Integration)", () => {
  let probe: ProbeResult;

  const testUserData = {
    email: "p02_dp_iso_user@example.com",
    password: "Plan02DpPassword123!",
    name: "DP Isolation User",
  };

  let testUserId: string;
  const foreignUserId = "foreign_user_" + crypto.randomUUID().slice(0, 8);
  const foreignPlanId = "foreign_plan_" + crypto.randomUUID().slice(0, 8);

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    await db.delete(user);

    // Create Test User
    const res = await auth.api.signUpEmail({
      body: testUserData,
      asResponse: true,
    });
    expect(res.status).toBe(200);

    const [u] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testUserData.email));
    testUserId = u.id;
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await db.delete(user);
      await closeDatabase();
    }
  });

  it("1. Enforces uniqueness on (user_id, date) for daily_plans", async () => {
    const date = "2026-10-10";

    await db.insert(dailyPlans).values({
      userId: testUserId,
      date,
      status: "in_progress",
    });

    // Attempting to insert a second daily plan for the same user on the same date MUST fail
    await expect(
      db.insert(dailyPlans).values({
        userId: testUserId,
        date,
        status: "completed",
        completedAt: new Date(),
      })
    ).rejects.toThrow();
  });

  it("2. Enforces date format check constraint (YYYY-MM-DD)", async () => {
    await expect(
      db.insert(dailyPlans).values({
        userId: testUserId,
        date: "2026/10/11", // invalid separator
        status: "in_progress",
      })
    ).rejects.toThrow();
  });

  it("3. Enforces completed_at invariant when status = 'completed' on daily_plans", async () => {
    await expect(
      db.insert(dailyPlans).values({
        userId: testUserId,
        date: "2026-10-12",
        status: "completed",
        completedAt: null, // violates invariant
      })
    ).rejects.toThrow();
  });

  it("4. Enforces uniqueness on (user_id, date) for evening_reviews", async () => {
    const date = "2026-10-13";

    await db.insert(eveningReviews).values({
      userId: testUserId,
      date,
      productivityScore: 85,
    });

    // Second review for the same user on the same date must fail
    await expect(
      db.insert(eveningReviews).values({
        userId: testUserId,
        date,
        productivityScore: 90,
      })
    ).rejects.toThrow();
  });

  it("5. Enforces productivity score bounds on evening_reviews (0 to 100)", async () => {
    // Score > 100 fails
    await expect(
      db.insert(eveningReviews).values({
        userId: testUserId,
        date: "2026-10-14",
        productivityScore: 105,
      })
    ).rejects.toThrow();

    // Negative score fails
    await expect(
      db.insert(eveningReviews).values({
        userId: testUserId,
        date: "2026-10-15",
        productivityScore: -5,
      })
    ).rejects.toThrow();
  });

  it("6. Composite FK prevents associating an evening_review with an unowned daily_plan", async () => {
    const date = "2026-10-16";

    // User attempts to link evening review to a foreign/non-existent plan ID: MUST fail
    await expect(
      db.insert(eveningReviews).values({
        userId: testUserId,
        dailyPlanId: foreignPlanId,
        date,
        productivityScore: 80,
      })
    ).rejects.toThrow();
  });
});
