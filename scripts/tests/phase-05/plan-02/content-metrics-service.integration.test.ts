// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import {
  contentItems,
  contentPublications,
  contentMetrics,
  auditLog,
} from "@/server/db/schema";
import { auth } from "@/server/auth";
import { eq, and } from "drizzle-orm";
import {
  logMetrics,
  getMetricsHistory,
  getAggregateAnalytics,
} from "@/server/content/metrics-service";
import {
  schedulePublication,
  markAsPublished,
} from "@/server/content/calendar-service";
import { createContentItem } from "@/server/content/service";
import { NotFoundError } from "@/server/content/service";

describe("Phase 5 Plan 05-02: Content Metrics Service (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p05_metrics_service@example.com",
    password: "Plan05MetricsServicePassword123!",
    name: "Metrics Service Tester",
  };

  let testUserId: string;

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    await db.delete(user);

    const res = await auth.api.signUpEmail({
      body: testUser,
      asResponse: true,
    });
    expect(res.status).toBe(200);

    const [u] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testUser.email));
    testUserId = u.id;
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await db.delete(user);
      await closeDatabase();
    }
  });

  it("1. logMetrics: logs snapshot with deterministic engagement rate calculation", async () => {
    if (!probe.isAvailable) return;

    const item = await createContentItem(testUserId, {
      title: "Viral TypeScript Tips",
      contentType: "thread",
      primaryPlatform: "twitter",
    });

    const pub = await schedulePublication(testUserId, item.id, {
      platform: "twitter",
      scheduledFor: "2026-10-10T12:00:00.000Z",
    });

    await markAsPublished(testUserId, pub.id, {
      postUrl: "https://twitter.com/hamza/status/987654321",
    });

    // views: 1000, likes: 50, comments: 20, shares: 15, saves: 10, clicks: 5
    // Total engagements = 100
    // Engagement rate = (100 / 1000) * 100 = 10.00%
    const metric = await logMetrics(testUserId, pub.id, {
      views: 1000,
      likes: 50,
      comments: 20,
      shares: 15,
      saves: 10,
      clicks: 5,
      notes: "24h snapshot",
    });

    expect(metric.id).toBeDefined();
    expect(metric.userId).toBe(testUserId);
    expect(metric.publicationId).toBe(pub.id);
    expect(metric.contentItemId).toBe(item.id);
    expect(metric.views).toBe(1000);
    expect(metric.likes).toBe(50);
    expect(metric.engagementRate).toBe(10.0);
    expect(metric.notes).toBe("24h snapshot");

    // Check audit log entry
    const [log] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.userId, testUserId),
          eq(auditLog.action, "content.log_metrics")
        )
      );
    expect(log).toBeDefined();
  });

  it("2. logMetrics: handles zero views safely without dividing by zero", async () => {
    if (!probe.isAvailable) return;

    const item = await createContentItem(testUserId, {
      title: "Fresh Unviewed Post",
      contentType: "post",
      primaryPlatform: "linkedin",
    });

    const pub = await schedulePublication(testUserId, item.id, {
      platform: "linkedin",
      scheduledFor: "2026-10-11T09:00:00.000Z",
    });

    await markAsPublished(testUserId, pub.id, {});

    const metric = await logMetrics(testUserId, pub.id, {
      views: 0,
      likes: 0,
      comments: 0,
    });

    expect(metric.views).toBe(0);
    expect(metric.engagementRate).toBe(0);
  });

  it("3. logMetrics: rejects logging metrics for non-existent publication", async () => {
    if (!probe.isAvailable) return;

    const fakePubId = crypto.randomUUID();
    await expect(
      logMetrics(testUserId, fakePubId, {
        views: 100,
        likes: 10,
      })
    ).rejects.toThrow(NotFoundError);
  });

  it("4. getMetricsHistory: returns snapshots in descending order by recordedAt", async () => {
    if (!probe.isAvailable) return;

    const item = await createContentItem(testUserId, {
      title: "Growing Post",
      contentType: "post",
      primaryPlatform: "twitter",
    });

    const pub = await schedulePublication(testUserId, item.id, {
      platform: "twitter",
      scheduledFor: "2026-10-05T10:00:00.000Z",
    });

    await markAsPublished(testUserId, pub.id, {});

    // First snapshot: 24h
    await logMetrics(testUserId, pub.id, {
      views: 200,
      likes: 10,
      recordedAt: "2026-10-06T10:00:00.000Z",
      notes: "Day 1",
    });

    // Second snapshot: 48h
    await logMetrics(testUserId, pub.id, {
      views: 500,
      likes: 35,
      recordedAt: "2026-10-07T10:00:00.000Z",
      notes: "Day 2",
    });

    const history = await getMetricsHistory(testUserId, pub.id);
    expect(history.length).toBe(2);
    expect(history[0].views).toBe(500); // More recent first
    expect(history[1].views).toBe(200);
  });

  it("5. getAggregateAnalytics: calculates totals, platform breakdown, and top leaderboard", async () => {
    if (!probe.isAvailable) return;

    // Create a blog post
    const blogItem = await createContentItem(testUserId, {
      title: "Deep Dive Architecture",
      contentType: "article",
      primaryPlatform: "blog",
    });
    const blogPub = await schedulePublication(testUserId, blogItem.id, {
      platform: "blog",
      scheduledFor: "2026-10-12T10:00:00.000Z",
    });
    await markAsPublished(testUserId, blogPub.id, {
      publishedAt: "2026-10-12T10:00:00.000Z",
    });
    await logMetrics(testUserId, blogPub.id, {
      views: 2000,
      likes: 80,
      comments: 20,
      clicks: 100, // 200 engagements = 10%
    });

    // Create a LinkedIn post
    const liItem = await createContentItem(testUserId, {
      title: "Lessons From Scaling Teams",
      contentType: "post",
      primaryPlatform: "linkedin",
    });
    const liPub = await schedulePublication(testUserId, liItem.id, {
      platform: "linkedin",
      scheduledFor: "2026-10-14T10:00:00.000Z",
    });
    await markAsPublished(testUserId, liPub.id, {
      publishedAt: "2026-10-14T10:00:00.000Z",
    });
    await logMetrics(testUserId, liPub.id, {
      views: 1000,
      likes: 120,
      comments: 30, // 150 engagements = 15%
    });

    const analytics = await getAggregateAnalytics(testUserId, {
      startDate: "2026-10-01",
      endDate: "2026-10-31",
    });

    expect(analytics.totalViews).toBeGreaterThanOrEqual(3000);
    expect(analytics.totalEngagements).toBeGreaterThanOrEqual(350);
    expect(analytics.averageEngagementRate).toBeGreaterThan(0);
    expect(analytics.publishedCount).toBeGreaterThanOrEqual(2);

    // Platform breakdown
    expect(analytics.channelBreakdown.some((c) => c.platform === "blog")).toBe(true);
    expect(analytics.channelBreakdown.some((c) => c.platform === "linkedin")).toBe(true);

    // Leaderboard
    expect(analytics.leaderboard.length).toBeGreaterThanOrEqual(2);
    // Highest engagement rate post should be first (LinkedIn at 15%)
    expect(analytics.leaderboard[0].title).toBe("Lessons From Scaling Teams");
    expect(analytics.leaderboard[0].engagementRate).toBe(15.0);
  });
});
