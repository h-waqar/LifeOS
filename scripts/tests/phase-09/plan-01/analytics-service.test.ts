// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import {
  user,
  tasks,
  projects,
  goals,
  habits,
  habitEntries,
  timeBlocks,
  eveningReviews,
  analyticsSnapshots,
} from "@/server/db/schema";
import { auth } from "@/server/auth";
import { eq, and } from "drizzle-orm";
import {
  resolveDateRanges,
  getAnalyticsDashboard,
  getScheduleRecommendations,
  saveAnalyticsSnapshot,
  getHistoricalSnapshots,
} from "@/server/analytics/service";

const probe: ProbeResult = await probeDatabase();

describe("Plan 09-01: Analytics Service Layer & Cross-Domain Aggregation", () => {
  describe("1. Date Range Resolution (Unit Tests)", () => {
    it("resolves 7d range with equal previous window", () => {
      const res = resolveDateRanges({ period: "7d" });
      expect(res.periodType).toBe("7d");
      expect(res.daysCount).toBe(7);
      expect(res.startDate).toBeDefined();
      expect(res.endDate).toBeDefined();
      expect(res.previousStartDate).toBeDefined();
      expect(res.previousEndDate).toBeDefined();
    });

    it("resolves 30d range with 30 days count", () => {
      const res = resolveDateRanges({ period: "30d" });
      expect(res.daysCount).toBe(30);
    });

    it("resolves 90d range with 90 days count", () => {
      const res = resolveDateRanges({ period: "90d" });
      expect(res.daysCount).toBe(90);
    });

    it("resolves custom date range accurately", () => {
      const res = resolveDateRanges({
        period: "custom",
        startDate: "2026-09-01",
        endDate: "2026-09-10",
      });
      expect(res.periodType).toBe("custom");
      expect(res.startDate).toBe("2026-09-01");
      expect(res.endDate).toBe("2026-09-10");
      expect(res.daysCount).toBe(10);
      expect(res.previousEndDate).toBe("2026-08-31");
      expect(res.previousStartDate).toBe("2026-08-22");
    });
  });

  describe.skipIf(!probe.isAvailable)("2. Live Database Integration & User Isolation", () => {
    let userAId: string;
    let userBId = "user_b_test_isolation_id";

    beforeAll(async () => {
      if (!probe.isAvailable) return;

      const existingUsers = await db.select({ id: user.id }).from(user).limit(1);
      if (existingUsers.length > 0) {
        userAId = existingUsers[0].id;
      } else {
        await auth.api.signUpEmail({
          body: {
            email: "p09_analytics_tester@example.com",
            password: "Plan09Password123!",
            name: "Plan 09 Tester",
          },
          asResponse: true,
        });
        const [u] = await db.select({ id: user.id }).from(user).limit(1);
        userAId = u.id;
      }

      // Seed test records for User A
      await db.insert(tasks).values([
        {
          id: "t_user_a_1",
          userId: userAId,
          title: "User A Task 1",
          status: "completed",
          priority: "high",
          energyLevel: "high",
          estimatedDuration: 60,
          actualDuration: 60,
          completedAt: new Date(),
        },
      ]);

      await db.insert(goals).values([
        {
          id: "g_user_a_1",
          userId: userAId,
          title: "User A Goal 1",
          horizon: "short_term",
          area: "career",
          status: "in_progress",
          progress: 75,
        },
      ]);
    });

    afterAll(async () => {
      if (probe?.isAvailable && userAId) {
        await db.delete(tasks).where(eq(tasks.id, "t_user_a_1"));
        await db.delete(goals).where(eq(goals.id, "g_user_a_1"));
        await db.delete(analyticsSnapshots).where(eq(analyticsSnapshots.userId, userAId));
        await closeDatabase();
      }
    });

    it("aggregates User A's data into Dashboard DTO", async () => {
      const dashboard = await getAnalyticsDashboard(userAId, { period: "30d" });
      expect(dashboard).toBeDefined();
      expect(dashboard.period.daysCount).toBe(30);
      expect(dashboard.projectVelocity.tasksCompletedCount).toBeGreaterThanOrEqual(1);
      expect(dashboard.goalProgress.totalGoalsCount).toBeGreaterThanOrEqual(1);
      expect(dashboard.scheduleOptimization).toBeDefined();
      expect(dashboard.scheduleOptimization.peakFocusWindow).toBeDefined();
    });

    it("strictly isolates user data: User B cannot see User A's tasks or goals", async () => {
      const dashboardUserB = await getAnalyticsDashboard(userBId, { period: "30d" });
      // User B should have 0 completed tasks and 0 goals
      expect(dashboardUserB.projectVelocity.tasksCompletedCount).toBe(0);
      expect(dashboardUserB.goalProgress.totalGoalsCount).toBe(0);
      expect(dashboardUserB.timeAllocation.totalCompletedMinutes).toBe(0);
    });

    it("generates schedule recommendations for user", async () => {
      const recs = await getScheduleRecommendations(userAId);
      expect(recs.peakFocusWindow).toBeDefined();
      expect(recs.energyTiers).toHaveLength(3);
      expect(recs.actionableRecommendations.length).toBeGreaterThanOrEqual(3);
    });

    it("saves and retrieves analytics snapshots", async () => {
      const snapshot = await saveAnalyticsSnapshot(userAId, {
        periodType: "30d",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        metrics: { testMetric: 42, score: 95 },
      });

      expect(snapshot).toBeDefined();
      expect(snapshot.id).toBeDefined();
      expect(snapshot.userId).toBe(userAId);
      expect(snapshot.periodType).toBe("30d");

      const snapshots = await getHistoricalSnapshots(userAId, "30d");
      expect(snapshots.length).toBeGreaterThanOrEqual(1);
      expect(snapshots[0].metrics).toEqual({ testMetric: 42, score: 95 });
    });
  });
});
