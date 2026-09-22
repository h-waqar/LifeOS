// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import {
  contentItems,
  contentVariants,
  contentPublications,
  contentMetrics,
} from "@/server/db/schema";
import { auth } from "@/server/auth";
import { eq, and } from "drizzle-orm";

describe("Phase 5 Plan 05-02: Content Publications & Metrics Schema Isolation (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p05_pub_isolation@example.com",
    password: "Plan05PubPassword123!",
    name: "Publications Isolation Tester",
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

  it("1. Rejects inserting content publication for non-existent user via foreign key", async () => {
    if (!probe.isAvailable) return;

    const fakeUserId = "fake_user_" + crypto.randomUUID().slice(0, 8);

    await expect(
      db.insert(contentPublications).values({
        userId: fakeUserId,
        contentItemId: crypto.randomUUID(),
        platform: "twitter",
        scheduledFor: new Date(),
      })
    ).rejects.toThrow();
  });

  it("2. Rejects cross-tenant publication attachment via composite FK (userId, contentItemId)", async () => {
    if (!probe.isAvailable) return;

    // Create an item belonging to testUserId
    const [item] = await db
      .insert(contentItems)
      .values({
        userId: testUserId,
        title: "Test Item For Isolation",
        contentType: "post",
        primaryPlatform: "twitter",
      })
      .returning();

    // Try to attach a publication with another (fake) userId to testUserId's item
    const otherUserId = "other_user_" + crypto.randomUUID().slice(0, 8);
    await expect(
      db.insert(contentPublications).values({
        userId: otherUserId,
        contentItemId: item.id,
        platform: "twitter",
        scheduledFor: new Date(),
      })
    ).rejects.toThrow();
  });

  it("3. Successfully inserts publication for valid item and user", async () => {
    if (!probe.isAvailable) return;

    const [item] = await db
      .insert(contentItems)
      .values({
        userId: testUserId,
        title: "Valid Scheduled Item",
        contentType: "article",
        primaryPlatform: "blog",
      })
      .returning();

    const [pub] = await db
      .insert(contentPublications)
      .values({
        userId: testUserId,
        contentItemId: item.id,
        platform: "blog",
        scheduledFor: new Date("2026-10-15T14:00:00Z"),
        status: "scheduled",
      })
      .returning();

    expect(pub.id).toBeDefined();
    expect(pub.userId).toBe(testUserId);
    expect(pub.contentItemId).toBe(item.id);
    expect(pub.platform).toBe("blog");
    expect(pub.status).toBe("scheduled");
  });

  it("4. Sets variantId to NULL if variant is deleted (onDelete: set null)", async () => {
    if (!probe.isAvailable) return;

    const [item] = await db
      .insert(contentItems)
      .values({
        userId: testUserId,
        title: "Variant Test Item",
        contentType: "post",
        primaryPlatform: "linkedin",
      })
      .returning();

    const [variant] = await db
      .insert(contentVariants)
      .values({
        userId: testUserId,
        contentItemId: item.id,
        platform: "linkedin",
        body: "LinkedIn variant draft",
      })
      .returning();

    const [pub] = await db
      .insert(contentPublications)
      .values({
        userId: testUserId,
        contentItemId: item.id,
        variantId: variant.id,
        platform: "linkedin",
        scheduledFor: new Date("2026-10-20T10:00:00Z"),
      })
      .returning();

    expect(pub.variantId).toBe(variant.id);

    // Delete variant
    await db.delete(contentVariants).where(eq(contentVariants.id, variant.id));

    // Verify publication still exists but variantId is null
    const [fetched] = await db
      .select()
      .from(contentPublications)
      .where(eq(contentPublications.id, pub.id));

    expect(fetched).toBeDefined();
    expect(fetched.variantId).toBeNull();
  });

  it("5. Rejects metric attachment with invalid composite FK (userId, publicationId)", async () => {
    if (!probe.isAvailable) return;

    const [item] = await db
      .insert(contentItems)
      .values({
        userId: testUserId,
        title: "Metric FK Item",
        contentType: "post",
        primaryPlatform: "twitter",
      })
      .returning();

    const [pub] = await db
      .insert(contentPublications)
      .values({
        userId: testUserId,
        contentItemId: item.id,
        platform: "twitter",
        scheduledFor: new Date(),
      })
      .returning();

    // Wrong user ID on metrics referencing pub.id
    const fakeUserId = "fake_user_" + crypto.randomUUID().slice(0, 8);
    await expect(
      db.insert(contentMetrics).values({
        userId: fakeUserId,
        publicationId: pub.id,
        contentItemId: item.id,
        views: 100,
        likes: 10,
        engagementRate: "10.00",
      })
    ).rejects.toThrow();
  });

  it("6. Cascades delete from content item to publications and metrics", async () => {
    if (!probe.isAvailable) return;

    const [item] = await db
      .insert(contentItems)
      .values({
        userId: testUserId,
        title: "Cascade Test Item",
        contentType: "thread",
        primaryPlatform: "twitter",
      })
      .returning();

    const [pub] = await db
      .insert(contentPublications)
      .values({
        userId: testUserId,
        contentItemId: item.id,
        platform: "twitter",
        scheduledFor: new Date(),
        status: "published",
      })
      .returning();

    const [metric] = await db
      .insert(contentMetrics)
      .values({
        userId: testUserId,
        publicationId: pub.id,
        contentItemId: item.id,
        views: 500,
        likes: 50,
        comments: 10,
        shares: 5,
        engagementRate: "13.00",
      })
      .returning();

    expect(metric.id).toBeDefined();

    // Delete content item
    await db.delete(contentItems).where(eq(contentItems.id, item.id));

    // Publications should be gone
    const pubs = await db
      .select()
      .from(contentPublications)
      .where(eq(contentPublications.id, pub.id));
    expect(pubs.length).toBe(0);

    // Metrics should be gone
    const metrics = await db
      .select()
      .from(contentMetrics)
      .where(eq(contentMetrics.id, metric.id));
    expect(metrics.length).toBe(0);
  });

  it("7. Enforces platform check constraint on contentPublications", async () => {
    if (!probe.isAvailable) return;

    const [item] = await db
      .insert(contentItems)
      .values({
        userId: testUserId,
        title: "Constraint Test Item",
        contentType: "post",
        primaryPlatform: "linkedin",
      })
      .returning();

    await expect(
      db.insert(contentPublications).values({
        userId: testUserId,
        contentItemId: item.id,
        platform: "invalid_social_network" as any,
        scheduledFor: new Date(),
      })
    ).rejects.toThrow();
  });

  it("8. Enforces status check constraint on contentPublications", async () => {
    if (!probe.isAvailable) return;

    const [item] = await db
      .insert(contentItems)
      .values({
        userId: testUserId,
        title: "Status Constraint Test Item",
        contentType: "post",
        primaryPlatform: "linkedin",
      })
      .returning();

    await expect(
      db.insert(contentPublications).values({
        userId: testUserId,
        contentItemId: item.id,
        platform: "linkedin",
        status: "flying_to_mars" as any,
        scheduledFor: new Date(),
      })
    ).rejects.toThrow();
  });

  it("9. Enforces non-negative metric check constraints on contentMetrics", async () => {
    if (!probe.isAvailable) return;

    const [item] = await db
      .insert(contentItems)
      .values({
        userId: testUserId,
        title: "Metrics Negative Check Item",
        contentType: "post",
        primaryPlatform: "twitter",
      })
      .returning();

    const [pub] = await db
      .insert(contentPublications)
      .values({
        userId: testUserId,
        contentItemId: item.id,
        platform: "twitter",
        scheduledFor: new Date(),
      })
      .returning();

    await expect(
      db.insert(contentMetrics).values({
        userId: testUserId,
        publicationId: pub.id,
        contentItemId: item.id,
        views: -50,
        likes: 10,
        engagementRate: "0.00",
      })
    ).rejects.toThrow();
  });
});
